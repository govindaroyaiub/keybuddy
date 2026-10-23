//! Global keyboard listening. Each OS backend reports raw (evdev code, down)
//! pairs; this layer drops auto-repeat so a held key only sounds once.
//!
//! Only key *positions* ever leave this module, never characters.

use std::collections::HashSet;
use std::sync::Arc;

use parking_lot::Mutex;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[derive(Clone, Copy, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    Granted,
    Denied,
    Unknown,
}

pub type Handler = Arc<dyn Fn(u16, bool) + Send + Sync + 'static>;

/// Starts listening on a background thread. `on_key(code, down)` is called
/// once per physical press and once per release.
pub fn start(on_key: impl Fn(u16, bool) + Send + Sync + 'static) {
    let pressed = Mutex::new(HashSet::<u16>::new());
    let handler: Handler = Arc::new(move |code, down| {
        let fresh = {
            let mut p = pressed.lock();
            if down { p.insert(code) } else { p.remove(&code) }
        };
        if fresh {
            on_key(code, down);
        }
    });
    backend_start(handler);
}

#[cfg(target_os = "macos")]
fn backend_start(h: Handler) {
    macos::start(h)
}
#[cfg(target_os = "windows")]
fn backend_start(h: Handler) {
    windows::start(h)
}
#[cfg(target_os = "linux")]
fn backend_start(h: Handler) {
    linux::start(h)
}

pub fn permission() -> Permission {
    #[cfg(target_os = "macos")]
    return macos::permission();
    #[cfg(target_os = "linux")]
    return linux::permission();
    #[allow(unreachable_code)]
    Permission::Granted
}

/// Opens the OS page where the user grants keyboard access.
pub fn open_permission_settings() {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
        .spawn();
}
