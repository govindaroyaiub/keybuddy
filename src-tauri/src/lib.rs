mod audio;
mod engine;
mod hook;
mod keymap;
mod packs;

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use engine::{Engine, Settings, StatsView};

const VOLUME_STEPS: [u32; 4] = [25, 50, 75, 100];

struct Tray {
    toggle: CheckMenuItem<Wry>,
    packs: Vec<(&'static str, CheckMenuItem<Wry>)>,
    volumes: Vec<(u32, CheckMenuItem<Wry>)>,
}

impl Tray {
    fn sync(&self, s: &Settings) {
        let _ = self.toggle.set_checked(s.enabled);
        for (id, item) in &self.packs {
            let _ = item.set_checked(*id == s.pack);
        }
        let nearest = VOLUME_STEPS
            .iter()
            .min_by_key(|v| (**v as i32 - (s.volume * 100.0).round() as i32).abs())
            .copied();
        for (v, item) in &self.volumes {
            let _ = item.set_checked(Some(*v) == nearest);
        }
    }
}

/// Applies new settings and tells every surface (tray + window) about them.
fn commit(app: &AppHandle, engine: &Engine, next: Settings) {
    engine.apply(next);
    let s = engine.settings.read().clone();
    if let Some(tray) = app.try_state::<Tray>() {
        tray.sync(&s);
    }
    let _ = app.emit("settings", &s);
}

fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn get_state(app: AppHandle, engine: State<Arc<Engine>>) -> serde_json::Value {
    json!({
        "settings": &*engine.settings.read(),
        "packs": packs::PACKS,
        "permission": hook::permission(),
        "autostart": app.autolaunch().is_enabled().unwrap_or(false),
        "platform": std::env::consts::OS,
    })
}

#[tauri::command]
fn set_settings(app: AppHandle, engine: State<Arc<Engine>>, settings: Settings) {
    commit(&app, &engine, settings);
}

#[tauri::command]
fn preview(engine: State<Arc<Engine>>, pack: String) {
    engine.preview(pack);
}

#[tauri::command]
fn tap(engine: State<Arc<Engine>>, code: u16) {
    engine.tap(code);
}

#[tauri::command]
fn get_stats(engine: State<Arc<Engine>>) -> StatsView {
    engine.stats.lock().view()
}

#[tauri::command]
fn permission() -> hook::Permission {
    hook::permission()
}

#[tauri::command]
fn open_permission_settings() {
    hook::open_permission_settings();
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let al = app.autolaunch();
    if enabled { al.enable() } else { al.disable() }.map_err(|e| e.to_string())?;
    Ok(al.is_enabled().unwrap_or(false))
}

fn build_tray(app: &AppHandle, s: &Settings) -> tauri::Result<Tray> {
    let toggle = CheckMenuItem::with_id(app, "toggle", "Sounds On", true, s.enabled, None::<&str>)?;
    let packs: Vec<_> = packs::PACKS
        .iter()
        .map(|p| {
            CheckMenuItem::with_id(app, format!("pack:{}", p.id), p.name, true, p.id == s.pack, None::<&str>)
                .map(|item| (p.id, item))
        })
        .collect::<Result<_, _>>()?;
    let volumes: Vec<_> = VOLUME_STEPS
        .iter()
        .map(|v| {
            CheckMenuItem::with_id(app, format!("vol:{v}"), format!("{v}%"), true, false, None::<&str>)
                .map(|item| (*v, item))
        })
        .collect::<Result<_, _>>()?;

    let pack_refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = packs.iter().map(|(_, i)| i as _).collect();
    let vol_refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = volumes.iter().map(|(_, i)| i as _).collect();
    let sound_menu = Submenu::with_items(app, "Sound", true, &pack_refs)?;
    let volume_menu = Submenu::with_items(app, "Volume", true, &vol_refs)?;
    let open = MenuItem::with_id(app, "open", "Open KeyBuddy…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit KeyBuddy", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &toggle,
            &PredefinedMenuItem::separator(app)?,
            &sound_menu,
            &volume_menu,
            &PredefinedMenuItem::separator(app)?,
            &open,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("keybuddy")
        .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("KeyBuddy")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let engine = app.state::<Arc<Engine>>().inner().clone();
            let id = event.id.as_ref();
            let mut next = engine.settings.read().clone();
            match id {
                "toggle" => next.enabled = !next.enabled,
                "open" => return show_window(app),
                "quit" => {
                    engine.save_stats();
                    return app.exit(0);
                }
                _ if id.starts_with("pack:") => next.pack = id[5..].to_string(),
                _ if id.starts_with("vol:") => {
                    next.volume = id[4..].parse::<f32>().unwrap_or(60.0) / 100.0;
                }
                _ => return,
            }
            commit(app, &engine, next);
        })
        .build(app)?;

    let tray = Tray { toggle, packs, volumes };
    tray.sync(s);
    Ok(tray)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_window(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_settings,
            preview,
            tap,
            get_stats,
            permission,
            open_permission_settings,
            set_autostart
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let dir = app.path().app_config_dir()?;
            let engine = Engine::new(dir);
            let first_run = engine.is_first_run();
            engine.save_settings();
            app.manage(engine.clone());

            let settings = engine.settings.read().clone();
            let tray = build_tray(app.handle(), &settings)?;
            app.manage(tray);

            let handle = app.handle().clone();
            let hook_engine = engine.clone();
            hook::start(move |code, down| {
                hook_engine.on_key(code, down);
                let _ = handle.emit("key", (code, down));
            });

            // Persist stats now and then; they're tiny.
            let stats_engine = engine.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(30));
                stats_engine.save_stats();
            });

            if first_run || hook::permission() != hook::Permission::Granted {
                show_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps KeyBuddy running in the tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running KeyBuddy");
}
