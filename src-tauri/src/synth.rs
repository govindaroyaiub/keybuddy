//! Procedural switch sounds. No sample files: every pack is synthesized at
//! startup from a small physical-ish model of a mechanical key press:
//!
//!   t=0      stem/switch contact  -> short band-passed noise burst ("click")
//!   t=travel bottom-out           -> low-passed noise thud + keycap/case modes
//!   release  top-out              -> quieter, brighter click
//!
//! Each key class (normal, modifier, space, enter, backspace) gets several
//! slightly different "takes" so fast typing never sounds machine-gunned.

use std::f32::consts::PI;
use std::sync::Arc;

use crate::keymap::KeyClass;

pub const SR: f32 = 48_000.0;
pub type Buf = Arc<[f32]>;

const VARIANTS: usize = 10;
const CLASSES: [KeyClass; 5] =
    [KeyClass::Normal, KeyClass::Mod, KeyClass::Space, KeyClass::Enter, KeyClass::Back];

pub struct Bank {
    pub press: [Vec<Buf>; 5],
    pub release: [Vec<Buf>; 5],
}

#[derive(serde::Serialize, Clone, Copy)]
pub struct PackInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub blurb: &'static str,
}

pub const PACKS: &[PackInfo] = &[
    PackInfo { id: "thocky", name: "Thocky", blurb: "Deep, lubed linears in a foam-filled case." },
    PackInfo { id: "clacky", name: "Clacky", blurb: "Bright ABS caps bottoming out on a hollow board." },
    PackInfo { id: "clicky", name: "Clicky", blurb: "Click-jacket switches. Loud, crisp, unapologetic." },
];

pub const DEFAULT_PACK: &str = "thocky";

struct Switch {
    /// Switch contact click: gain, band centre (Hz), Q, decay (s).
    click: (f32, f32, f32, f32),
    /// Delay between click and bottom-out (s).
    travel: f32,
    /// Bottom-out thud: gain, low-pass (Hz), decay (s).
    thud: (f32, f32, f32),
    /// Keycap/case resonances: (Hz, amp, decay s).
    body: &'static [(f32, f32, f32)],
    /// Release: gain, band centre (Hz).
    release: (f32, f32),
    len: f32,
}

const THOCKY: Switch = Switch {
    click: (0.22, 2400.0, 0.8, 0.0012),
    travel: 0.0025,
    thud: (0.95, 650.0, 0.006),
    body: &[(205.0, 1.0, 0.020), (385.0, 0.65, 0.013), (820.0, 0.25, 0.008), (1650.0, 0.1, 0.004)],
    release: (0.22, 3000.0),
    len: 0.10,
};

const CLACKY: Switch = Switch {
    click: (0.5, 4200.0, 1.0, 0.0014),
    travel: 0.003,
    thud: (0.5, 1400.0, 0.003),
    body: &[(540.0, 0.7, 0.012), (1150.0, 0.6, 0.009), (2350.0, 0.45, 0.006), (3600.0, 0.2, 0.004)],
    release: (0.35, 5000.0),
    len: 0.08,
};

const CLICKY: Switch = Switch {
    click: (1.0, 5200.0, 1.5, 0.0018),
    travel: 0.007,
    thud: (0.5, 1200.0, 0.004),
    body: &[(450.0, 0.6, 0.010), (1100.0, 0.5, 0.008), (3000.0, 0.3, 0.004)],
    release: (0.55, 4600.0),
    len: 0.09,
};

pub fn build(id: &str) -> Bank {
    let sw = match id {
        "clacky" => &CLACKY,
        "clicky" => &CLICKY,
        _ => &THOCKY,
    };
    let seed = id.bytes().fold(0x9E37_79B9_7F4A_7C15u64, |h, b| (h ^ b as u64).wrapping_mul(0x100_0000_01B3));
    let mut rng = Rng(seed | 1);
    let mut press: [Vec<Vec<f32>>; 5] = Default::default();
    let mut release: [Vec<Vec<f32>>; 5] = Default::default();
    for class in CLASSES {
        for _ in 0..VARIANTS {
            press[class as usize].push(press_sound(sw, class, &mut rng));
            release[class as usize].push(release_sound(sw, class, &mut rng));
        }
    }
    // Normalize so every pack sits at the same loudness; class ratios survive.
    let peak = press[KeyClass::Normal as usize]
        .iter()
        .flat_map(|b| b.iter())
        .fold(0.0f32, |m, s| m.max(s.abs()))
        .max(1e-6);
    let k = 0.5 / peak;
    let finish = |set: [Vec<Vec<f32>>; 5]| {
        set.map(|v| {
            v.into_iter()
                .map(|mut b| {
                    b.iter_mut().for_each(|s| *s *= k);
                    Buf::from(b)
                })
                .collect()
        })
    };
    Bank { press: finish(press), release: finish(release) }
}

/// (pitch, decay, gain) multipliers per key class. Big keys sound bigger.
fn class_shape(class: KeyClass) -> (f32, f32, f32) {
    match class {
        KeyClass::Normal => (1.0, 1.0, 1.0),
        KeyClass::Mod => (0.95, 1.0, 0.85),
        KeyClass::Space => (0.72, 1.5, 1.1),
        KeyClass::Enter => (0.85, 1.25, 1.1),
        KeyClass::Back => (0.9, 1.15, 1.05),
    }
}

fn press_sound(sw: &Switch, class: KeyClass, rng: &mut Rng) -> Vec<f32> {
    let (cp, cd, cg) = class_shape(class);
    let p = cp * rng.range(0.95, 1.05);
    let d = cd * rng.range(0.88, 1.12);
    let mut buf = vec![0.0; (sw.len * d * SR) as usize];

    let (g, hz, q, tau) = sw.click;
    let (cgain, chz) = (g * cg * rng.range(0.85, 1.1), hz * rng.range(0.9, 1.1));
    noise_burst(&mut buf, rng, 0.0, cgain, tau, Biquad::bandpass(chz, q));

    let at = sw.travel * rng.range(0.85, 1.15);
    let (tg, thz, ttau) = sw.thud;
    noise_burst(&mut buf, rng, at, tg * cg, ttau * d, Biquad::lowpass(thz * p, 0.7));
    for &(hz, amp, tau) in sw.body {
        let (mhz, mamp) = (hz * p * rng.range(0.97, 1.03), amp * cg * rng.range(0.8, 1.1));
        mode(&mut buf, rng, at, mhz, mamp, tau * d);
    }

    if class == KeyClass::Space {
        // Stabilizer rattle: a few tiny wire ticks after bottom-out.
        for _ in 0..3 {
            let t = at + rng.range(0.004, 0.016);
            noise_burst(&mut buf, rng, t, 0.12, 0.0006, Biquad::bandpass(2600.0, 1.2));
        }
    }
    fade_tail(&mut buf);
    buf
}

fn release_sound(sw: &Switch, class: KeyClass, rng: &mut Rng) -> Vec<f32> {
    let (cp, _, cg) = class_shape(class);
    let mut buf = vec![0.0; (0.04 * SR) as usize];
    let (g, hz) = sw.release;
    let rhz = hz * cp * rng.range(0.9, 1.1);
    noise_burst(&mut buf, rng, 0.0, g * cg, 0.001, Biquad::bandpass(rhz, 1.0));
    for &(hz, amp, tau) in sw.body.iter().skip(1) {
        mode(&mut buf, rng, 0.0, hz * cp * 1.25, amp * g * 0.4, tau * 0.5);
    }
    fade_tail(&mut buf);
    buf
}

fn noise_burst(buf: &mut [f32], rng: &mut Rng, start: f32, gain: f32, tau: f32, mut filter: Biquad) {
    let s0 = (start * SR) as usize;
    let n = ((tau * 7.0 * SR) as usize).min(buf.len().saturating_sub(s0));
    for i in 0..n {
        let t = i as f32 / SR;
        let x = rng.noise() * (-t / tau).exp();
        buf[s0 + i] += gain * filter.process(x);
    }
}

fn mode(buf: &mut [f32], rng: &mut Rng, start: f32, hz: f32, amp: f32, tau: f32) {
    let s0 = (start * SR) as usize;
    let n = ((tau * 7.0 * SR) as usize).min(buf.len().saturating_sub(s0));
    let phase = rng.range(0.0, 2.0 * PI);
    let w = 2.0 * PI * hz / SR;
    for i in 0..n {
        let t = i as f32 / SR;
        let attack = (t / 0.0003).min(1.0);
        buf[s0 + i] += amp * attack * (w * i as f32 + phase).sin() * (-t / tau).exp();
    }
}

fn fade_tail(buf: &mut [f32]) {
    let n = ((0.005 * SR) as usize).min(buf.len());
    let len = buf.len();
    for i in 0..n {
        buf[len - n + i] *= 1.0 - i as f32 / n as f32;
    }
}

/// RBJ cookbook biquad.
struct Biquad { b0: f32, b1: f32, b2: f32, a1: f32, a2: f32, z1: f32, z2: f32 }

impl Biquad {
    fn new(b: [f32; 3], a: [f32; 3]) -> Self {
        Self { b0: b[0] / a[0], b1: b[1] / a[0], b2: b[2] / a[0], a1: a[1] / a[0], a2: a[2] / a[0], z1: 0.0, z2: 0.0 }
    }
    fn lowpass(hz: f32, q: f32) -> Self {
        let w = 2.0 * PI * hz.min(SR * 0.45) / SR;
        let (s, c) = w.sin_cos();
        let alpha = s / (2.0 * q);
        Self::new([(1.0 - c) / 2.0, 1.0 - c, (1.0 - c) / 2.0], [1.0 + alpha, -2.0 * c, 1.0 - alpha])
    }
    fn bandpass(hz: f32, q: f32) -> Self {
        let w = 2.0 * PI * hz.min(SR * 0.45) / SR;
        let (s, c) = w.sin_cos();
        let alpha = s / (2.0 * q);
        Self::new([alpha, 0.0, -alpha], [1.0 + alpha, -2.0 * c, 1.0 - alpha])
    }
    fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}

pub struct Rng(pub u64);

impl Rng {
    pub fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    pub fn unit(&mut self) -> f32 {
        (self.next() >> 40) as f32 / (1u64 << 24) as f32
    }
    pub fn range(&mut self, a: f32, b: f32) -> f32 {
        a + (b - a) * self.unit()
    }
    fn noise(&mut self) -> f32 {
        self.unit() * 2.0 - 1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packs_build_normalized_and_finite() {
        for p in PACKS {
            let bank = build(p.id);
            for set in bank.press.iter().chain(bank.release.iter()) {
                assert_eq!(set.len(), VARIANTS);
                for b in set {
                    assert!(!b.is_empty());
                    assert!(b.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
                }
            }
        }
    }
}
