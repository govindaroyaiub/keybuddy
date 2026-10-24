//! Soft <-> hard "feel", matching the website's five levels.
//!
//! A level changes more than volume, so it sounds like pressing softer or
//! harder rather than turning a knob:
//!   * which take plays (softest to hardest real hit, picked by the engine)
//!   * tone: soft is darker and muffled, hard is brighter
//!   * attack: soft rounds off the first few milliseconds of the click
//!   * pitch and level: soft lands a touch lower and quieter
//!
//! Shaping runs once per keypress on a few thousand samples, before the hit
//! reaches the mixer.

use std::f32::consts::PI;

use crate::packs::SR;

pub const LEVELS: [&str; 5] = ["Pillow", "Soft", "Medium", "Firm", "Hard"];

/// Level index (0..=4) for a feel value in 0..=1.
pub fn level_of(h: f32) -> usize {
    (h.clamp(0.0, 1.0) * (LEVELS.len() - 1) as f32).round() as usize
}

/// Feel value for a level index.
pub fn value_of(level: usize) -> f32 {
    level.min(LEVELS.len() - 1) as f32 / (LEVELS.len() - 1) as f32
}

/// Index into `n` takes sorted softest to hardest. Each key keeps its own
/// spot inside a window around the chosen feel, so a key stays recognisable.
pub fn pick(n: usize, h: f32, code: u16) -> usize {
    let span = ((n as f32 * 0.4).round() as usize).max(2);
    let offset = (code as usize).wrapping_mul(2_654_435_761) % span;
    let center = (h * (n.saturating_sub(1)) as f32).round() as isize;
    (center + offset as isize - (span / 2) as isize).clamp(0, n as isize - 1) as usize
}

pub fn rate(h: f32) -> f32 {
    0.95 + 0.08 * h
}

pub fn level(h: f32) -> f32 {
    0.75 + 0.35 * h
}

/// Applies attack, tone and lowpass for feel `h` to one hit.
pub fn shape(input: &[f32], h: f32) -> Vec<f32> {
    let mut shelf = Biquad::high_shelf(3000.0, (h - 0.5) * 14.0);
    let lp_hz = 1600.0 * (20_000.0f32 / 1600.0).powf((h * 2.0).min(1.0));
    let mut lowpass = (lp_hz < SR * 0.45).then(|| Biquad::lowpass(lp_hz));
    let attack = ((1.0 - h) * 0.006 * SR) as usize;
    input
        .iter()
        .enumerate()
        .map(|(i, &x)| {
            let env = if i < attack { 0.2 + 0.8 * i as f32 / attack as f32 } else { 1.0 };
            let mut y = shelf.process(x * env);
            if let Some(lp) = lowpass.as_mut() {
                y = lp.process(y);
            }
            y
        })
        .collect()
}

/// RBJ cookbook biquad at 48 kHz.
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl Biquad {
    fn new(b: [f32; 3], a: [f32; 3]) -> Self {
        Self { b0: b[0] / a[0], b1: b[1] / a[0], b2: b[2] / a[0], a1: a[1] / a[0], a2: a[2] / a[0], z1: 0.0, z2: 0.0 }
    }

    fn lowpass(hz: f32) -> Self {
        let w = 2.0 * PI * hz / SR;
        let (s, c) = w.sin_cos();
        let alpha = s / (2.0 * std::f32::consts::FRAC_1_SQRT_2);
        Self::new([(1.0 - c) / 2.0, 1.0 - c, (1.0 - c) / 2.0], [1.0 + alpha, -2.0 * c, 1.0 - alpha])
    }

    fn high_shelf(hz: f32, db: f32) -> Self {
        let a = 10f32.powf(db / 40.0);
        let w = 2.0 * PI * hz / SR;
        let (s, c) = w.sin_cos();
        let alpha = s / 2.0 * std::f32::consts::SQRT_2;
        let k = 2.0 * a.sqrt() * alpha;
        Self::new(
            [a * ((a + 1.0) + (a - 1.0) * c + k), -2.0 * a * ((a - 1.0) + (a + 1.0) * c), a * ((a + 1.0) + (a - 1.0) * c - k)],
            [(a + 1.0) - (a - 1.0) * c + k, 2.0 * ((a - 1.0) - (a + 1.0) * c), (a + 1.0) - (a - 1.0) * c - k],
        )
    }

    fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn energy_above(x: &[f32], hz: f32) -> f32 {
        // crude: energy of a one-pole high-passed signal
        let k = (-2.0 * PI * hz / SR).exp();
        let (mut prev, mut hp, mut e) = (0.0, 0.0, 0.0);
        for &s in x {
            hp = k * (hp + s - prev);
            prev = s;
            e += hp * hp;
        }
        e
    }

    #[test]
    fn levels_round_trip() {
        for i in 0..LEVELS.len() {
            assert_eq!(level_of(value_of(i)), i);
        }
    }

    #[test]
    fn pick_moves_from_soft_to_hard_and_stays_in_range() {
        for code in [30u16, 31, 57, 28, 14] {
            for h in [0.0, 0.5, 1.0] {
                assert!(pick(16, h, code) < 16);
            }
        }
        let avg = |h: f32| (30u16..50).map(|c| pick(16, h, c)).sum::<usize>() as f32 / 20.0;
        assert!(avg(0.0) < avg(0.5) && avg(0.5) < avg(1.0));
        assert_eq!(pick(1, 1.0, 30), 0);
    }

    #[test]
    fn soft_is_darker_than_hard() {
        let mut seed = 99u32;
        let click: Vec<f32> = (0..2400)
            .map(|i| {
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                ((seed >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0) * (-(i as f32) / 200.0).exp()
            })
            .collect();
        let soft = shape(&click, 0.0);
        let hard = shape(&click, 1.0);
        assert!(soft.iter().chain(hard.iter()).all(|s| s.is_finite()));
        assert!(energy_above(&soft, 4000.0) * 4.0 < energy_above(&hard, 4000.0));
    }
}
