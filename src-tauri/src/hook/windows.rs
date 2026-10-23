use std::ptr;
use std::sync::OnceLock;
use std::thread;

use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
    HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_EXTENDED, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP,
    WM_SYSKEYDOWN, WM_SYSKEYUP,
};

use super::Handler;
use crate::keymap;

static HANDLER: OnceLock<Handler> = OnceLock::new();

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
        let down = match wparam as u32 {
            WM_KEYDOWN | WM_SYSKEYDOWN => Some(true),
            WM_KEYUP | WM_SYSKEYUP => Some(false),
            _ => None,
        };
        if let (Some(down), Some(h)) = (down, HANDLER.get()) {
            let extended = kb.flags & LLKHF_EXTENDED != 0;
            h(keymap::from_windows(kb.scanCode, extended), down);
        }
    }
    CallNextHookEx(ptr::null_mut(), code, wparam, lparam)
}

pub fn start(handler: Handler) {
    let _ = HANDLER.set(handler);
    thread::Builder::new()
        .name("keybuddy-hook".into())
        .spawn(|| unsafe {
            // A low-level hook needs a message loop on the installing thread.
            let module = GetModuleHandleW(ptr::null());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), module, 0);
            if hook.is_null() {
                eprintln!("keybuddy: SetWindowsHookExW failed");
                return;
            }
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        })
        .expect("spawn hook thread");
}
