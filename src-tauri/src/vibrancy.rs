use tauri::WebviewWindow;
use window_vibrancy::{apply_acrylic, clear_acrylic};

/// Applies (or re-tints) the native Windows acrylic blur effect on a window.
///
/// This exists because CSS `backdrop-filter` in a Tauri window with
/// `transparent: true` does NOT blur the real desktop behind it — it only
/// blurs the app's own webview content. This is a long-standing, still-open
/// upstream limitation (tauri-apps/tauri issues #2827, #10064, #12437,
/// #12804 — confirmed via search, not assumed). `window-vibrancy`'s
/// `apply_acrylic` uses the real Windows DWM composition API instead, which
/// does genuinely blur whatever is behind the window.
///
/// Known tradeoff, disclosed rather than hidden: acrylic tints/blurs the
/// window's entire rectangular bounds, not just the CSS-rounded pill shape
/// drawn inside it. Properly clipping the OS window itself to a rounded
/// region requires raw Win32 calls (SetWindowRgn) via the `windows` crate —
/// which was deliberately NOT added here, because its version must exactly
/// match whatever windows-rs version Tauri 2.11.5 uses internally for
/// `WebviewWindow::hwnd()` to be usable, and that can't be confirmed without
/// a working compiler (unavailable in this project's dev sandbox — see
/// README). Getting it wrong would be a guessed, untested unsafe FFI call
/// with real crash risk. The visible consequence: the window's rectangular
/// corners (just outside the rounded pill) may show a faint blurred sliver
/// rather than being perfectly invisible. This is a cosmetic imperfection,
/// not a functional bug, and is an explicit, deliberate scope cut — see the
/// final checklist in the handoff message.
///
/// NOT independently compiled or run in this sandbox. Written directly
/// against window-vibrancy's documented public API (confirmed via its
/// README/docs.rs during this session). Failure is always non-fatal: the
/// bar keeps working with a flat tinted background instead of blurred
/// glass if this fails on a given system.
pub fn set_bar_tint(window: &WebviewWindow, rgba: (u8, u8, u8, u8)) {
    // Clearing first avoids any stacking/artifact issues when re-tinting
    // for a state change (normal -> adhan -> warning, etc.) rather than
    // applying fresh each time.
    let _ = clear_acrylic(window);
    if let Err(e) = apply_acrylic(window, Some(rgba)) {
        eprintln!("[vibrancy] apply_acrylic failed (non-fatal, falling back to flat CSS background): {e:?}");
    }
}
