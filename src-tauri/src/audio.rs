//! Low-latency output: a tiny software mixer running inside the cpal callback.
//! Voices are pushed under a short lock; the callback mixes, pans and resamples
//! (bank rate -> device rate, plus per-hit pitch jitter) in one pass.
//!
//! The stream is rebuilt when the default output device changes (headphones
//! plugged in, Bluetooth connects) or the device errors out.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SizedSample};
use parking_lot::Mutex;

use crate::synth::{Buf, SR};

const MAX_VOICES: usize = 48;

struct Voice {
    buf: Buf,
    pos: f64,
    rate: f64,
    gl: f32,
    gr: f32,
}

#[derive(Clone)]
pub struct Audio {
    voices: Arc<Mutex<Vec<Voice>>>,
}

impl Audio {
    pub fn start() -> Self {
        let voices = Arc::new(Mutex::new(Vec::with_capacity(MAX_VOICES)));
        let v = voices.clone();
        thread::Builder::new()
            .name("keybuddy-audio".into())
            .spawn(move || run(v))
            .expect("spawn audio thread");
        Self { voices }
    }

    /// `pan` in -1..1, `rate` ~1.0 (pitch jitter).
    pub fn play(&self, buf: Buf, gain: f32, pan: f32, rate: f32) {
        let theta = (pan.clamp(-1.0, 1.0) + 1.0) * std::f32::consts::FRAC_PI_4;
        let (s, c) = theta.sin_cos();
        let k = gain * std::f32::consts::SQRT_2;
        let mut v = self.voices.lock();
        if v.len() >= MAX_VOICES {
            v.remove(0);
        }
        v.push(Voice { buf, pos: 0.0, rate: rate as f64, gl: c * k, gr: s * k });
    }
}

fn run(voices: Arc<Mutex<Vec<Voice>>>) {
    let host = cpal::default_host();
    loop {
        let failed = Arc::new(AtomicBool::new(false));
        match open(&host, voices.clone(), failed.clone()) {
            Ok((stream, name)) => {
                // Watch for device changes; dropping `stream` closes it.
                while !failed.load(Ordering::Relaxed) && default_name(&host) == name {
                    thread::sleep(Duration::from_millis(1500));
                }
                drop(stream);
            }
            Err(e) => {
                eprintln!("keybuddy: audio unavailable: {e}");
                thread::sleep(Duration::from_secs(3));
            }
        }
    }
}

fn default_name(host: &cpal::Host) -> Option<String> {
    host.default_output_device().and_then(|d| d.name().ok())
}

fn open(
    host: &cpal::Host,
    voices: Arc<Mutex<Vec<Voice>>>,
    failed: Arc<AtomicBool>,
) -> Result<(cpal::Stream, Option<String>), String> {
    let device = host.default_output_device().ok_or("no output device")?;
    let name = device.name().ok();
    let supported = device.default_output_config().map_err(|e| e.to_string())?;
    let format = supported.sample_format();
    let mut config: cpal::StreamConfig = supported.config();
    // Small buffers keep key-to-ear latency to a few ms.
    if let cpal::SupportedBufferSize::Range { min, max } = supported.buffer_size() {
        config.buffer_size = cpal::BufferSize::Fixed(256.clamp(*min, *max));
    }
    let try_build = |config: &cpal::StreamConfig| {
        let (v, f) = (voices.clone(), failed.clone());
        match format {
            cpal::SampleFormat::F32 => build::<f32>(&device, config, v, f),
            cpal::SampleFormat::I16 => build::<i16>(&device, config, v, f),
            cpal::SampleFormat::U16 => build::<u16>(&device, config, v, f),
            cpal::SampleFormat::I32 => build::<i32>(&device, config, v, f),
            other => Err(format!("unsupported sample format {other}")),
        }
    };
    let stream = try_build(&config).or_else(|_| {
        // Some drivers reject fixed buffer sizes; fall back to the default.
        config.buffer_size = cpal::BufferSize::Default;
        try_build(&config)
    })?;
    stream.play().map_err(|e| e.to_string())?;
    Ok((stream, name))
}

fn build<T: SizedSample + FromSample<f32>>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    voices: Arc<Mutex<Vec<Voice>>>,
    failed: Arc<AtomicBool>,
) -> Result<cpal::Stream, String> {
    let channels = config.channels as usize;
    let step = SR as f64 / config.sample_rate.0 as f64;
    let mut mix: Vec<[f32; 2]> = Vec::new();
    device
        .build_output_stream(
            config,
            move |out: &mut [T], _: &cpal::OutputCallbackInfo| {
                let frames = out.len() / channels;
                mix.clear();
                mix.resize(frames, [0.0; 2]);
                {
                    let mut vs = voices.lock();
                    vs.retain_mut(|v| {
                        let len = v.buf.len();
                        for f in mix.iter_mut() {
                            let i = v.pos as usize;
                            if i + 1 >= len {
                                return false;
                            }
                            let frac = (v.pos - i as f64) as f32;
                            let s = v.buf[i] + (v.buf[i + 1] - v.buf[i]) * frac;
                            f[0] += s * v.gl;
                            f[1] += s * v.gr;
                            v.pos += v.rate * step;
                        }
                        true
                    });
                }
                for (frame, m) in out.chunks_mut(channels).zip(mix.iter()) {
                    for (ch, sample) in frame.iter_mut().enumerate() {
                        let x = if channels == 1 { (m[0] + m[1]) * 0.5 } else { m[ch.min(1)] };
                        *sample = T::from_sample(soft_clip(x));
                    }
                }
            },
            move |e| {
                eprintln!("keybuddy: audio stream error: {e}");
                failed.store(true, Ordering::Relaxed);
            },
            None,
        )
        .map_err(|e| e.to_string())
}

fn soft_clip(x: f32) -> f32 {
    if x.abs() < 0.8 { x } else { x.signum() * (0.8 + 0.2 * ((x.abs() - 0.8) / 0.2).tanh()) }
}
