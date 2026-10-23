//! Sound packs: real switch recordings (CC0, see sounds/CREDITS.md), sliced
//! into single key hits by tools/slice.py and embedded in the binary.
//!
//! Each key class (normal, modifier, space, enter, backspace) has several
//! takes for press and release so fast typing never sounds machine-gunned.

use std::sync::Arc;

pub const SR: f32 = 48_000.0;
pub type Buf = Arc<[f32]>;

pub struct Bank {
    pub press: [Vec<Buf>; 5],
    pub release: [Vec<Buf>; 5],
}

#[derive(serde::Serialize, Clone, Copy)]
pub struct PackInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: &'static str,
    pub blurb: &'static str,
}

pub const PACKS: &[PackInfo] = &[
    PackInfo { id: "thocky", name: "Thocky", kind: "Linear", blurb: "Smooth linears with a deep, round bottom-out." },
    PackInfo { id: "clacky", name: "Clacky", kind: "Linear", blurb: "Bright, hollow clack off hard caps." },
    PackInfo { id: "clicky", name: "Clicky", kind: "Clicky", blurb: "Click-jacket blues. Loud, crisp, unapologetic." },
    PackInfo { id: "tactile", name: "Tactile", kind: "Tactile", blurb: "Browns: a soft bump, then a muted landing." },
];

pub const DEFAULT_PACK: &str = "thocky";

fn data(id: &str) -> &'static [u8] {
    match id {
        "clacky" => include_bytes!("../packs/clacky.kbp"),
        "clicky" => include_bytes!("../packs/clicky.kbp"),
        "tactile" => include_bytes!("../packs/tactile.kbp"),
        _ => include_bytes!("../packs/thocky.kbp"),
    }
}

/// (kind: 0 press / 1 release, class, mono samples at 48 kHz)
pub type Entry = (u8, u8, Vec<f32>);

pub fn is_builtin(id: &str) -> bool {
    PACKS.iter().any(|p| p.id == id)
}

pub fn build(id: &str) -> Bank {
    parse(data(id)).unwrap_or_else(empty)
}

pub fn empty() -> Bank {
    Bank { press: Default::default(), release: Default::default() }
}

pub fn encode(entries: &[Entry]) -> Vec<u8> {
    let mut out = b"KBP1".to_vec();
    for (kind, class, samples) in entries {
        out.extend([*kind, *class]);
        out.extend((samples.len() as u32).to_le_bytes());
        for s in samples {
            out.extend(((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
        }
    }
    out
}

/// b"KBP1", then entries of: u8 kind (0 press, 1 release), u8 class,
/// u32 LE sample count, i16 LE samples.
pub fn parse(mut b: &[u8]) -> Option<Bank> {
    b = b.strip_prefix(b"KBP1")?;
    let mut bank = Bank { press: Default::default(), release: Default::default() };
    while b.len() >= 6 {
        let (kind, class) = (b[0], b[1] as usize);
        let n = u32::from_le_bytes(b[2..6].try_into().ok()?) as usize;
        let bytes = b.get(6..6 + n * 2)?;
        let buf: Buf = bytes
            .chunks_exact(2)
            .map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32768.0)
            .collect();
        let set = if kind == 0 { &mut bank.press } else { &mut bank.release };
        set.get_mut(class)?.push(buf);
        b = &b[6 + n * 2..];
    }
    Some(bank)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_roundtrips() {
        let entries = vec![(0u8, 2u8, vec![0.5f32; 200]), (1, 0, vec![-0.25; 150])];
        let bank = parse(&encode(&entries)).unwrap();
        assert_eq!(bank.press[2].len(), 1);
        assert_eq!(bank.release[0][0].len(), 150);
        assert!((bank.press[2][0][10] - 0.5).abs() < 1e-3);
    }

    #[test]
    fn every_pack_has_every_class() {
        for p in PACKS {
            let bank = build(p.id);
            for (i, set) in bank.press.iter().enumerate() {
                assert!(!set.is_empty(), "{} press class {i} empty", p.id);
            }
            assert!(!bank.release[0].is_empty(), "{} has no releases", p.id);
            for b in bank.press.iter().chain(bank.release.iter()).flatten() {
                assert!(b.len() > 100 && b.iter().all(|s| s.abs() <= 1.0));
            }
        }
    }
}
