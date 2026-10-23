use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    EventField,
};
use parking_lot::Mutex;

use super::{Handler, Permission};
use crate::keymap;

// IOKit: Input Monitoring permission (macOS 10.15+).
const K_IOHID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;
#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOHIDCheckAccess(request_type: u32) -> u32;
    fn IOHIDRequestAccess(request_type: u32) -> bool;
}

const VK_CAPS_LOCK: u16 = 0x39;

/// True once the event tap is actually running. This is the ground truth:
/// macOS's own access check can disagree with the switch in System Settings
/// (e.g. the switch belongs to an older, differently signed build).
static TAP_LIVE: AtomicBool = AtomicBool::new(false);
static TAP_TRIED: AtomicBool = AtomicBool::new(false);

pub fn permission() -> Permission {
    if TAP_LIVE.load(Ordering::Relaxed) {
        return Permission::Granted;
    }
    if TAP_TRIED.load(Ordering::Relaxed) {
        // We tried and macOS refused, whatever the settings switch shows.
        return Permission::Denied;
    }
    match unsafe { IOHIDCheckAccess(K_IOHID_REQUEST_TYPE_LISTEN_EVENT) } {
        0 => Permission::Granted,
        1 => Permission::Denied,
        _ => Permission::Unknown,
    }
}

pub fn start(handler: Handler) {
    thread::Builder::new()
        .name("keybuddy-hook".into())
        .spawn(move || {
            let mut asked = false;
            loop {
                if permission() != Permission::Granted && !asked {
                    // Shows the system prompt the first time.
                    unsafe { IOHIDRequestAccess(K_IOHID_REQUEST_TYPE_LISTEN_EVENT) };
                    asked = true;
                }
                let ran = run_tap(&handler);
                TAP_TRIED.store(true, Ordering::Relaxed);
                if ran {
                    return;
                }
                thread::sleep(Duration::from_secs(2));
            }
        })
        .expect("spawn hook thread");
}

/// Returns false if the tap could not be created (no permission yet).
fn run_tap(handler: &Handler) -> bool {
    // FlagsChanged has no down/up; track modifier state ourselves.
    let mods = Mutex::new(HashSet::<u16>::new());
    let tap = CGEventTap::new(
        CGEventTapLocation::Session,
        CGEventTapPlacement::TailAppendEventTap,
        CGEventTapOptions::ListenOnly,
        vec![CGEventType::KeyDown, CGEventType::KeyUp, CGEventType::FlagsChanged],
        |_proxy, etype, event| {
            let vk = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16;
            let code = keymap::from_mac(vk);
            match etype {
                CGEventType::KeyDown => handler(code, true),
                CGEventType::KeyUp => handler(code, false),
                CGEventType::FlagsChanged if vk == VK_CAPS_LOCK => {
                    handler(code, true);
                    handler(code, false);
                }
                CGEventType::FlagsChanged => {
                    let down = mods.lock().insert(vk);
                    if !down {
                        mods.lock().remove(&vk);
                    }
                    handler(code, down);
                }
                _ => {}
            }
            None
        },
    );
    let Ok(tap) = tap else { return false };
    let Ok(source) = tap.mach_port.create_runloop_source(0) else { return false };
    let run_loop = CFRunLoop::get_current();
    unsafe { run_loop.add_source(&source, kCFRunLoopCommonModes) };
    tap.enable();
    TAP_LIVE.store(true, Ordering::Relaxed);
    CFRunLoop::run_current();
    TAP_LIVE.store(false, Ordering::Relaxed);
    true
}
