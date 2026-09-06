use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::{settings, windows};

#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_panel_window(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("panel").is_none() {
        windows::create_panel_window(&app).map_err(|e| e.to_string())?;
    }
    if let Some(panel) = app.get_webview_window("panel") {
        let visible = panel.is_visible().unwrap_or(false);
        if visible {
            panel.hide().map_err(|e| e.to_string())?;
        } else {
            panel.show().map_err(|e| e.to_string())?;
            panel.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("settings").is_none() {
        windows::create_settings_window(&app).map_err(|e| e.to_string())?;
    }
    if let Some(win) = app.get_webview_window("settings") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Sets Always on Top independently of the "Show Prayer Bar" and "Start with
/// Windows" settings — flipping this never hides the bar or touches autostart.
#[tauri::command]
pub fn set_always_on_top(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::set_always_on_top(&app, enabled);
    if let Some(bar) = app.get_webview_window("bar") {
        bar.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    }
    // Keep the tray checkbox in sync when toggled from the settings window.
    if let Some(item) = app
        .menu()
        .and_then(|m| m.get("always_on_top"))
        .and_then(|i| i.as_check_menuitem().cloned())
    {
        item.set_checked(enabled).ok();
    }
    Ok(())
}

#[tauri::command]
pub fn get_always_on_top(app: AppHandle) -> bool {
    settings::get_always_on_top(&app)
}

/// Sets "Show Prayer Bar" independently — this only shows/hides the window,
/// it never changes Always on Top or Start with Windows. Keeps the tray
/// checkbox in sync since this can be called from the Settings UI too.
#[tauri::command]
pub fn set_bar_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    settings::set_show_bar(&app, visible);
    if let Some(bar) = app.get_webview_window("bar") {
        if visible { bar.show() } else { bar.hide() }.map_err(|e| e.to_string())?;
    }
    if let Some(item) = app
        .menu()
        .and_then(|m| m.get("show_hide"))
        .and_then(|i| i.as_check_menuitem().cloned())
    {
        item.set_checked(visible).ok();
    }
    Ok(())
}

#[tauri::command]
pub fn set_bar_position(app: AppHandle, position: String) -> Result<(), String> {
    // The frontend settings module owns the canonical settings object and
    // will have already persisted `barPosition` before calling this — this
    // command's job is just to re-apply it to the live window immediately.
    windows::reposition_bar_window(&app).map_err(|e| e.to_string())?;
    let _ = position; // kept for API clarity / future direct-set path
    Ok(())
}

#[derive(Serialize)]
pub struct MonitorInfo {
    name: Option<String>,
    is_primary: bool,
    width: u32,
    height: u32,
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let primary_name = app
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().cloned());

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .map(|m| MonitorInfo {
            name: m.name().cloned(),
            is_primary: m.name() == primary_name.as_ref(),
            width: m.size().width,
            height: m.size().height,
        })
        .collect())
}

#[tauri::command]
pub fn set_bar_monitor(app: AppHandle, monitor_name: Option<String>) -> Result<(), String> {
    settings::set_selected_monitor_name(&app, monitor_name);
    windows::reposition_bar_window(&app).map_err(|e| e.to_string())
}

/// Copies a user-picked audio file (chosen via the dialog plugin's file
/// picker on the frontend) into `$APPDATA/sounds/`, rather than granting the
/// webview broad filesystem access via a wide asset-protocol scope. Returns
/// the absolute path to the copy, which the frontend converts to a
/// webview-loadable URL with `convertFileSrc`.
///
/// Overwrites any previous file of the same purpose so old imports don't
/// accumulate — the caller passes a stable `purpose` id ("adhan" today;
/// future-ready for a distinct reminder sound if that's ever made
/// user-configurable instead of the synthesized chime).
#[tauri::command]
pub fn import_adhan_sound(app: AppHandle, source_path: String, purpose: String) -> Result<String, String> {
    use std::path::PathBuf;

    let src = PathBuf::from(&source_path);
    if !src.is_file() {
        return Err(format!("Selected file does not exist: {}", source_path));
    }

    let extension = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp3");

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let sounds_dir = app_data_dir.join("sounds");
    std::fs::create_dir_all(&sounds_dir).map_err(|e| e.to_string())?;

    // Sanitize purpose to a safe filename component (it's caller-controlled
    // from our own frontend, not user text, but this is cheap insurance).
    let safe_purpose: String = purpose
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let safe_purpose = if safe_purpose.is_empty() { "adhan".to_string() } else { safe_purpose };

    let dest = sounds_dir.join(format!("{safe_purpose}.{extension}"));
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;

    Ok(dest.to_string_lossy().to_string())
}
