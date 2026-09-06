# Prayer Bar

A minimalist floating glass prayer-time bar for Windows, built with Tauri.

## Important: what "done" means here, honestly

I'm developing this from a Linux sandbox with no Windows, no GUI, and no way
to install a current Rust toolchain (rustup's installer isn't reachable from
here — the local apt package is Rust 1.75, and Tauri v2's dependencies
require 1.77.2+). That means:

- **I have not compiled this into an actual `.exe`.** I can't — not "haven't
  gotten to it," genuinely can't, in this environment.
- **I verified what I could.** The prayer-time math (`prayerCalc.ts`) is
  tested against known sun times for a real location/date, in plain
  Node — not assumed correct. I caught and fixed two real bugs that way
  (see git history / the calculation notes below). The Rust code is
  written against the Tauri v2 API as documented, but has **not** been
  compiled — I could get dependencies to download but not build, due to the
  toolchain version wall above. Treat the Rust side as reviewed-but-unverified
  until the first real build.
- **Getting you a real installer is still fully doable** — just not by me,
  in this chat, in this sandbox. Two paths below, pick whichever you prefer.

## Path A — GitHub Actions builds it for you (no Windows PC needed)

1. Push this project to a GitHub repo.
2. Go to the repo's **Actions** tab → **Build Windows Installer** → **Run workflow**.
3. Wait for it to finish (a few minutes) — it runs on GitHub's actual Windows
   servers with a current Rust toolchain, so this is where compilation
   errors, if any remain, will surface.
4. Download `prayer-bar-windows-installer` from the run's **Artifacts**.
   Inside is `Prayer Bar Setup 1.0.0.exe`.
5. If the build fails, the Actions log will show exactly which Rust API
   call is wrong — paste that error back to me and I'll fix it blind (I
   can reason about Tauri's API correctly even without compiling, I just
   can't guarantee zero typos without the compiler's help).

## Path B — build it yourself on your Windows PC

Prerequisites: https://v2.tauri.app/start/prerequisites/ (Rust, WebView2,
MSVC Build Tools, Node.js).

```powershell
npm install
npm run tauri build
```

The installer lands in
`src-tauri/target/release/bundle/nsis/Prayer Bar Setup 1.0.0.exe`.

## What's implemented in this pass

- **Your logo, converted to every icon Windows needs**: `icon.ico` (16–256px,
  verified to contain all 7 embedded resolutions), plus the PNG sizes Tauri's
  bundler expects, plus a dedicated tray icon. Wired into `tauri.conf.json`
  for the app icon, installer icon, and taskbar/Start Menu icon, and into
  the tray via `include_bytes!` in `tray.rs`.
- **NSIS installer config**: proper product name ("Prayer Bar"), Start Menu
  shortcut, optional desktop shortcut, installer icon — all in
  `tauri.conf.json`'s `bundle.windows.nsis` block.
- **No console window**: `#![windows_subsystem = "windows"]` in `main.rs`
  (release builds only — debug builds keep the console for your own
  troubleshooting).
- **Always on Top**: independent toggle, default ON. Lives in
  `settings.rs`/`commands.rs` on the Rust side (persisted, applied to the
  live window), exposed as a checkable tray menu item, and as a field in the
  frontend `AppSettings` type. It is fully independent of "Show Prayer Bar"
  and "Start with Windows" — toggling one never touches the others, per your
  spec.
- **Monitor-aware positioning**: `windows.rs` now actually queries connected
  monitors, remembers the selected one by name, falls back to primary (or
  the first available) if that monitor gets unplugged, and computes
  top-center/left/right position in logical pixels so it's DPI-consistent.
- **Background/hide behavior**: closing settings or the panel hides the
  window; only the tray "Quit" item calls `app.exit(0)`.

## What's still explicitly TODO (not built, not faked)

- `src/panel/`, `src/settings/`, `src/onboarding/` — referenced by the Rust
  window builders but the HTML/TS files don't exist yet. The settings UI is
  where "Show Prayer Bar" and monitor-picker controls need a visible home;
  right now they're wired end-to-end on the backend but nothing calls them.
- Actual audio playback — commands are no-ops.
- City search (needs the one online API call in the whole app).
- Global shortcuts (`Ctrl+Shift+P` / `Ctrl+Shift+M`) — plugin is loaded,
  nothing registered yet.
- Autostart toggle — plugin is loaded, not wired to a setting yet.
- Sleep/wake OS-level hook on the Rust side (frontend re-ticks on
  `visibilitychange`, which is a partial mitigation, not the full fix).
- **Full-screen exclusive apps/games**: Tauri's `always_on_top` uses the
  OS's normal always-on-top window flag. This reliably stays above regular
  windows, maximized windows, and borderless-fullscreen apps (most modern
  games and video players use borderless fullscreen). True *exclusive*
  fullscreen (some older DirectX games) can legitimately suspend all
  overlays at the OS level — this is a Windows compositor limitation, not
  something any app can force past, and matches what you asked for
  ("handle gracefully rather than crash," not "circumvent").

## Running the frontend alone (no Rust/Tauri needed)

For iterating on the bar's visuals only:

```bash
npm install
npm run dev
# open http://localhost:1420/src/bar/index.html
```

This is a **dev-only preview**, not the deliverable — `invoke()` calls
no-op outside Tauri, so Adhan/notifications/tray/always-on-top won't do
anything here. Path A or B above is what produces the actual application.

## Next steps

Panel window → settings window (this is where Always on Top / Show Bar /
Start with Windows get real UI toggles) → onboarding → autostart wiring →
first real build via Path A → fix whatever that build surfaces. Say the
word and I'll keep going.
