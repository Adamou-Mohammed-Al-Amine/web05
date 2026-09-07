import { calculateDailyTimes, DailyPrayerTimes, findNextPrayer, PrayerName } from "../lib/prayerCalc";
import { getSettings, invalidateSettingsCache } from "../lib/store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const PRAYER_ORDER: PrayerName[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
const PRAYER_LABELS_AR: Record<PrayerName, string> = {
  fajr: "الفجر",
  sunrise: "الشروق",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

const el = {
  currentDate: document.getElementById("currentDate")!,
  currentClock: document.getElementById("currentClock")!,
  nextPrayerName: document.getElementById("nextPrayerName")!,
  nextPrayerCountdown: document.getElementById("nextPrayerCountdown")!,
  progressFill: document.getElementById("progressFill")!,
  prayersGrid: document.getElementById("prayersGrid")!,
  btnOpenSettings: document.getElementById("btnOpenSettings") as HTMLButtonElement,
};

function formatClock(d: Date): string {
  return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ar", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `متبقي ${hours}س ${minutes}د`;
  return `متبقي ${minutes}د`;
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

let cachedToday: DailyPrayerTimes | null = null;
let cachedTomorrow: DailyPrayerTimes | null = null;
let cachedForKey = "";

function keyFor(settings: Awaited<ReturnType<typeof getSettings>>, now: Date): string {
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}:${settings.location.latitude},${settings.location.longitude},${settings.location.timeZoneId},${settings.calculationMethod},${settings.madhab}`;
}

async function ensureTimes(now: Date) {
  const settings = await getSettings();
  const key = keyFor(settings, now);
  if (key === cachedForKey && cachedToday && cachedTomorrow) return;

  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  cachedToday = calculateDailyTimes(now, settings.location, settings.calculationMethod, settings.madhab, settings.offsets);
  cachedTomorrow = calculateDailyTimes(tomorrowDate, settings.location, settings.calculationMethod, settings.madhab, settings.offsets);
  cachedForKey = key;
}

function renderGrid(today: DailyPrayerTimes, now: Date, activePrayer: PrayerName) {
  el.prayersGrid.innerHTML = "";
  for (const name of PRAYER_ORDER) {
    const time = today[name];
    const passed = time.getTime() <= now.getTime();
    const isActive = name === activePrayer;

    const card = document.createElement("div");
    card.className = "prayer-card";
    card.dataset.active = String(isActive);
    card.dataset.passed = String(passed && !isActive);

    const nameEl = document.createElement("div");
    nameEl.className = "prayer-card-name";
    nameEl.textContent = PRAYER_LABELS_AR[name];

    const timeEl = document.createElement("div");
    timeEl.className = "prayer-card-time";
    timeEl.textContent = formatTime(time);

    const statusEl = document.createElement("div");
    statusEl.className = "prayer-card-status";
    if (name === "sunrise") {
      statusEl.textContent = passed ? "مضى" : formatRemaining(time.getTime() - now.getTime());
    } else if (isActive) {
      statusEl.textContent = "الوقت الحالي";
    } else if (passed) {
      statusEl.textContent = "انقضى";
    } else {
      statusEl.textContent = formatRemaining(time.getTime() - now.getTime());
    }

    card.append(nameEl, timeEl, statusEl);
    el.prayersGrid.appendChild(card);
  }
}

function progressToward(today: DailyPrayerTimes, prayer: PrayerName, now: Date): number {
  const order: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  const idx = order.indexOf(prayer);
  const target = today[prayer];
  const prevName = idx <= 0 ? "isha" : order[idx - 1];
  const prevTime = idx <= 0 ? new Date(today[prayer].getTime() - 12 * 3600 * 1000) : today[prevName as PrayerName];
  const span = target.getTime() - prevTime.getTime();
  if (span <= 0) return 0;
  return ((now.getTime() - prevTime.getTime()) / span) * 100;
}

async function tick() {
  const now = new Date();
  await ensureTimes(now);
  if (!cachedToday || !cachedTomorrow) return;

  el.currentClock.textContent = formatClock(now);
  el.currentDate.textContent = formatDate(now);

  const next = findNextPrayer(cachedToday, cachedTomorrow, now);
  const secondsRemaining = Math.max(0, Math.floor((next.time.getTime() - now.getTime()) / 1000));

  el.nextPrayerName.textContent = PRAYER_LABELS_AR[next.name];
  el.nextPrayerCountdown.textContent = formatCountdown(secondsRemaining);
  el.progressFill.style.setProperty("--progress", `${progressToward(cachedToday, next.name, now)}%`);

  renderGrid(cachedToday, now, next.name);
}

el.btnOpenSettings.addEventListener("click", async () => {
  try {
    await invoke("open_settings_window");
  } catch {
    /* ignore outside Tauri */
  }
});

listen("settings-changed", async () => {
  invalidateSettingsCache();
  cachedForKey = ""; // force recompute
  await tick();
}).catch(() => {});

tick();
setInterval(tick, 1000);
