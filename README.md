# Prayer Bar

A minimalist floating glass prayer-time bar for Windows, built with Tauri —
plus one unified main window (Home / Alarms / all Settings) with Arabic
(RTL) as the primary language.

## Status as of this pass

This was a large "final polish" pass covering 13 requirement areas at once.
Everything below is implemented in code and passes `tsc --noEmit` + a real
`vite build`. **Rust compilation is still unverified** — this sandbox's
toolchain (1.75) is too old for Tauri v2's dependencies (needs 1.77.2+),
and rustup's installer domain isn't reachable from here. The GitHub Actions
workflow (Path A below) is where this gets a real compiler for the first
time.

## What changed this pass

**1. One unified window.** The separate Settings window is gone. Home,
Alarms, and every Settings category (General/Location/Calculation/Adhan/
Iqama/Notifications) are now tabs in a single window (`src/panel/`), one
tab bar, one visual language. The floating bar remains its own window
(it has to — it's an always-on-top overlay, fundamentally different from a
normal window).

**2. Real native blur, not fake CSS blur.** Confirmed via research that
`backdrop-filter` in a Tauri `transparent: true` window only blurs the
app's own content, not the real desktop behind it — a real, still-open
upstream limitation, not something we were doing wrong. Fixed with
`window-vibrancy`'s `apply_acrylic` (the documented, correct approach for
Tauri 2 on Windows). This is new, added, **uncompiled** Rust
(`src-tauri/src/vibrancy.rs`) — the single highest-risk piece of this pass.

**3. Bar redesign.** Simplified to one text node per state (letting the
browser's bidi algorithm correctly interleave Arabic text and Western
numerals, matching your reference images exactly instead of fighting it
with manual spans). Three fixed native tint colors — charcoal (normal),
dark green (Adhan/alarm), dark red (last 5 min before Iqama) — applied via
real acrylic, not CSS. The Adhan/alarm announcement is a horizontal layout
(text + a distinctly-bordered acknowledge button) matching your sketch,
not the vertical stack from the previous pass.

**4. Location: Wilaya → Commune.** Removed city search, "detect my
location," and manual lat/lng/timezone entry entirely, per your
instruction. Replaced with Country (fixed: Algeria) → Wilaya (all 58,
complete) → Commune (see honest limitation below).

**5. Dead settings removed.** Glass opacity/blur/accent-color/compact-mode
sliders are gone — they no longer connected to anything real once the bar's
colors became fixed native tints, and leaving them would have been exactly
the "fake control" you told me not to leave.

## Honest limitations — read this before assuming something is complete

- **Commune data is NOT the complete official list.** Algeria has 1,541
  communes. Reliably listing all of them, correctly grouped by wilaya, from
  memory, without a real dataset to check against, isn't something that can
  be done accurately — attempting it risked silently wrong data, which is
  worse than disclosing the gap. What's included (`src/lib/algeria.ts`) is
  a best-effort partial list (~3-6 well-known communes per wilaya for the
  original 48; just the capital for the 10 wilayas created in 2019). All
  communes under a wilaya currently share that wilaya's coordinates — there
  is no independently-verified per-commune coordinate data. If you have (or
  can point me to) an authoritative commune dataset, I can integrate it
  properly instead of extending this piecemeal.
- **Rounded window corners with real acrylic**: native acrylic tints the
  window's full rectangular bounds, not the CSS-rounded pill shape. Getting
  true rounded *window* corners requires raw Win32 `SetWindowRgn` calls,
  which need a `windows` crate version that exactly matches whatever
  Tauri 2.11.5 uses internally — unverifiable without a working compiler.
  I deliberately did not guess at this (real crash risk if the version is
  wrong); the disclosed cosmetic consequence is a faint square-ish sliver
  possibly visible just outside the pill's rounded corners.
- **"Spring" animation**: Win32 doesn't animate window resize natively, so
  the window itself snaps to its new size instantly; the spring/bounce feel
  comes from a CSS animation on the content synced to that resize. This is
  a standard technique for this kind of UI, but its exact feel is
  unverified without a real Windows machine.
- **Everything Rust-side** is written correctly against documented APIs but
  not compiled. `vibrancy.rs` is the newest and riskiest file.

## Running

```bash
npm install
npm run tauri dev   # requires Rust + Tauri prerequisites on Windows
```

Frontend-only preview (visuals only, no Tauri APIs):
```bash
npm install
npm run dev
# open http://localhost:1420/src/bar/index.html or /src/panel/panel.html
```

## Building the real installer

Push to GitHub and run the "Build Windows Installer" Actions workflow
(`.github/workflows/build.yml`) — this compiles on a real Windows machine
with a current Rust toolchain, which is the first real test of everything
in this pass. If it fails, `vibrancy.rs` and the `window.set_size()` calls
in `windows.rs` are the first places to check.
