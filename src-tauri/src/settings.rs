use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "prayer-bar-settings.json";
const SETTINGS_KEY: &str = "settings";

/// The frontend (src/lib/store.ts) owns the canonical `AppSettings` shape and
/// writes it as one JSON object under the `settings` key in the same store
/// file. The handful of fields the Rust side needs at startup/tray-time are
/// read from that same object here, rather than duplicating a second source
/// of truth.
fn read_settings_object(app: &AppHandle) -> Value {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(SETTINGS_KEY))
        .unwrap_or_else(|| json!({}))
}

fn write_settings_object(app: &AppHandle, value: Value) {
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(SETTINGS_KEY, value);
        let _ = store.save();
    }
}

/// Default is `true` — "Always on Top = ON" by default, per spec.
pub fn get_always_on_top(app: &AppHandle) -> bool {
    read_settings_object(app)
        .get("alwaysOnTop")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

pub fn set_always_on_top(app: &AppHandle, value: bool) {
    let mut settings = read_settings_object(app);
    if let Value::Object(ref mut map) = settings {
        map.insert("alwaysOnTop".into(), json!(value));
    } else {
        settings = json!({ "alwaysOnTop": value });
    }
    write_settings_object(app, settings);
}

/// Which monitor the bar should appear on. `None` means "primary monitor",
/// which is also the default the spec asks for.
pub fn get_selected_monitor_name(app: &AppHandle) -> Option<String> {
    read_settings_object(app)
        .get("monitorName")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn set_selected_monitor_name(app: &AppHandle, name: Option<String>) {
    let mut settings = read_settings_object(app);
    if let Value::Object(ref mut map) = settings {
        match name {
            Some(n) => { map.insert("monitorName".into(), json!(n)); }
            None => { map.remove("monitorName"); }
        }
    }
    write_settings_object(app, settings);
}

pub fn get_bar_position(app: &AppHandle) -> String {
    read_settings_object(app)
        .get("barPosition")
        .and_then(|v| v.as_str())
        .unwrap_or("top-center")
        .to_string()
}

/// Default is `true` — the bar is visible out of the box.
pub fn get_show_bar(app: &AppHandle) -> bool {
    read_settings_object(app)
        .get("showBar")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

pub fn set_show_bar(app: &AppHandle, value: bool) {
    let mut settings = read_settings_object(app);
    if let Value::Object(ref mut map) = settings {
        map.insert("showBar".into(), json!(value));
    } else {
        settings = json!({ "showBar": value });
    }
    write_settings_object(app, settings);
}
