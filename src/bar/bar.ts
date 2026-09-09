import {
  DailyPrayerTimes,
  PrayerName,
  findNextPrayer,
} from "../lib/prayerCalc";
import { resolveDailyTimes, scheduleKey } from "../lib/scheduleResolver";
import { PrayerEngine, IqamaConfig, BarState } from "../lib/stateMachine";
import { getSettings, invalidateSettingsCache, AppSettings, Alarm } from "../lib/store";
import { playChime, playAdhanFile, stopAdhan } from "../lib/audio";

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const el = {
  bar: document.getElementById("bar")!,
  content: document.getElementById("barContent")!,
  text: document.getElementById("barText")!,
  announce: document.getElementById("barAnnounce")!,
  announceText: document.getElementById("announceText")!,
  btnAcknowledge: document.getElementById("btnAcknowledge") as HTMLButtonElement,
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
    // fails soft in the real app too — a failed call shouldn't take down
    // the countdown.
    return undefined;
  }
}

let currentSettings: AppSettings | null = null;

async function notify(title: string, body: string) {
  if (!currentSettings?.notificationsEnabled) return;
  await safeInvoke("show_notification", { title, body });
}

// ---------- Native tone/size (Rust resizes + re-tints with real acrylic) ----------
type Tone = "normal" | "warning" | "adhan";
let currentTone: Tone = "normal";

async function setTone(tone: Tone) {
  if (tone === currentTone) return;
  const previous = currentTone;
  currentTone = tone;
  el.bar.dataset.tone = tone;

  await safeInvoke("set_bar_visual", { tone });

  // Drive the spring animation on the content, synced with the (instant)
  // native window resize — see bar.css for why this approach is used.
  if (tone === "adhan") {
    playSpring("expand");
  } else if (previous === "adhan") {
    playSpring("collapse");
  }
}

function playSpring(kind: "expand" | "collapse") {
  el.bar.dataset.anim = kind;
  window.setTimeout(() => {
    if (el.bar.dataset.anim === kind) delete el.bar.dataset.anim;
  }, kind === "expand" ? 500 : 440);
}

/**
 * The big expanded announcement (Adhan for a prayer, or a custom alarm).
 * Stays expanded until the user clicks the acknowledge button — the
 * underlying PrayerEngine keeps ticking normally in the background while
 * this is showing, so by the time the user dismisses it, the countdown
 * underneath has already naturally moved into the Iqama phase.
 */
let announcement: { text: string } | null = null;

function showAnnouncement(text: string) {
  announcement = { text };
  el.announceText.textContent = text;
  el.bar.dataset.announce = "true";
  setTone("adhan");
}

function dismissAnnouncement() {
  announcement = null;
  el.bar.dataset.announce = "false";
  setTone("normal");
}

el.btnAcknowledge.addEventListener("click", (e) => {
  e.stopPropagation();
  stopAdhan();
  engine.silenceCurrent();
  dismissAnnouncement();
  tick();
});

async function onEnterAdhan(prayer: PrayerName) {
  await notify(PRAYER_LABELS[prayer], `حان الآن وقت صلاة ${PRAYER_LABELS[prayer]}.`);
  showAnnouncement(`حان وقت صلاة ${PRAYER_LABELS[prayer]}`);

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

// Fired once when the 5-min-before-Iqama window begins: a brief grow pulse
// (no window resize — stays compact) plus the alert chime, and the tone
// switches to "warning" (dark red) for the duration of that final 5-minute
// window, reverting to "normal" once Iqama time itself arrives.
async function onEnterIqamaWarning(prayer: PrayerName) {
  if (!currentSettings?.reminderEnabled) return;
  await notify(`إقامة ${PRAYER_LABELS[prayer]}`, "ستبدأ الإقامة بعد 5 دقائق.");
  playChime(currentSettings.adhanVolume);
  el.bar.dataset.grow = "true";
  window.setTimeout(() => { el.bar.dataset.grow = "false"; }, 750);
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

let engine = new PrayerEngine(
  { fajr: 20, dhuhr: 15, asr: 15, maghrib: 10, isha: 15 },
  { onEnterAdhan, onEnterIqamaWarning, onEnterIqamaDue }
);

let cachedToday: DailyPrayerTimes | null = null;
let cachedTomorrow: DailyPrayerTimes | null = null;
let cachedForKey = "";

function ensureTimesForToday(settings: AppSettings) {
  const now = new Date();
  const key = scheduleKey(settings, now);
  if (key === cachedForKey && cachedToday && cachedTomorrow) return;

  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  cachedToday = resolveDailyTimes(settings, now);
  cachedTomorrow = resolveDailyTimes(settings, tomorrowDate);
  cachedForKey = key;
}

function render(barState: BarState, prayer: PrayerName, secondsRemaining: number) {
  if (announcement) return; // overlay owns the display until dismissed

  switch (barState) {
    case "iqama":
      setTone("normal");
      el.text.textContent = `${formatCountdown(secondsRemaining)}\u00A0\u00A0إقامة ${PRAYER_LABELS[prayer]}`;
      break;
    case "iqamaWarning":
      setTone("warning");
      el.text.textContent = `${formatCountdown(secondsRemaining)}\u00A0\u00A0إقامة ${PRAYER_LABELS[prayer]}`;
      break;
    case "paused":
      setTone("normal");
      el.text.textContent = "الإشعارات متوقفة مؤقتًا";
      break;
    default: // normal | close
      setTone("normal");
      el.text.textContent = `${formatCountdown(secondsRemaining)}\u00A0\u00A0${PRAYER_LABELS[prayer]}`;
  }
}

// Tracks the last date each alarm fired on, so it fires once per day at its
// configured time rather than every second while the clock matches.
const lastFiredDateForAlarm = new Map<string, string>();

function checkAlarms(settings: AppSettings, now: Date) {
  if (engine.isPaused) return;

  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  for (const alarm of settings.alarms as Alarm[]) {
    if (!alarm.enabled || alarm.time !== nowHHMM) continue;
    if (lastFiredDateForAlarm.get(alarm.id) === today) continue;
    lastFiredDateForAlarm.set(alarm.id, today);

    notify(alarm.name || "منبه", "حان وقت المنبه الذي حددته.");
    showAnnouncement(alarm.name || "منبه");
    playChime(settings.adhanVolume);
  }
}

async function tick() {
  if (!currentSettings) currentSettings = await getSettings();
  ensureTimesForToday(currentSettings);
  if (!cachedToday || !cachedTomorrow) return;

  const now = new Date();
  const state = engine.tick(cachedToday, cachedTomorrow, now);
  render(state.barState, state.prayerName, state.secondsRemaining);
  checkAlarms(currentSettings, now);
}

el.bar.addEventListener("click", () => {
  if (announcement) return; // announcement is dismissed only via its own button
  safeInvoke("toggle_main_window");
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tick();
});
window.addEventListener("focus", tick);

listen<void>("settings-changed", async () => {
  invalidateSettingsCache();
  currentSettings = await getSettings();
  engine.setIqamaConfig(iqamaFromSettings(currentSettings));
  cachedForKey = ""; // force recompute even if the date didn't change
  await tick();
}).catch(() => {
  /* not running inside Tauri (dev preview) — settings changes won't push, that's fine */
});

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

const INDEFINITE_PAUSE = () => new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000);
listen("pause-toggle-shortcut", () => {
  if (engine.isPaused) engine.resume();
  else engine.pause(INDEFINITE_PAUSE());
  tick();
}).catch(() => {});

async function init() {
  currentSettings = await getSettings();
  engine.setIqamaConfig(iqamaFromSettings(currentSettings));
  await tick();
  setInterval(tick, 1000);
}

init();
