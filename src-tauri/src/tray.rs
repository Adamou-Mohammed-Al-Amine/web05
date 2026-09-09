use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{settings, windows};

#[derive(Clone, Serialize)]
struct PauseSetPayload {
    #[serde(rename = "untilMs")]
    until_ms: i64,
}

fn now_ms_plus_minutes(minutes: i64) -> i64 {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    now.as_millis() as i64 + minutes * 60_000
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let current_always_on_top = settings::get_always_on_top(app);
    let current_show_bar = settings::get_show_bar(app);

    let show_hide = CheckMenuItem::with_id(
        app, "show_hide", "Show Prayer Bar", true, current_show_bar, None::<&str>,
    )?;
    let always_on_top = CheckMenuItem::with_id(
        app, "always_on_top", "Always on Top", true, current_always_on_top, None::<&str>,
    )?;

    let pause_30 = MenuItem::with_id(app, "pause_30", "30 minutes", true, None::<&str>)?;
    let pause_60 = MenuItem::with_id(app, "pause_60", "1 hour", true, None::<&str>)?;
    let pause_until_next = MenuItem::with_id(app, "pause_until_next", "Until next prayer", true, None::<&str>)?;
    let pause_resume = MenuItem::with_id(app, "pause_resume", "Resume (clear pause)", true, None::<&str>)?;
    let pause_sep = PredefinedMenuItem::separator(app)?;
    let pause_submenu = Submenu::with_items(
        app,
        "Pause Notifications",
        true,
        &[&pause_30, &pause_60, &pause_until_next, &pause_sep, &pause_resume],
    )?;

    let open_main_item = MenuItem::with_id(app, "open_main", "Open Prayer Bar", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_hide,
            &always_on_top,
            &pause_submenu,
            &open_main_item,
            &separator,
            &settings_item,
            &separator,
            &quit,
        ],
    )?;

    // Reuses the app's main icon (loaded correctly by Tauri itself from the
    // `.ico` referenced in tauri.conf.json's `bundle.icon`) rather than
    // decoding raw bytes by hand — `Image::from_bytes` doesn't exist in
    // tauri 2.11's API (confirmed by a real compile error); `Image::new`/
    // `new_owned` only accept already-decoded raw RGBA pixels, which isn't
    // worth adding an image-decoding dependency for when this achieves the
    // same visible result. The .ico's multiple embedded resolutions let the
    // OS pick an appropriately-sized bitmap for the small tray area.
    let mut builder = TrayIconBuilder::new().tooltip("Prayer Bar").menu(&menu);
    if let Some(default_icon) = app.default_window_icon() {
        builder = builder.icon(default_icon.clone());
    }

    builder
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show_hide" => {
                let new_value = !settings::get_show_bar(app);
                settings::set_show_bar(app, new_value);
                if let Some(bar) = app.get_webview_window("bar") {
                    if new_value { bar.show().ok(); } else { bar.hide().ok(); }
                }
                if let Some(item) = app
                    .menu()
                    .and_then(|m| m.get("show_hide"))
                    .and_then(|i| i.as_check_menuitem().cloned())
                {
                    item.set_checked(new_value).ok();
                }
            }
            "always_on_top" => {
                let new_value = !settings::get_always_on_top(app);
                settings::set_always_on_top(app, new_value);
                if let Some(bar) = app.get_webview_window("bar") {
                    bar.set_always_on_top(new_value).ok();
                }
                if let Some(item) = app
                    .menu()
                    .and_then(|m| m.get("always_on_top"))
                    .and_then(|i| i.as_check_menuitem().cloned())
                {
                    item.set_checked(new_value).ok();
                }
            }
            "pause_30" => {
                let _ = app.emit_to("bar", "pause-set", PauseSetPayload { until_ms: now_ms_plus_minutes(30) });
            }
            "pause_60" => {
                let _ = app.emit_to("bar", "pause-set", PauseSetPayload { until_ms: now_ms_plus_minutes(60) });
            }
            "pause_until_next" => {
                // The bar frontend knows the actual next-prayer time (it owns
                // the calculated schedule); Rust just signals the intent.
                let _ = app.emit_to("bar", "pause-until-next", ());
            }
            "pause_resume" => {
                let _ = app.emit_to("bar", "pause-resume", ());
            }
            "open_main" => {
                if app.get_webview_window("main").is_none() {
                    windows::create_main_window(app).ok();
                }
                if let Some(main) = app.get_webview_window("main") {
                    main.show().ok();
                    main.set_focus().ok();
                    let _ = app.emit_to("main", "switch-tab", "home");
                }
            }
            "settings" => {
                if app.get_webview_window("main").is_none() {
                    windows::create_main_window(app).ok();
                }
                if let Some(main) = app.get_webview_window("main") {
                    main.show().ok();
                    main.set_focus().ok();
                    let _ = app.emit_to("main", "switch-tab", "general");
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
