use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Monitor, WebviewUrl, WebviewWindowBuilder};

use crate::{settings, vibrancy};

// Two discrete window sizes for the bar — the OS window itself must resize
// (not just a CSS div inside a fixed-size window) because native acrylic
// blur/tint covers the window's actual rectangular bounds. A brief 5-min-
// warning "grow pulse" stays CSS-only (a scale transform within the compact
// window) since it's a sub-second cosmetic pulse, not a real size change.
const BAR_COMPACT_WIDTH: f64 = 300.0;
const BAR_COMPACT_HEIGHT: f64 = 64.0;
const BAR_EXPANDED_WIDTH: f64 = 580.0;
const BAR_EXPANDED_HEIGHT: f64 = 120.0;
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
/// monitor, the user's position preference (top-center/left/right), and the
/// bar's CURRENT width — needed because expanding/collapsing actually
/// resizes the OS window now (see module doc), and re-centering on every
/// size change is what keeps the bar visually anchored instead of drifting.
/// Works in logical pixels, dividing out the monitor's scale factor so the
/// margin looks consistent across DPI settings.
fn compute_bar_position(monitor: &Monitor, position_pref: &str, bar_width: f64) -> LogicalPosition<f64> {
    let scale = monitor.scale_factor();
    let logical_width = monitor.size().width as f64 / scale;
    let monitor_logical_pos = LogicalPosition::new(
        monitor.position().x as f64 / scale,
        monitor.position().y as f64 / scale,
    );

    let x = match position_pref {
        "top-left" => monitor_logical_pos.x + TOP_MARGIN,
        "top-right" => monitor_logical_pos.x + logical_width - bar_width - TOP_MARGIN,
        _ => monitor_logical_pos.x + (logical_width - bar_width) / 2.0, // top-center default
    };
    let y = monitor_logical_pos.y + TOP_MARGIN;

    LogicalPosition::new(x, y)
}

/// Creates the always-resident floating bar: borderless, transparent,
/// always-on-top (unless the user has disabled it), no taskbar entry,
/// positioned per the user's monitor/position preference. Starts at compact
/// size with the normal (charcoal) native acrylic tint.
pub fn create_bar_window(app: &AppHandle) -> tauri::Result<()> {
    let always_on_top = settings::get_always_on_top(app);
    let position_pref = settings::get_bar_position(app);
    let show_bar = settings::get_show_bar(app);

    let window = WebviewWindowBuilder::new(app, "bar", WebviewUrl::App("src/bar/index.html".into()))
        .title("بار الصلاة")
        .inner_size(BAR_COMPACT_WIDTH, BAR_COMPACT_HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(always_on_top)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false) // the soft shadow is rendered in CSS instead
        .visible(false) // positioned first, then shown, to avoid a visible jump
        .build()?;

    if let Some(monitor) = resolve_target_monitor(app) {
        let pos = compute_bar_position(&monitor, &position_pref, BAR_COMPACT_WIDTH);
        window.set_position(pos)?;
    }

    vibrancy::set_bar_tint(&window, tone_rgba("normal"));

    if show_bar {
        window.show()?;
    }

    Ok(())
}

/// Re-applies the current settings' monitor/position choice to the already-
/// running bar window. Called when the user changes monitor/position in
/// Settings — assumes compact size, since in practice the user isn't
/// mid-Adhan-announcement while adjusting these settings. If the bar
/// happens to be expanded at that exact moment, the next state change will
/// correct the position anyway (apply_bar_visual always recomputes it).
pub fn reposition_bar_window(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("bar") else { return Ok(()); };
    let position_pref = settings::get_bar_position(app);
    if let Some(monitor) = resolve_target_monitor(app) {
        let pos = compute_bar_position(&monitor, &position_pref, BAR_COMPACT_WIDTH);
        window.set_position(pos)?;
    }
    Ok(())
}

/// Maps a visual "tone" to its native acrylic tint color. Kept dark and
/// desaturated per spec ("premium, not bright/saturated"):
///   normal  -> charcoal (waiting: before a prayer, or Iqama countdown with
///              more than 5 minutes left)
///   warning -> dark red (last 5 minutes before Iqama — urgent but not
///              aggressive)
///   adhan   -> dark green (the Adhan/alarm announcement itself)
fn tone_rgba(tone: &str) -> (u8, u8, u8, u8) {
    match tone {
        "adhan" => (18, 46, 32, 225),
        "warning" => (48, 20, 20, 220),
        _ => (22, 22, 26, 195),
    }
}

/// Resizes, re-centers, and re-tints the bar for a visual state change
/// ("normal" | "warning" | "adhan"). This is the core of the redesigned
/// expand/collapse behavior: the OS window itself changes size (required
/// for native acrylic to tint/blur the correct area — see vibrancy.rs),
/// while the frontend's CSS handles the spring/bounce transition animation
/// for the content inside.
pub fn apply_bar_visual(app: &AppHandle, tone: &str) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("bar") else { return Ok(()); };
    let position_pref = settings::get_bar_position(app);

    let (width, height) = if tone == "adhan" {
        (BAR_EXPANDED_WIDTH, BAR_EXPANDED_HEIGHT)
    } else {
        (BAR_COMPACT_WIDTH, BAR_COMPACT_HEIGHT)
    };

    window.set_size(LogicalSize::new(width, height))?;
    if let Some(monitor) = resolve_target_monitor(app) {
        let pos = compute_bar_position(&monitor, &position_pref, width);
        window.set_position(pos)?;
    }
    vibrancy::set_bar_tint(&window, tone_rgba(tone));

    Ok(())
}

/// The single unified main window: Home (live clock + countdown + today's
/// schedule), Alarms, and every Settings category, all as tabs in one
/// window with one shell — per the "no fragmented settings windows"
/// requirement. A normal window (native title bar, opaque background,
/// shows in the taskbar). Created lazily on first open, not at startup, to
/// keep idle memory minimal when the user only wants the floating bar.
pub fn create_main_window(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("src/panel/panel.html".into()))
        .title("بار الصلاة")
        .inner_size(560.0, 680.0)
        .min_inner_size(440.0, 520.0)
        .decorations(true)
        .transparent(false)
        .resizable(true)
        .visible(false)
        .build()?;
    Ok(())
}
