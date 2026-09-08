import { DailyPrayerTimes, findNextPrayer, PrayerName } from "../lib/prayerCalc";
import { resolveDailyTimes, scheduleKey } from "../lib/scheduleResolver";
import { getSettings, saveSettings, invalidateSettingsCache, Alarm } from "../lib/store";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";

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
  alarmsList: document.getElementById("alarmsList")!,
  newAlarmName: document.getElementById("newAlarmName") as HTMLInputElement,
  newAlarmTime: document.getElementById("newAlarmTime") as HTMLInputElement,
  btnAddAlarm: document.getElementById("btnAddAlarm") as HTMLButtonElement,
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

// ---------- Tabs ----------
document.querySelectorAll<HTMLButtonElement>(".main-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll<HTMLButtonElement>(".main-tab").forEach((t) => (t.dataset.active = "false"));
    document.querySelectorAll<HTMLElement>(".tab-panel").forEach((p) => (p.dataset.active = "false"));
    tab.dataset.active = "true";
    document.querySelector<HTMLElement>(`.tab-panel[data-panel="${tab.dataset.tab}"]`)!.dataset.active = "true";
  });
});

// ---------- Prayer schedule ----------
let cachedToday: DailyPrayerTimes | null = null;
let cachedTomorrow: DailyPrayerTimes | null = null;
let cachedForKey = "";

async function ensureTimes(now: Date) {
  const settings = await getSettings();
  const key = scheduleKey(settings, now);
  if (key === cachedForKey && cachedToday && cachedTomorrow) return;

  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  cachedToday = resolveDailyTimes(settings, now);
  cachedTomorrow = resolveDailyTimes(settings, tomorrowDate);
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

// ---------- Alarms ----------
function renderAlarms(alarms: Alarm[]) {
  el.alarmsList.innerHTML = "";

  if (alarms.length === 0) {
    const empty = document.createElement("div");
    empty.className = "alarms-empty";
    empty.textContent = "لا توجد منبهات بعد — أضف واحدًا تحت.";
    el.alarmsList.appendChild(empty);
    return;
  }

  for (const alarm of alarms) {
    const card = document.createElement("div");
    card.className = "alarm-card";

    const info = document.createElement("div");
    info.className = "alarm-info";
    const name = document.createElement("div");
    name.className = "alarm-name";
    name.textContent = alarm.name || "منبه بلا اسم";
    const time = document.createElement("div");
    time.className = "alarm-time";
    time.textContent = alarm.time;
    info.append(name, time);

    const controls = document.createElement("div");
    controls.className = "alarm-controls";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "alarm-toggle";
    toggle.checked = alarm.enabled;
    toggle.addEventListener("change", async () => {
      const settings = await getSettings();
      const updated = settings.alarms.map((a) => (a.id === alarm.id ? { ...a, enabled: toggle.checked } : a));
      await saveSettings({ alarms: updated });
      await emit("settings-changed");
    });

    const del = document.createElement("button");
    del.className = "alarm-delete";
    del.textContent = "✕";
    del.title = "حذف";
    del.addEventListener("click", async () => {
      const settings = await getSettings();
      const updated = settings.alarms.filter((a) => a.id !== alarm.id);
      await saveSettings({ alarms: updated });
      await emit("settings-changed");
      renderAlarms(updated);
    });

    controls.append(toggle, del);
    card.append(controls, info);
    el.alarmsList.appendChild(card);
  }
}

el.btnAddAlarm.addEventListener("click", async () => {
  const name = el.newAlarmName.value.trim();
  const time = el.newAlarmTime.value;
  if (!time) return;

  const settings = await getSettings();
  const newAlarm: Alarm = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || "منبه",
    time,
    enabled: true,
  };
  const updated = [...settings.alarms, newAlarm];
  await saveSettings({ alarms: updated });
  await emit("settings-changed");

  el.newAlarmName.value = "";
  el.newAlarmTime.value = "";
  renderAlarms(updated);
});

// ---------- Main tick ----------
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
  const settings = await getSettings();
  renderAlarms(settings.alarms);
  await tick();
}).catch(() => {});

async function init() {
  const settings = await getSettings();
  renderAlarms(settings.alarms);
  await tick();
  setInterval(tick, 1000);
}

init();
