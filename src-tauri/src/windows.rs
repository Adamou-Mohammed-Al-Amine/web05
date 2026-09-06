use tauri::{AppHandle, LogicalPosition, Manager, Monitor, WebviewUrl, WebviewWindowBuilder};

use crate::settings;

const BAR_WIDTH: f64 = 420.0;
const BAR_HEIGHT: f64 = 56.0;
const TOP_MARGIN: f64 = 10.0; // keeps the bar from touching the screen edge

/// Picks the monitor the bar should appear on: the one saved in settings by
/// name if it's still connected, otherwise the primary monitor, otherwise
/// whatever the first available monitor is (covers unplugged/renamed
/// displays gracefully instead of panicking).
fn resolve_target_monitor(app: &AppHandle) -> Option<Monitor> {
    let monitors = app.available_monitors().ok()?;
    if monitors.is_empty() {
        return None;
    }

    if let Some(saved_name) = settings::get_selected_monitor_name(app) {
        if let Some(m) = monitors.iter().find(|m| m.name() == Some(&saved_name)) {
            return Some(m.clone());
        }
        // Saved monitor is no longer connected — fall through to primary.
    }

    app.primary_monitor().ok().flatten().or_else(|| monitors.first().cloned())
}

/// Computes the top-left position for the bar window given the chosen
/// monitor and the user's position preference (top-center/left/right).
/// Works in logical pixels, dividing out the monitor's scale factor so the
/// margin looks consistent across DPI settings.
fn compute_bar_position(monitor: &Monitor, position_pref: &str) -> LogicalPosition<f64> {
    let scale = monitor.scale_factor();
    let logical_width = monitor.size().width as f64 / scale;
    let monitor_logical_pos = LogicalPosition::new(
        monitor.position().x as f64 / scale,
        monitor.position().y as f64 / scale,
    );

    let x = match position_pref {
        "top-left" => monitor_logical_pos.x + TOP_MARGIN,
        "top-right" => monitor_logical_pos.x + logical_width - BAR_WIDTH - TOP_MARGIN,
        _ => monitor_logical_pos.x + (logical_width - BAR_WIDTH) / 2.0, // top-center default
    };
    let y = monitor_logical_pos.y + TOP_MARGIN;

    LogicalPosition::new(x, y)
}

/// Creates the always-resident floating bar: borderless, transparent,
/// always-on-top (unless the user has disabled it), no taskbar entry,
/// positioned per the user's monitor/position preference.
pub fn create_bar_window(app: &AppHandle) -> tauri::Result<()> {
    let always_on_top = settings::get_always_on_top(app);
    let position_pref = settings::get_bar_position(app);
    let show_bar = settings::get_show_bar(app);

    let window = WebviewWindowBuilder::new(app, "bar", WebviewUrl::App("bar/index.html".into()))
        .title("Prayer Bar")
        .inner_size(BAR_WIDTH, BAR_HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(always_on_top)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false) // the soft shadow is rendered in CSS instead
        .visible(false) // positioned first, then shown, to avoid a visible jump
        .build()?;

    if let Some(monitor) = resolve_target_monitor(app) {
        let pos = compute_bar_position(&monitor, &position_pref);
        window.set_position(pos)?;
    }
    if show_bar {
        window.show()?;
    }

    Ok(())
}

/// Re-applies the current settings' monitor/position choice to the already-
/// running bar window. Called from the settings UI when the user changes
/// either preference, so the bar moves live rather than requiring a restart.
pub fn reposition_bar_window(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("bar") else { return Ok(()); };
    let position_pref = settings::get_bar_position(app);
    if let Some(monitor) = resolve_target_monitor(app) {
        let pos = compute_bar_position(&monitor, &position_pref);
        window.set_position(pos)?;
    }
    Ok(())
}

/// The small glass panel showing today/tomorrow prayer times. Created lazily
/// on first click rather than at startup, to keep idle memory minimal.
pub fn create_panel_window(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, "panel", WebviewUrl::App("panel/panel.html".into()))
        .title("Prayer Bar - Today")
        .inner_size(320.0, 300.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()?;
    Ok(())
}

/// Settings window — a normal-ish window (still borderless/glass for visual
/// consistency) that the user can move/close freely without affecting the
/// background app. Appears in the taskbar since it's an intentional,
/// user-facing window rather than an overlay.
pub fn create_settings_window(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings/settings.html".into()))
        .title("Prayer Bar Settings")
        .inner_size(560.0, 640.0)
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .min_inner_size(480.0, 480.0)
        .skip_taskbar(false)
        .build()?;
    Ok(())
}
