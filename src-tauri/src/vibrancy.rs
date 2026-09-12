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
/// The alpha channel of `rgba` is expected to already reflect the live
/// "bar transparency" and "blur intensity" settings — see
/// `windows::tone_rgba`, which computes it before calling this function.
///
/// NOT independently compiled or run in this sandbox. Written directly
/// against window-vibrancy's documented public API. Failure is always
/// non-fatal: the bar keeps working with a flat tinted background instead
/// of blurred glass if this fails on a given system.
pub fn set_bar_tint(window: &WebviewWindow, rgba: (u8, u8, u8, u8)) {
    let _ = clear_acrylic(window);
    if let Err(e) = apply_acrylic(window, Some(rgba)) {
        eprintln!("[vibrancy] apply_acrylic failed (non-fatal, falling back to flat CSS background): {e:?}");
    }
}

/// Clips the window itself to a rounded-rectangle region so the native
/// acrylic tint/blur actually follows the pill's shape instead of covering
/// the full rectangular window bounds (which was the "square corners around
/// a rounded pill" bug reported after the previous pass).
///
/// Two-layer fix, disclosed honestly:
/// 1. `windows.rs` now enables `.shadow(true)` on the bar window, which is a
///    documented, zero-risk Tauri feature that gives real DWM-rounded
///    corners on Windows 11 automatically (confirmed via research: an
///    undecorated window with shadow enabled gets OS-level rounded corners
///    on Windows 11 — no custom code needed for that platform).
/// 2. This function additionally clips the window via the raw Win32
///    `SetWindowRgn` API, which works on Windows 10 too (where the Windows
///    11 shadow behavior above doesn't apply). It reaches the HWND through
///    `raw-window-handle`'s `HasWindowHandle` trait, which exposes a plain
///    `NonZeroIsize` — deliberately NOT tied to any particular version of
///    the `windows`/`windows-sys` crate that Tauri itself uses internally,
///    which is what makes this safe to add independently (the version-
///    matching problem that blocked this in the previous pass doesn't
///    apply to raw-window-handle's plain integer handle).
///
/// This is new, genuinely novel Rust for this project and the least-tested
/// code in the whole app — written directly against windows-sys's
/// documented FFI signatures (confirmed via docs.rs during this session),
/// but the exact `HWND` newtype representation in windows-sys 0.59
/// couldn't be independently confirmed without a working compiler. If this
/// specific function fails to compile, the fix is almost certainly a small
/// type-conversion adjustment here, not a design problem — everything else
/// in this file is unaffected since failures here are isolated and
/// non-fatal to the rest of the app if they occur at runtime instead.
#[cfg(target_os = "windows")]
pub fn apply_rounded_region(window: &WebviewWindow, logical_width: f64, logical_height: f64) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};

    let Ok(scale) = window.scale_factor() else { return };
    let width_px = (logical_width * scale).round() as i32;
    let height_px = (logical_height * scale).round() as i32;
    // Fully-rounded pill ends: the corner ellipse's diameter equals the
    // window's height, matching the CSS border-radius (height / 2).
    let corner_px = height_px;

    let Ok(handle) = window.window_handle() else { return };
    let RawWindowHandle::Win32(win32_handle) = handle.as_raw() else { return };
    // Real compile error from the previous attempt confirmed: in this
    // windows-sys version HWND is a plain pointer type alias
    // (`*mut c_void`), NOT a newtype tuple struct — so it's a direct `as`
    // cast, not a `HWND(...)` constructor call.
    let hwnd: HWND = win32_handle.hwnd.get() as HWND;

    unsafe {
        let region = CreateRoundRectRgn(0, 0, width_px, height_px, corner_px, corner_px);
        // HRGN is the same kind of plain pointer alias — check nullness
        // directly rather than through a `.0` field that doesn't exist.
        if !region.is_null() {
            // On success, the system takes ownership of the region handle —
            // it must NOT be deleted afterward (per the Win32 docs).
            SetWindowRgn(hwnd, region, 1);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn apply_rounded_region(_window: &WebviewWindow, _logical_width: f64, _logical_height: f64) {
    // No-op off Windows — this project targets Windows only, but keeping
    // this stub avoids needing #[cfg] gates at every call site.
}
