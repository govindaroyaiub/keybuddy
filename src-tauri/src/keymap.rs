//! Platform-neutral key codes.
//!
//! Every hook converts its native code into a Linux evdev key code (which for
//! the main block equals the PC set-1 scan code). From that we derive where the
//! key sits on a keyboard (for stereo panning and note mapping) and what kind
//! of key it is (big keys sound bigger).

use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KeyClass {
    Normal = 0,
    Mod = 1,
    Space = 2,
    Enter = 3,
    Back = 4,
}

#[derive(Clone, Copy, Debug)]
pub struct KeyInfo {
    /// Horizontal position, 0.0 = far left, 1.0 = far right.
    pub x: f32,
    pub class: KeyClass,
}

const LAYOUT_WIDTH: f32 = 15.0;

// (evdev code, width in key units) per row, top to bottom.
const ROWS: &[&[(u16, f32)]] = &[
    // F row
    &[
        (1, 1.5), (59, 1.0), (60, 1.0), (61, 1.0), (62, 1.0), (63, 1.0), (64, 1.0),
        (65, 1.0), (66, 1.0), (67, 1.0), (68, 1.0), (87, 1.0), (88, 1.0), (111, 1.5),
    ],
    // number row
    &[
        (41, 1.0), (2, 1.0), (3, 1.0), (4, 1.0), (5, 1.0), (6, 1.0), (7, 1.0), (8, 1.0),
        (9, 1.0), (10, 1.0), (11, 1.0), (12, 1.0), (13, 1.0), (14, 2.0),
    ],
    // tab row
    &[
        (15, 1.5), (16, 1.0), (17, 1.0), (18, 1.0), (19, 1.0), (20, 1.0), (21, 1.0),
        (22, 1.0), (23, 1.0), (24, 1.0), (25, 1.0), (26, 1.0), (27, 1.0), (43, 1.5),
    ],
    // home row
    &[
        (58, 1.75), (30, 1.0), (31, 1.0), (32, 1.0), (33, 1.0), (34, 1.0), (35, 1.0),
        (36, 1.0), (37, 1.0), (38, 1.0), (39, 1.0), (40, 1.0), (28, 2.25),
    ],
    // shift row
    &[
        (42, 1.25), (86, 1.0), (44, 1.0), (45, 1.0), (46, 1.0), (47, 1.0), (48, 1.0),
        (49, 1.0), (50, 1.0), (51, 1.0), (52, 1.0), (53, 1.0), (54, 2.75),
    ],
    // bottom row
    &[
        (29, 1.25), (464, 1.0), (125, 1.25), (56, 1.25), (57, 5.5), (100, 1.25),
        (126, 1.25), (127, 1.0), (97, 1.25),
    ],
];

// Navigation cluster: treated as sitting at the right edge.
const NAV: &[u16] = &[102, 104, 107, 109, 110, 103, 105, 106, 108, 96];

fn table() -> &'static HashMap<u16, KeyInfo> {
    static T: OnceLock<HashMap<u16, KeyInfo>> = OnceLock::new();
    T.get_or_init(|| {
        let mut m = HashMap::new();
        for row in ROWS.iter() {
            let total: f32 = row.iter().map(|(_, w)| w).sum();
            let scale = LAYOUT_WIDTH / total;
            let mut x = 0.0;
            for &(code, w) in row.iter() {
                let center = (x + w * 0.5) * scale / LAYOUT_WIDTH;
                x += w;
                m.insert(code, KeyInfo { x: center, class: class_of(code) });
            }
        }
        for &code in NAV {
            m.insert(code, KeyInfo { x: 1.0, class: class_of(code) });
        }
        m
    })
}

fn class_of(code: u16) -> KeyClass {
    match code {
        57 => KeyClass::Space,
        28 | 96 => KeyClass::Enter,
        14 | 111 => KeyClass::Back,
        15 | 29 | 42 | 54 | 56 | 58 | 97 | 100 | 125 | 126 | 127 | 464 => KeyClass::Mod,
        _ => KeyClass::Normal,
    }
}

pub fn info(code: u16) -> KeyInfo {
    table()
        .get(&code)
        .copied()
        .unwrap_or(KeyInfo { x: 0.85, class: KeyClass::Normal })
}

/// macOS virtual key code -> evdev code.
#[allow(dead_code)]
pub fn from_mac(vk: u16) -> u16 {
    match vk {
        0x00 => 30, 0x01 => 31, 0x02 => 32, 0x03 => 33, 0x04 => 35, 0x05 => 34,
        0x06 => 44, 0x07 => 45, 0x08 => 46, 0x09 => 47, 0x0A => 86, 0x0B => 48,
        0x0C => 16, 0x0D => 17, 0x0E => 18, 0x0F => 19, 0x10 => 21, 0x11 => 20,
        0x12 => 2, 0x13 => 3, 0x14 => 4, 0x15 => 5, 0x16 => 7, 0x17 => 6,
        0x18 => 13, 0x19 => 10, 0x1A => 8, 0x1B => 12, 0x1C => 9, 0x1D => 11,
        0x1E => 27, 0x1F => 24, 0x20 => 22, 0x21 => 26, 0x22 => 23, 0x23 => 25,
        0x24 => 28, 0x25 => 38, 0x26 => 36, 0x27 => 40, 0x28 => 37, 0x29 => 39,
        0x2A => 43, 0x2B => 51, 0x2C => 53, 0x2D => 49, 0x2E => 50, 0x2F => 52,
        0x30 => 15, 0x31 => 57, 0x32 => 41, 0x33 => 14, 0x35 => 1, 0x36 => 126,
        0x37 => 125, 0x38 => 42, 0x39 => 58, 0x3A => 56, 0x3B => 29, 0x3C => 54,
        0x3D => 100, 0x3E => 97, 0x3F => 464, 0x4C => 96,
        0x7A => 59, 0x78 => 60, 0x63 => 61, 0x76 => 62, 0x60 => 63, 0x61 => 64,
        0x62 => 65, 0x64 => 66, 0x65 => 67, 0x6D => 68, 0x67 => 87, 0x6F => 88,
        0x75 => 111, 0x73 => 102, 0x77 => 107, 0x74 => 104, 0x79 => 109,
        0x7B => 105, 0x7C => 106, 0x7D => 108, 0x7E => 103,
        other => 1000 + other,
    }
}

/// Windows low-level hook scan code (+ extended flag) -> evdev code.
#[allow(dead_code)]
pub fn from_windows(scan: u32, extended: bool) -> u16 {
    if extended {
        match scan {
            0x1C => 96, 0x1D => 97, 0x38 => 100, 0x5B => 125, 0x5C => 126, 0x5D => 127,
            0x48 => 103, 0x4B => 105, 0x4D => 106, 0x50 => 108, 0x53 => 111,
            0x47 => 102, 0x4F => 107, 0x49 => 104, 0x51 => 109, 0x52 => 110,
            other => 2000 + other as u16,
        }
    } else {
        scan as u16
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_positions_are_sane() {
        let a = info(30);
        let l = info(38);
        assert!(a.x < l.x);
        assert!(info(1).x < 0.1);
        assert!(info(14).x > 0.9);
        assert_eq!(info(57).class, KeyClass::Space);
        assert!((info(57).x - 0.5).abs() < 0.12);
    }

    #[test]
    fn mac_and_windows_agree() {
        assert_eq!(from_mac(0x00), 30);
        assert_eq!(from_windows(0x1E, false), 30);
        assert_eq!(from_mac(0x24), from_windows(0x1C, false));
        assert_eq!(from_mac(0x7E), from_windows(0x48, true));
    }
}
