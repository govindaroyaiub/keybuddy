//! "Record my keyboard": captures the microphone while the key hook logs
//! every press/release, then cuts the recording into a sound pack.
//!
//! Because we know exactly which key moved and when, every hit is labeled
//! for free: space sounds come from the space bar, releases from key-ups.
//! The only unknown is mic latency, which we measure from the data itself
//! (median offset between key events and audio onsets) and then re-slice.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SizedSample};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::keymap::{self, KeyClass};
use crate::packs::{Entry, SR};

const MAX_SECONDS: usize = 240;
const FRAME: usize = 48; // 1 ms at 48 kHz

pub struct Recorder {
    buf: Arc<Mutex<Vec<f32>>>,
    rate: u32,
    level: Arc<AtomicU32>,
    stop: Arc<AtomicBool>,
    events: Mutex<Vec<(u16, bool, usize)>>,
    started: Instant,
    pub device: String,
}

#[derive(Serialize, Default)]
pub struct Status {
    pub level: f32,
    pub seconds: f32,
    pub normal: usize,
    pub space: usize,
    pub enter: usize,
    pub back: usize,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Summary {
    pub normal: usize,
    pub modifier: usize,
    pub space: usize,
    pub enter: usize,
    pub back: usize,
    pub release: usize,
}

impl Recorder {
    pub fn start() -> Result<Arc<Self>, String> {
        let buf = Arc::new(Mutex::new(Vec::<f32>::with_capacity(48_000 * 60)));
        let level = Arc::new(AtomicU32::new(0));
        let stop = Arc::new(AtomicBool::new(false));
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(u32, String), String>>();
        {
            let (buf, level, stop) = (buf.clone(), level.clone(), stop.clone());
            thread::Builder::new()
                .name("keybuddy-mic".into())
                .spawn(move || {
                    // cpal streams aren't Send everywhere: own it on this thread.
                    match open_input(buf, level) {
                        Ok((stream, rate, name)) => {
                            let _ = ready_tx.send(Ok((rate, name)));
                            while !stop.load(Ordering::Relaxed) {
                                thread::sleep(Duration::from_millis(50));
                            }
                            drop(stream);
                        }
                        Err(e) => {
                            let _ = ready_tx.send(Err(e));
                        }
                    }
                })
                .map_err(|e| e.to_string())?;
        }
        let (rate, device) = ready_rx
            .recv_timeout(Duration::from_secs(10))
            .map_err(|_| "Microphone didn't respond".to_string())??;
        Ok(Arc::new(Self {
            buf,
            rate,
            level,
            stop,
            events: Mutex::new(Vec::new()),
            started: Instant::now(),
            device,
        }))
    }

    pub fn on_key(&self, code: u16, down: bool) {
        let pos = self.buf.lock().len();
        self.events.lock().push((code, down, pos));
    }

    pub fn status(&self) -> Status {
        let mut s = Status {
            level: f32::from_bits(self.level.load(Ordering::Relaxed)),
            seconds: self.started.elapsed().as_secs_f32(),
            ..Default::default()
        };
        for &(code, down, _) in self.events.lock().iter() {
            if !down {
                continue;
            }
            match keymap::info(code).class {
                KeyClass::Space => s.space += 1,
                KeyClass::Enter => s.enter += 1,
                KeyClass::Back => s.back += 1,
                _ => s.normal += 1,
            }
        }
        s
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }

    /// Stops recording and turns it into pack entries.
    pub fn finish(&self) -> Result<(Vec<Entry>, Summary), String> {
        self.stop();
        thread::sleep(Duration::from_millis(120)); // let the last buffer land
        let raw = std::mem::take(&mut *self.buf.lock());
        let events = std::mem::take(&mut *self.events.lock());
        let k = SR as f64 / self.rate as f64;
        let samples = resample(&raw, k);
        let events: Vec<_> = events.into_iter().map(|(c, d, p)| (c, d, (p as f64 * k) as usize)).collect();
        build_pack(&samples, &events)
    }
}

impl Drop for Recorder {
    fn drop(&mut self) {
        self.stop();
    }
}

fn open_input(
    buf: Arc<Mutex<Vec<f32>>>,
    level: Arc<AtomicU32>,
) -> Result<(cpal::Stream, u32, String), String> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or("No microphone found")?;
    let name = device.name().unwrap_or_else(|_| "Microphone".into());
    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    let config: cpal::StreamConfig = supported.config();
    let rate = config.sample_rate.0;
    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => build::<f32>(&device, &config, buf, level),
        cpal::SampleFormat::I16 => build::<i16>(&device, &config, buf, level),
        cpal::SampleFormat::U16 => build::<u16>(&device, &config, buf, level),
        cpal::SampleFormat::I32 => build::<i32>(&device, &config, buf, level),
        other => Err(format!("Unsupported mic format {other}")),
    }?;
    stream.play().map_err(|e| e.to_string())?;
    Ok((stream, rate, name))
}

fn build<T: SizedSample>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    buf: Arc<Mutex<Vec<f32>>>,
    level: Arc<AtomicU32>,
) -> Result<cpal::Stream, String>
where
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    let cap = config.sample_rate.0 as usize * MAX_SECONDS;
    let mut meter = 0.0f32;
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let mut b = buf.lock();
                for frame in data.chunks(channels) {
                    let s = frame.iter().map(|x| <f32 as FromSample<T>>::from_sample_(*x)).sum::<f32>() / channels as f32;
                    meter = (meter * 0.9995).max(s.abs());
                    if b.len() < cap {
                        b.push(s);
                    }
                }
                level.store(meter.to_bits(), Ordering::Relaxed);
            },
            |e| eprintln!("keybuddy: mic error: {e}"),
            None,
        )
        .map_err(|e| e.to_string())
}

fn resample(x: &[f32], k: f64) -> Vec<f32> {
    if (k - 1.0).abs() < 1e-9 || x.len() < 2 {
        return x.to_vec();
    }
    let n = ((x.len() - 1) as f64 * k) as usize;
    (0..n)
        .map(|i| {
            let p = i as f64 / k;
            let j = p as usize;
            let f = (p - j as f64) as f32;
            x[j] + (x[(j + 1).min(x.len() - 1)] - x[j]) * f
        })
        .collect()
}

fn highpass(x: &[f32]) -> Vec<f32> {
    let rc = 1.0 / (2.0 * std::f32::consts::PI * 60.0);
    let k = rc / (rc + 1.0 / SR);
    let (mut px, mut py) = (0.0, 0.0);
    x.iter()
        .map(|&s| {
            py = k * (py + s - px);
            px = s;
            py
        })
        .collect()
}

fn envelope(x: &[f32]) -> Vec<f32> {
    x.chunks_exact(FRAME)
        .map(|c| (c.iter().map(|v| v * v).sum::<f32>() / FRAME as f32).sqrt())
        .collect()
}

/// Finds the strongest attack in env[from..to] and walks back to where it starts.
fn detect(env: &[f32], floor: f32, from: isize, to: isize) -> Option<usize> {
    let lo = from.max(6) as usize;
    let hi = (to.max(0) as usize).min(env.len());
    if lo >= hi {
        return None;
    }
    let mut best = (0.0f32, 0usize);
    for i in lo..hi {
        let prev = env[i - 6..i].iter().sum::<f32>() / 6.0;
        let jump = env[i] - prev;
        if jump > best.0 {
            best = (jump, i);
        }
    }
    let (jump, mut j) = best;
    if jump < floor * 5.0 {
        return None;
    }
    while j > lo && env[j - 1] < env[j] && env[j - 1] > floor * 2.0 {
        j -= 1;
    }
    Some(j)
}

fn build_pack(samples: &[f32], events: &[(u16, bool, usize)]) -> Result<(Vec<Entry>, Summary), String> {
    let x = highpass(samples);
    let env = envelope(&x);
    if env.len() < 500 {
        return Err("Recording was too short.".into());
    }
    let mut sorted = env.clone();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let floor = sorted[sorted.len() / 5].max(1e-5);

    // Pass 1: wide search to learn the mic's latency.
    let mut offsets: Vec<isize> = events
        .iter()
        .filter(|e| e.1)
        .filter_map(|&(_, _, pos)| {
            let ef = (pos / FRAME) as isize;
            detect(&env, floor, ef - 20, ef + 150).map(|o| o as isize - ef)
        })
        .collect();
    if offsets.len() < 5 {
        return Err("Couldn't hear the keys. Move the mic closer to the keyboard and try again.".into());
    }
    offsets.sort();
    let lag = offsets[offsets.len() / 2];

    // Pass 2: narrow search around the measured latency, one hit per event.
    let mut groups: [[Vec<Vec<f32>>; 5]; 2] = Default::default();
    for (n, &(code, down, pos)) in events.iter().enumerate() {
        let crowded = events.iter().enumerate().any(|(m, e)| {
            m != n && (e.2 as isize - pos as isize).unsigned_abs() < 35 * FRAME
        });
        if crowded {
            continue; // two keys at once: the hit would be a blend
        }
        let ef = (pos / FRAME) as isize;
        let Some(onset) = detect(&env, floor, ef + lag - 15, ef + lag + 30) else { continue };
        let next = events
            .iter()
            .map(|e| (e.2 / FRAME) as isize + lag - 15)
            .filter(|&f| f > onset as isize + 5)
            .min()
            .unwrap_or(env.len() as isize) as usize;
        let end = next.min(onset + 150).min(env.len());
        let peak_env = env[onset..end].iter().cloned().fold(0.0, f32::max);
        if peak_env < floor * 6.0 {
            continue;
        }
        let mut tail = end;
        for f in onset + 10..end {
            if env[f] < peak_env * 0.016 {
                tail = f;
                break;
            }
        }
        let start = (onset * FRAME).saturating_sub(72);
        let stop = (tail.max(onset + 20) * FRAME).min(x.len());
        let seg = &x[start..stop];
        if seg.iter().any(|s| s.abs() > 0.98) {
            continue; // clipped
        }
        let class = keymap::info(code).class as usize;
        groups[if down { 0 } else { 1 }][class].push(seg.to_vec());
    }

    let [mut press, mut release] = groups;
    // Typing capitals gives modifier takes; otherwise borrow normals.
    let normal_count = press[0].len();
    if normal_count < 5 {
        return Err("Not enough clean key presses. Type a little slower and try again.".into());
    }
    let summary = Summary {
        normal: normal_count.min(24),
        modifier: press[1].len().min(8),
        space: press[2].len().min(8),
        enter: press[3].len().min(8),
        back: press[4].len().min(8),
        release: release.iter().map(|r| r.len()).sum::<usize>().min(40),
    };

    let mut entries = Vec::new();
    for (class, takes) in press.iter_mut().enumerate() {
        let (limit, target) = match class {
            0 => (24, 0.61),
            1 => (8, 0.52),
            _ => (8, 0.67),
        };
        let source = if takes.len() >= 3 || class == 0 { std::mem::take(takes) } else { pick(&press_clone(&entries), 0) };
        let picked = pick(&source, limit);
        let g = group_gain(&picked, target);
        for t in picked {
            entries.push((0, class as u8, normalize(t, g)));
        }
    }
    let fallback_rel: Vec<Vec<f32>> = release.iter().flatten().cloned().collect();
    for (class, takes) in release.iter_mut().enumerate() {
        let source = if takes.len() >= 3 { std::mem::take(takes) } else { fallback_rel.clone() };
        let picked = pick(&source, 12);
        let g = group_gain(&picked, 0.23);
        for t in picked {
            entries.push((1, class as u8, normalize(t, g)));
        }
    }
    Ok((entries, summary))
}

/// Normal press takes already chosen (used to fill classes the user skipped).
fn press_clone(entries: &[Entry]) -> Vec<Vec<f32>> {
    entries.iter().filter(|e| e.0 == 0 && e.1 == 0).map(|e| e.2.clone()).collect()
}

/// Up to `n` takes from the typical middle of the loudness range.
fn pick(takes: &[Vec<f32>], n: usize) -> Vec<Vec<f32>> {
    let mut v: Vec<_> = takes.to_vec();
    if n == 0 || v.len() <= n {
        return v;
    }
    let peak = |t: &Vec<f32>| t.iter().fold(0.0f32, |m, s| m.max(s.abs()));
    v.sort_by(|a, b| peak(a).total_cmp(&peak(b)));
    let trim = v.len() / 8;
    let v = &v[trim..v.len() - trim];
    let step = v.len() as f32 / n as f32;
    (0..n).map(|i| v[(i as f32 * step) as usize].clone()).collect()
}

/// One gain for a whole group, putting its median hit at `target`. Softer and
/// harder hits keep their real difference, which the feel setting relies on.
fn group_gain(takes: &[Vec<f32>], target: f32) -> f32 {
    let mut peaks: Vec<f32> = takes.iter().map(|t| t.iter().fold(0.0f32, |m, s| m.max(s.abs()))).collect();
    peaks.sort_by(|a, b| a.total_cmp(b));
    target / peaks.get(peaks.len() / 2).copied().unwrap_or(1.0).max(1e-6)
}

fn normalize(mut t: Vec<f32>, g: f32) -> Vec<f32> {
    let n = t.len();
    let fade = (3 * FRAME).min(n);
    for (i, s) in t.iter_mut().enumerate() {
        *s = (*s * g).clamp(-0.98, 0.98);
        if i < 12 {
            *s *= i as f32 / 12.0;
        }
        if i >= n - fade {
            *s *= (n - i) as f32 / fade as f32;
        }
    }
    t
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Synthetic session: clicks in noise at known times, mic lagging 20 ms.
    #[test]
    fn slices_synthetic_session() {
        let mut rng = 12345u64;
        let mut noise = || {
            rng ^= rng << 13;
            rng ^= rng >> 7;
            rng ^= rng << 17;
            (rng >> 40) as f32 / (1u64 << 24) as f32 * 2.0 - 1.0
        };
        let secs = 20;
        let mut x: Vec<f32> = (0..48_000 * secs).map(|_| noise() * 0.002).collect();
        let mut events = Vec::new();
        let lag = 20 * FRAME;
        let mut t = 48_000 / 2;
        let codes = [30u16, 31, 32, 57, 28, 14, 33, 34];
        let mut i = 0;
        while t < x.len() - 48_000 {
            let code = codes[i % codes.len()];
            events.push((code, true, t));
            events.push((code, false, t + 100 * FRAME));
            for (at, amp) in [(t + lag, 0.5f32), (t + 100 * FRAME + lag, 0.15)] {
                for k in 0..40 * FRAME {
                    let e = (-(k as f32) / (4.0 * FRAME as f32)).exp();
                    x[at + k] += amp * e * noise();
                }
            }
            t += 220 * FRAME;
            i += 1;
        }
        let (entries, summary) = build_pack(&x, &events).expect("pack");
        assert!(summary.normal >= 5, "normals: {}", summary.normal);
        assert!(summary.space >= 3 && summary.enter >= 3 && summary.back >= 3);
        assert!(summary.release > 0);
        for class in 0..5u8 {
            assert!(entries.iter().any(|e| e.0 == 0 && e.1 == class), "press class {class}");
        }
        assert!(entries.iter().all(|e| e.2.iter().all(|s| s.is_finite() && s.abs() <= 1.0)));
    }
}
