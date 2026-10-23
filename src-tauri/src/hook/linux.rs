//! Reads keyboards straight from /dev/input, so it works on both X11 and
//! Wayland. The user must be able to read input devices (usually by being in
//! the `input` group).

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use evdev::{Device, EventType, Key};
use parking_lot::Mutex;

use super::{Handler, Permission};

fn is_keyboard(dev: &Device) -> bool {
    dev.supported_keys()
        .map(|k| k.contains(Key::KEY_A) && k.contains(Key::KEY_SPACE))
        .unwrap_or(false)
}

pub fn permission() -> Permission {
    let any_device = std::fs::read_dir("/dev/input")
        .map(|d| d.flatten().any(|e| e.file_name().to_string_lossy().starts_with("event")))
        .unwrap_or(false);
    if !any_device {
        return Permission::Unknown;
    }
    if evdev::enumerate().any(|(_, d)| is_keyboard(&d)) {
        Permission::Granted
    } else {
        Permission::Denied
    }
}

pub fn start(handler: Handler) {
    let watching = Arc::new(Mutex::new(HashSet::<PathBuf>::new()));
    thread::Builder::new()
        .name("keybuddy-hook".into())
        .spawn(move || loop {
            // Rescan so hot-plugged keyboards get picked up.
            for (path, dev) in evdev::enumerate() {
                if !is_keyboard(&dev) || !watching.lock().insert(path.clone()) {
                    continue;
                }
                let handler = handler.clone();
                let watching = watching.clone();
                thread::spawn(move || {
                    read_device(dev, &handler);
                    watching.lock().remove(&path);
                });
            }
            thread::sleep(Duration::from_secs(3));
        })
        .expect("spawn hook thread");
}

fn read_device(mut dev: Device, handler: &Handler) {
    loop {
        let Ok(events) = dev.fetch_events() else { return };
        for ev in events {
            if ev.event_type() != EventType::KEY {
                continue;
            }
            // 1 = press, 0 = release, 2 = auto-repeat (ignored)
            match ev.value() {
                1 => handler(ev.code(), true),
                0 => handler(ev.code(), false),
                _ => {}
            }
        }
    }
}
