//! Glue between the keyboard hook, the sound banks and the mixer, plus the
//! small bits of persistent state (settings, typing stats).

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};

use crate::audio::Audio;
use crate::keymap::{self, KeyClass};
use crate::synth::{self, Bank, Rng};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub enabled: bool,
    /// 0.0 ..= 1.0
    pub volume: f32,
    pub pack: String,
    pub key_up: bool,
    pub stereo: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { enabled: true, volume: 0.6, pack: synth::DEFAULT_PACK.into(), key_up: true, stereo: true }
    }
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Stats {
    pub day: u64,
    pub today: u64,
    pub total: u64,
    pub best_today: u32,
    pub best_ever: u32,
    #[serde(skip)]
    recent: VecDeque<Instant>,
}

#[derive(Serialize)]
pub struct StatsView {
    pub today: u64,
    pub total: u64,
    pub wpm: u32,
    pub best_today: u32,
    pub best_ever: u32,
}

const WPM_WINDOW: Duration = Duration::from_secs(8);

fn today() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() / 86_400).unwrap_or(0)
}

impl Stats {
    fn roll_day(&mut self) {
        let d = today();
        if d != self.day {
            self.day = d;
            self.today = 0;
            self.best_today = 0;
        }
    }

    fn press(&mut self, counts_as_char: bool) {
        self.roll_day();
        self.today += 1;
        self.total += 1;
        if counts_as_char {
            let now = Instant::now();
            self.recent.push_back(now);
            self.trim(now);
            // Only trust a speed once there's a real burst of typing.
            if self.recent.len() >= 12 {
                let w = self.wpm_now();
                self.best_today = self.best_today.max(w);
                self.best_ever = self.best_ever.max(w);
            }
        }
    }

    fn trim(&mut self, now: Instant) {
        while self.recent.front().is_some_and(|t| now.duration_since(*t) > WPM_WINDOW) {
            self.recent.pop_front();
        }
    }

    fn wpm_now(&self) -> u32 {
        // 5 characters per word.
        (self.recent.len() as f32 / 5.0 * 60.0 / WPM_WINDOW.as_secs_f32()).round() as u32
    }

    pub fn view(&mut self) -> StatsView {
        self.roll_day();
        self.trim(Instant::now());
        StatsView {
            today: self.today,
            total: self.total,
            wpm: self.wpm_now(),
            best_today: self.best_today,
            best_ever: self.best_ever,
        }
    }
}

pub struct Engine {
    pub settings: RwLock<Settings>,
    pub stats: Mutex<Stats>,
    bank: RwLock<Arc<Bank>>,
    banks: Mutex<HashMap<String, Arc<Bank>>>,
    audio: Audio,
    rng: Mutex<Rng>,
    dir: PathBuf,
}

impl Engine {
    pub fn new(dir: PathBuf) -> Arc<Self> {
        let _ = std::fs::create_dir_all(&dir);
        let settings: Settings = load(&dir.join("settings.json"));
        let stats: Stats = load(&dir.join("stats.json"));
        let seed = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(7);
        let engine = Arc::new(Self {
            bank: RwLock::new(Arc::new(synth::build(&settings.pack))),
            settings: RwLock::new(settings),
            stats: Mutex::new(stats),
            banks: Mutex::new(HashMap::new()),
            audio: Audio::start(),
            rng: Mutex::new(Rng(seed | 1)),
            dir,
        });
        let pack = engine.settings.read().pack.clone();
        engine.banks.lock().insert(pack, engine.bank.read().clone());
        engine
    }

    pub fn is_first_run(&self) -> bool {
        !self.dir.join("settings.json").exists()
    }

    fn bank_for(&self, pack: &str) -> Arc<Bank> {
        if let Some(b) = self.banks.lock().get(pack) {
            return b.clone();
        }
        let b = Arc::new(synth::build(pack));
        self.banks.lock().insert(pack.to_string(), b.clone());
        b
    }

    pub fn apply(&self, mut next: Settings) {
        if !synth::PACKS.iter().any(|p| p.id == next.pack) {
            next.pack = synth::DEFAULT_PACK.into();
        }
        next.volume = next.volume.clamp(0.0, 1.0);
        if next.pack != self.settings.read().pack {
            *self.bank.write() = self.bank_for(&next.pack);
        }
        *self.settings.write() = next;
        self.save_settings();
    }

    pub fn on_key(&self, code: u16, down: bool) {
        let info = keymap::info(code);
        if down {
            self.stats.lock().press(info.class == KeyClass::Normal || info.class == KeyClass::Space);
        }
        let (enabled, volume, key_up, stereo) = {
            let s = self.settings.read();
            (s.enabled, s.volume, s.key_up, s.stereo)
        };
        if !enabled || (!down && !key_up) {
            return;
        }
        let bank = self.bank.read().clone();
        self.play(&bank, code, down, volume, stereo);
    }

    fn play(&self, bank: &Bank, code: u16, down: bool, volume: f32, stereo: bool) {
        let info = keymap::info(code);
        let set = if down { &bank.press } else { &bank.release };
        let takes = &set[info.class as usize];
        if takes.is_empty() {
            return;
        }
        // Each key keeps its own take; tiny pitch/level jitter keeps repeats alive.
        let take = (code as usize).wrapping_mul(2_654_435_761) % takes.len();
        let (rate, jitter) = {
            let mut r = self.rng.lock();
            (r.range(0.975, 1.025), r.range(0.88, 1.0))
        };
        let gain = volume * volume * 1.6 * jitter;
        let pan = if stereo { (info.x * 2.0 - 1.0) * 0.7 } else { 0.0 };
        self.audio.play(takes[take].clone(), gain, pan, rate);
    }

    /// Plays a short typing phrase in the given pack, regardless of `enabled`.
    pub fn preview(self: &Arc<Self>, pack: String) {
        let me = self.clone();
        std::thread::spawn(move || {
            let bank = me.bank_for(&pack);
            let (volume, stereo) = {
                let s = me.settings.read();
                (s.volume.max(0.25), s.stereo)
            };
            // "keybuddy" + space + "hi" + enter, with human-ish timing.
            let phrase = [37, 18, 21, 48, 22, 32, 32, 21, 57, 35, 23, 28];
            for code in phrase {
                me.play(&bank, code, true, volume, stereo);
                std::thread::sleep(Duration::from_millis(70));
                me.play(&bank, code, false, volume, stereo);
                std::thread::sleep(Duration::from_millis(45 + (code as u64 * 7) % 40));
            }
        });
    }

    pub fn save_settings(&self) {
        save(&self.dir.join("settings.json"), &*self.settings.read());
    }

    pub fn save_stats(&self) {
        save(&self.dir.join("stats.json"), &*self.stats.lock());
    }
}

fn load<T: Default + for<'de> Deserialize<'de>>(path: &PathBuf) -> T {
    std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save<T: Serialize>(path: &PathBuf, value: &T) {
    if let Ok(json) = serde_json::to_vec_pretty(value) {
        let tmp = path.with_extension("tmp");
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(tmp, path);
        }
    }
}

impl Engine {
    /// Sounds a key as if pressed and released (used by the on-screen keyboard).
    pub fn tap(self: &Arc<Self>, code: u16) {
        let (volume, stereo, key_up) = {
            let s = self.settings.read();
            (s.volume.max(0.25), s.stereo, s.key_up)
        };
        let bank = self.bank.read().clone();
        self.play(&bank, code, true, volume, stereo);
        if key_up {
            let me = self.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(90));
                me.play(&bank, code, false, volume, stereo);
            });
        }
    }
}
