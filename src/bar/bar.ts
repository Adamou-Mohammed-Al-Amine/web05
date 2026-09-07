import {
  calculateDailyTimes,
  DailyPrayerTimes,
  PrayerName,
  findNextPrayer,
} from "../lib/prayerCalc";
import { PrayerEngine, IqamaConfig, BarState } from "../lib/stateMachine";
import { getSettings, invalidateSettingsCache, AppSettings } from "../lib/store";
import { playChime, playAdhanFile, stopAdhan } from "../lib/audio";

// Tauri APIs. Wrapped in try/catch at call sites so this file also degrades
// gracefully to a visual-only preview when opened outside a Tauri webview
// (e.g. `npm run dev` in a plain browser for UI iteration).
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const el = {
  bar: document.getElementById("bar")!,
  icon: document.getElementById("barIcon")!,
  prayerName: document.getElementById("barPrayerName")!,
  countdown: document.getElementById("barCountdown")!,
  progress: document.getElementById("barProgress")!,
  controls: document.getElementById("barControls")!,
  btnStop: document.getElementById("btnStop") as HTMLButtonElement,
  btnResume: document.getElementById("btnResume") as HTMLButtonElement,
};

const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: "الفجر",
  sunrise: "الشروق",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await invoke<T>(cmd, args);
  } catch {
    // No-ops outside a real Tauri webview (plain-browser dev preview), and
    // fails soft in the real app too — a failed notification shouldn't take
    // down the countdown.
    return undefined;
  }
}

let currentSettings: AppSettings | null = null;

async function notify(title: string, body: string) {
  if (!currentSettings?.notificationsEnabled) return;
  await safeInvoke("show_notification", { title, body });
}

async function onEnterAdhan(prayer: PrayerName) {
  await notify(PRAYER_LABELS[prayer], `حان الآن وقت صلاة ${PRAYER_LABELS[prayer]}.`);

  if (!currentSettings?.adhanEnabled) return;
  const path = currentSettings.adhanSoundPath;
  if (!path) return; // no file configured — visual + notification only, per spec

  try {
    const src = convertFileSrc(path);
    await playAdhanFile(src, currentSettings.adhanVolume);
  } catch {
    // Bad/moved file — don't let this break the countdown.
  }
}

async function onEnterIqamaWarning(prayer: PrayerName) {
  if (!currentSettings?.reminderEnabled) return;
  await notify(`إقامة ${PRAYER_LABELS[prayer]}`, "ستبدأ الإقامة بعد 5 دقائق.");
  playChime(currentSettings.adhanVolume);
}

async function onEnterIqamaDue(_prayer: PrayerName) {
  if (!currentSettings?.reminderEnabled) return;
  playChime((currentSettings?.adhanVolume ?? 0.5) * 0.7);
}

function iqamaFromSettings(settings: AppSettings): IqamaConfig {
  if (!settings.iqamaEnabled) {
    // A zero-minute Iqama window for every prayer means the state machine
    // passes through "iqama"/"iqamaWarning" in under a second and lands
    // back on the normal countdown toward the next prayer — effectively
    // "no Iqama countdown" without needing a separate code path in
    // stateMachine.ts.
    return { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  }
  return settings.iqama;
}

/** Applies the Appearance settings (opacity/blur/accent) as CSS variables. */
function applyAppearance(settings: AppSettings) {
  const root = document.documentElement.style;
  root.setProperty("--glass-bg", `rgba(20, 20, 25, ${settings.glassOpacity})`);
  root.setProperty("--glass-blur", `${settings.blurIntensity}px`);
  root.setProperty("--accent", settings.accentColor);
  el.bar.dataset.compact = String(settings.compactMode);
}

let engine = new PrayerEngine(
  { fajr: 20, dhuhr: 15, asr: 15, maghrib: 10, isha: 15 },
  { onEnterAdhan, onEnterIqamaWarning, onEnterIqamaDue }
);

let cachedToday: DailyPrayerTimes | null = null;
let cachedTomorrow: DailyPrayerTimes | null = null;
let cachedForDateKey = "";
let cachedForLocationKey = "";

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function locationKey(s: AppSettings): string {
  return `${s.location.latitude},${s.location.longitude},${s.location.timeZoneId},${s.calculationMethod},${s.madhab},${JSON.stringify(s.offsets)}`;
}

/**
 * Recalculates prayer times only when the calendar day changes, or when
 * location/method/madhab/offsets change — never on every tick. This is the
 * perf-critical design from the spec: the countdown ticks every second, but
 * astronomical calculation happens only when something that affects it
 * actually changes.
 */
function ensureTimesForToday(settings: AppSettings) {
  const now = new Date();
  const dKey = dateKey(now);
  const lKey = locationKey(settings);
  if (dKey === cachedForDateKey && lKey === cachedForLocationKey && cachedToday && cachedTomorrow) {
    return;
  }

  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  cachedToday = calculateDailyTimes(now, settings.location, settings.calculationMethod, settings.madhab, settings.offsets);
  cachedTomorrow = calculateDailyTimes(tomorrowDate, settings.location, settings.calculationMethod, settings.madhab, settings.offsets);
  cachedForDateKey = dKey;
  cachedForLocationKey = lKey;
}

function render(barState: BarState, prayer: PrayerName, secondsRemaining: number, progressPercent: number) {
  el.bar.dataset.state = barState;

  const showControls = barState === "adhan" || barState === "iqama" || barState === "iqamaWarning";
  el.controls.hidden = !showControls;

  el.prayerName.textContent = PRAYER_LABELS[prayer];

  switch (barState) {
    case "adhan":
      el.icon.textContent = "🕌";
      el.countdown.textContent = "حان وقت الصلاة";
      break;
    case "iqama":
    case "iqamaWarning":
      el.icon.textContent = "🔴";
      el.countdown.textContent = `الإقامة بعد ${formatCountdown(secondsRemaining)}`;
      break;
    case "paused":
      el.icon.textContent = "⏸";
      el.prayerName.textContent = "الإشعارات متوقفة مؤقتًا";
      el.countdown.textContent = "";
      break;
    default: // normal | close
      el.icon.textContent = "🕌";
      el.countdown.textContent = formatCountdown(secondsRemaining);
  }

  el.progress.style.setProperty("--progress", `${Math.min(100, Math.max(0, progressPercent))}%`);
}

function progressToward(today: DailyPrayerTimes, prayer: PrayerName, now: Date): number {
  const order: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  const idx = order.indexOf(prayer);
  const target = today[prayer];
  const prevName = idx <= 0 ? "isha" : order[idx - 1];
  const prevTime = idx <= 0
    ? new Date(today[prayer].getTime() - 12 * 3600 * 1000) // fallback window before the first tracked prayer of the day
    : today[prevName as PrayerName];

  const span = target.getTime() - prevTime.getTime();
  if (span <= 0) return 0;
  const elapsed = now.getTime() - prevTime.getTime();
  return (elapsed / span) * 100;
}

async function tick() {
  if (!currentSettings) currentSettings = await getSettings();
  ensureTimesForToday(currentSettings);
  if (!cachedToday || !cachedTomorrow) return;

  const now = new Date();
  const state = engine.tick(cachedToday, cachedTomorrow, now);
  const progress = progressToward(cachedToday, state.prayerName, now);
  render(state.barState, state.prayerName, state.secondsRemaining, progress);
}

el.bar.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest(".bar-controls")) return;
  safeInvoke("toggle_panel_window");
});

el.btnStop.addEventListener("click", (e) => {
  e.stopPropagation();
  engine.silenceCurrent();
  stopAdhan();
  el.btnStop.hidden = true;
  el.btnResume.hidden = false;
});

el.btnResume.addEventListener("click", async (e) => {
  e.stopPropagation();
  engine.unsilenceCurrent();
  el.btnResume.hidden = true;
  el.btnStop.hidden = false;
  // Resuming re-plays the Adhan if we're still within the Adhan moment;
  // if we've moved into the Iqama countdown there's nothing to resume
  // audio-wise, which matches "Stop silences the current sound" rather
  // than "Stop cancels the whole prayer's audio forever".
  if (el.bar.dataset.state === "adhan" && currentSettings?.adhanEnabled && currentSettings.adhanSoundPath) {
    try {
      await playAdhanFile(convertFileSrc(currentSettings.adhanSoundPath), currentSettings.adhanVolume);
    } catch {
      /* fail soft */
    }
  }
});

// Re-sync immediately when the window becomes visible again — a lightweight
// mitigation for sleep/wake alongside the state machine's fully-stateless
// per-tick recomputation (see stateMachine.ts / README for the full
// reasoning on why sleep/wake doesn't require an OS-level hook here).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tick();
});
window.addEventListener("focus", tick);

// The settings window emits this after saving so the bar picks up new
// Iqama minutes, calculation method, location, etc. immediately rather than
// waiting for the next natural recompute trigger.
listen<void>("settings-changed", async () => {
  invalidateSettingsCache();
  currentSettings = await getSettings();
  engine.setIqamaConfig(iqamaFromSettings(currentSettings));
  applyAppearance(currentSettings);
  cachedForLocationKey = ""; // force recompute even if the date didn't change
  await tick();
}).catch(() => {
  /* not running inside Tauri (dev preview) — settings changes won't push, that's fine */
});

// Tray "Pause Notifications" submenu emits one of these.
listen<{ untilMs: number | null }>("pause-set", (event) => {
  const until = event.payload.untilMs !== null ? new Date(event.payload.untilMs) : null;
  engine.pause(until);
  tick();
}).catch(() => {});

listen("pause-until-next", () => {
  if (cachedToday && cachedTomorrow) {
    const next = findNextPrayer(cachedToday, cachedTomorrow, new Date());
    engine.pause(next.time);
  }
  tick();
}).catch(() => {});

listen("pause-resume", () => {
  engine.resume();
  tick();
}).catch(() => {});

// Ctrl+Shift+M — toggles between "paused until manually resumed" and
// resumed, matching the tray's Pause/Resume pair rather than a third state.
// (Note: PrayerEngine.pause(null) means "not paused", same as resume() —
// so "paused indefinitely" is represented as a far-future date instead.)
const INDEFINITE_PAUSE = () => new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000);
listen("pause-toggle-shortcut", () => {
  if (engine.isPaused) engine.resume();
  else engine.pause(INDEFINITE_PAUSE());
  tick();
}).catch(() => {});

async function init() {
  currentSettings = await getSettings();
  engine.setIqamaConfig(iqamaFromSettings(currentSettings));
  applyAppearance(currentSettings);
  await tick();
  setInterval(tick, 1000);
}

init();
