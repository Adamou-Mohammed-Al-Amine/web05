// Prevents an additional console window on Windows in release builds — this
// is what makes the app launch with no visible terminal, per the "no console
// window" requirement.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod settings;
mod tray;
mod vibrancy;
mod windows;

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        // Ctrl+Shift+P -> show/hide the bar. Ctrl+Shift+M -> mute/unmute
        // (toggle Always on Top's audio-adjacent sibling would be confusing;
        // "mute" here toggles Always on Top off/on isn't right either — per
        // spec these two shortcuts map to visibility and notification mute,
        // so M toggles a pause-until-resumed state, matching the tray's
        // "Pause Notifications" -> "Resume" pair).
        //
        // NOTE ON VERIFICATION: this is written against the documented
        // tauri-plugin-global-shortcut v2 API (`Builder::new().with_handler`,
        // `Shortcut::new`, `app.global_shortcut().register`). It has not been
        // compiled — this sandbox's Rust toolchain is too old for Tauri v2's
        // dependency tree (see README). If the first CI build fails, this
        // file and its exact API names are the first place to check.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    let toggle_bar = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyP);
                    let toggle_mute = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM);

                    if shortcut == &toggle_bar {
                        if let Some(bar) = app.get_webview_window("bar") {
                            let visible = bar.is_visible().unwrap_or(true);
                            settings::set_show_bar(app, !visible);
                            if visible { bar.hide().ok(); } else { bar.show().ok(); }
                        }
                    } else if shortcut == &toggle_mute {
                        // Toggle a simple pause/resume — mirrors the tray's
                        // "Pause Notifications" -> "Resume" pair rather than
                        // introducing a third distinct state.
                        let _ = app.emit("pause-toggle-shortcut", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            windows::create_bar_window(app.handle())?;
            tray::create_tray(app.handle())?;

            let handle = app.handle();
            let toggle_bar = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyP);
            let toggle_mute = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM);
            // Registration failures (e.g. the combo is already claimed by
            // another app) shouldn't prevent Prayer Bar from starting.
            let _ = handle.global_shortcut().register(toggle_bar);
            let _ = handle.global_shortcut().register(toggle_mute);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::show_notification,
            commands::toggle_main_window,
            commands::open_main_window,
            commands::set_always_on_top,
            commands::get_always_on_top,
            commands::set_bar_position,
            commands::list_monitors,
            commands::set_bar_monitor,
            commands::set_bar_visible,
            commands::import_adhan_sound,
            commands::set_bar_visual,
        ])
        // Closing the main window should not quit the app — only the tray
        // "Quit" item should. The bar window is never given a close button
        // (no decorations), so this branch only ever applies to "main".
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "bar" {
                    window.hide().ok();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Prayer Bar");
}
