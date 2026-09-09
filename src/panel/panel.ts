import { DailyPrayerTimes, findNextPrayer, PrayerName } from "../lib/prayerCalc";
import { resolveDailyTimes, scheduleKey } from "../lib/scheduleResolver";
import {
  getSettings,
  saveSettings,
  invalidateSettingsCache,
  AppSettings,
  Alarm,
  ManualPrayerTimes,
} from "../lib/store";
import { ALGERIA_WILAYAS, COMMUNES_BY_WILAYA, wilayaToLocation } from "../lib/algeria";
import { playAdhanFile } from "../lib/audio";

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";

const PRAYER_ORDER: PrayerName[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
const PRAYER_LABELS_AR: Record<PrayerName, string> = {
  fajr: "الفجر",
  sunrise: "الشروق",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

interface MonitorInfo { name: string | null; is_primary: boolean; width: number; height: number }

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try { return await invoke<T>(cmd, args); } catch (e) { console.warn(`invoke(${cmd}) failed`, e); return undefined; }
}

// ================= Element refs =================
const el = {
  currentDate: document.getElementById("currentDate")!,
  currentClock: document.getElementById("currentClock")!,
  nextPrayerName: document.getElementById("nextPrayerName")!,
  nextPrayerCountdown: document.getElementById("nextPrayerCountdown")!,
  progressFill: document.getElementById("progressFill")!,
  prayersGrid: document.getElementById("prayersGrid")!,

  alarmsList: document.getElementById("alarmsList")!,
  newAlarmName: document.getElementById("newAlarmName") as HTMLInputElement,
  newAlarmTime: document.getElementById("newAlarmTime") as HTMLInputElement,
  btnAddAlarm: document.getElementById("btnAddAlarm") as HTMLButtonElement,

  startWithWindows: document.getElementById("fStartWithWindows") as HTMLInputElement,
  alwaysOnTop: document.getElementById("fAlwaysOnTop") as HTMLInputElement,
  showBar: document.getElementById("fShowBar") as HTMLInputElement,
  position: document.getElementById("fPosition") as HTMLSelectElement,
  monitor: document.getElementById("fMonitor") as HTMLSelectElement,

  wilaya: document.getElementById("fWilaya") as HTMLSelectElement,
  commune: document.getElementById("fCommune") as HTMLSelectElement,
  locationHint: document.getElementById("locationHint") as HTMLParagraphElement,

  method: document.getElementById("fMethod") as HTMLSelectElement,
  madhab: document.getElementById("fMadhab") as HTMLSelectElement,
  offFajr: document.getElementById("offFajr") as HTMLInputElement,
  offSunrise: document.getElementById("offSunrise") as HTMLInputElement,
  offDhuhr: document.getElementById("offDhuhr") as HTMLInputElement,
  offAsr: document.getElementById("offAsr") as HTMLInputElement,
  offMaghrib: document.getElementById("offMaghrib") as HTMLInputElement,
  offIsha: document.getElementById("offIsha") as HTMLInputElement,

  manualTimesEnabled: document.getElementById("fManualTimesEnabled") as HTMLInputElement,
  manualTimesFields: document.getElementById("manualTimesFields") as HTMLDivElement,
  manFajr: document.getElementById("manFajr") as HTMLInputElement,
  manSunrise: document.getElementById("manSunrise") as HTMLInputElement,
  manDhuhr: document.getElementById("manDhuhr") as HTMLInputElement,
  manAsr: document.getElementById("manAsr") as HTMLInputElement,
  manMaghrib: document.getElementById("manMaghrib") as HTMLInputElement,
  manIsha: document.getElementById("manIsha") as HTMLInputElement,

  adhanEnabled: document.getElementById("fAdhanEnabled") as HTMLInputElement,
  adhanFileLabel: document.getElementById("adhanFileLabel") as HTMLParagraphElement,
  btnChooseAdhan: document.getElementById("btnChooseAdhan") as HTMLButtonElement,
  btnTestAdhan: document.getElementById("btnTestAdhan") as HTMLButtonElement,
  volume: document.getElementById("fVolume") as HTMLInputElement,

  iqamaEnabled: document.getElementById("fIqamaEnabled") as HTMLInputElement,
  iqFajr: document.getElementById("iqFajr") as HTMLInputElement,
  iqDhuhr: document.getElementById("iqDhuhr") as HTMLInputElement,
  iqAsr: document.getElementById("iqAsr") as HTMLInputElement,
  iqMaghrib: document.getElementById("iqMaghrib") as HTMLInputElement,
  iqIsha: document.getElementById("iqIsha") as HTMLInputElement,
  reminderEnabled: document.getElementById("fReminderEnabled") as HTMLInputElement,

  notificationsEnabled: document.getElementById("fNotificationsEnabled") as HTMLInputElement,

  welcomeBanner: document.getElementById("welcomeBanner") as HTMLDivElement,
  btnDismissWelcome: document.getElementById("btnDismissWelcome") as HTMLButtonElement,
  saveIndicator: document.getElementById("saveIndicator") as HTMLSpanElement,
};

let settings: AppSettings;
let saveIndicatorTimeout: number | undefined;

function flashSaved() {
  el.saveIndicator.textContent = "تم الحفظ";
  el.saveIndicator.classList.add("visible");
  window.clearTimeout(saveIndicatorTimeout);
  saveIndicatorTimeout = window.setTimeout(() => el.saveIndicator.classList.remove("visible"), 1200);
}

async function update(partial: Partial<AppSettings>) {
  settings = await saveSettings(partial);
  await emit("settings-changed");
  flashSaved();
}

// ================= Tabs (one unified navigation for the whole app) =================
document.querySelectorAll<HTMLButtonElement>(".main-tab").forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab!));
});

function activateTab(name: string) {
  document.querySelectorAll<HTMLButtonElement>(".main-tab").forEach((t) => (t.dataset.active = String(t.dataset.tab === name)));
  document.querySelectorAll<HTMLElement>(".tab-panel").forEach((p) => (p.dataset.active = String(p.dataset.panel === name)));
}

listen<string>("switch-tab", (event) => activateTab(event.payload)).catch(() => {});

// ================= Home =================
let cachedToday: DailyPrayerTimes | null = null;
let cachedTomorrow: DailyPrayerTimes | null = null;
let cachedForKey = "";

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
  return hours > 0 ? `متبقي ${hours}س ${minutes}د` : `متبقي ${minutes}د`;
}
function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

async function ensureTimes(now: Date) {
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
    if (name === "sunrise") statusEl.textContent = passed ? "مضى" : formatRemaining(time.getTime() - now.getTime());
    else if (isActive) statusEl.textContent = "الوقت الحالي";
    else if (passed) statusEl.textContent = "انقضى";
    else statusEl.textContent = formatRemaining(time.getTime() - now.getTime());

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

async function tickHome() {
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

// ================= Alarms =================
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
    toggle.checked = alarm.enabled;
    toggle.addEventListener("change", async () => {
      const updated = settings.alarms.map((a) => (a.id === alarm.id ? { ...a, enabled: toggle.checked } : a));
      await update({ alarms: updated });
    });
    const del = document.createElement("button");
    del.className = "alarm-delete";
    del.textContent = "✕";
    del.title = "حذف";
    del.addEventListener("click", async () => {
      const updated = settings.alarms.filter((a) => a.id !== alarm.id);
      await update({ alarms: updated });
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
  const newAlarm: Alarm = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: name || "منبه", time, enabled: true };
  const updated = [...settings.alarms, newAlarm];
  await update({ alarms: updated });
  el.newAlarmName.value = "";
  el.newAlarmTime.value = "";
  renderAlarms(updated);
});

// ================= General =================
function populateGeneral(s: AppSettings) {
  el.alwaysOnTop.checked = s.alwaysOnTop;
  el.showBar.checked = s.showBar;
  el.position.value = s.barPosition === "custom" ? "top-center" : s.barPosition;
}

el.alwaysOnTop.addEventListener("change", async () => {
  await update({ alwaysOnTop: el.alwaysOnTop.checked });
  await safeInvoke("set_always_on_top", { enabled: el.alwaysOnTop.checked });
});
el.showBar.addEventListener("change", async () => {
  await update({ showBar: el.showBar.checked });
  await safeInvoke("set_bar_visible", { visible: el.showBar.checked });
});
el.position.addEventListener("change", async () => {
  await update({ barPosition: el.position.value as AppSettings["barPosition"] });
  await safeInvoke("set_bar_position", { position: el.position.value });
});
el.monitor.addEventListener("change", async () => {
  const value = el.monitor.value === "__primary__" ? null : el.monitor.value;
  await update({ monitorName: value });
  await safeInvoke("set_bar_monitor", { monitorName: value });
});
el.startWithWindows.addEventListener("change", async () => {
  const enabled = el.startWithWindows.checked;
  try {
    if (enabled) await enableAutostart(); else await disableAutostart();
    await update({ startWithWindows: enabled });
  } catch (e) {
    console.warn("autostart toggle failed", e);
    el.startWithWindows.checked = !enabled;
  }
});
document.querySelectorAll<HTMLButtonElement>("[data-pause]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const kind = btn.dataset.pause;
    if (kind === "30") await emit("pause-set", { untilMs: Date.now() + 30 * 60_000 });
    else if (kind === "60") await emit("pause-set", { untilMs: Date.now() + 60 * 60_000 });
    else if (kind === "next") await emit("pause-until-next");
    else if (kind === "resume") await emit("pause-resume");
  });
});

async function populateMonitors(selected: string | null) {
  const monitors = (await safeInvoke<MonitorInfo[]>("list_monitors")) ?? [];
  el.monitor.innerHTML = "";
  const primaryOpt = document.createElement("option");
  primaryOpt.value = "__primary__";
  primaryOpt.textContent = "الشاشة الرئيسية";
  el.monitor.appendChild(primaryOpt);
  for (const m of monitors) {
    if (!m.name) continue;
    const opt = document.createElement("option");
    opt.value = m.name;
    opt.textContent = `${m.name} (${m.width}×${m.height})${m.is_primary ? " — رئيسية" : ""}`;
    el.monitor.appendChild(opt);
  }
  el.monitor.value = selected ?? "__primary__";
  if (el.monitor.value !== (selected ?? "__primary__")) el.monitor.value = "__primary__";
}

// ================= Location: Wilaya -> Commune (no search/detect/manual fields) =================
function populateWilayaOptions() {
  el.wilaya.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "-- اختر ولاية --";
  el.wilaya.appendChild(placeholder);
  for (const w of ALGERIA_WILAYAS) {
    const opt = document.createElement("option");
    opt.value = String(w.code);
    opt.textContent = w.nameAr;
    el.wilaya.appendChild(opt);
  }
}

function populateCommuneOptions(wilayaCode: number, selected: string | null) {
  el.commune.innerHTML = "";
  const communes = COMMUNES_BY_WILAYA[wilayaCode] ?? [];
  for (const c of communes) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    el.commune.appendChild(opt);
  }
  if (selected && communes.includes(selected)) el.commune.value = selected;

  const wilaya = ALGERIA_WILAYAS.find((w) => w.code === wilayaCode);
  const isNewWilaya = wilayaCode >= 49;
  el.locationHint.textContent = isNewWilaya
    ? `قائمة البلديات لولاية "${wilaya?.nameAr}" غير مكتملة حاليًا (ولاية حديثة، تقسيم 2019) — تُستخدم إحداثيات مركز الولاية.`
    : `قائمة جزئية للبلديات الأكثر شهرة في "${wilaya?.nameAr}" (وليس السجل الكامل الرسمي البالغ 1541 بلدية) — كل البلديات تستخدم إحداثيات مركز الولاية حاليًا.`;
}

function populateLocation(s: AppSettings) {
  const code = s.selectedWilayaCode ?? 16;
  el.wilaya.value = String(code);
  populateCommuneOptions(code, s.selectedCommune);
}

el.wilaya.addEventListener("change", async () => {
  const code = Number(el.wilaya.value);
  if (!code) return;
  const wilaya = ALGERIA_WILAYAS.find((w) => w.code === code);
  if (!wilaya) return;
  populateCommuneOptions(code, null);
  const location = wilayaToLocation(wilaya);
  const commune = COMMUNES_BY_WILAYA[code]?.[0] ?? wilaya.nameAr;
  el.commune.value = commune;
  await update({ location, selectedWilayaCode: code, selectedCommune: commune });
});

el.commune.addEventListener("change", async () => {
  await update({ selectedCommune: el.commune.value });
});

// ================= Calculation =================
function populateCalculation(s: AppSettings) {
  el.method.value = s.calculationMethod;
  el.madhab.value = s.madhab;
  el.offFajr.value = String(s.offsets.fajr);
  el.offSunrise.value = String(s.offsets.sunrise);
  el.offDhuhr.value = String(s.offsets.dhuhr);
  el.offAsr.value = String(s.offsets.asr);
  el.offMaghrib.value = String(s.offsets.maghrib);
  el.offIsha.value = String(s.offsets.isha);
}
el.method.addEventListener("change", () => update({ calculationMethod: el.method.value as AppSettings["calculationMethod"] }));
el.madhab.addEventListener("change", () => update({ madhab: el.madhab.value as AppSettings["madhab"] }));
function saveOffsets() {
  update({
    offsets: {
      fajr: Number(el.offFajr.value) || 0,
      sunrise: Number(el.offSunrise.value) || 0,
      dhuhr: Number(el.offDhuhr.value) || 0,
      asr: Number(el.offAsr.value) || 0,
      maghrib: Number(el.offMaghrib.value) || 0,
      isha: Number(el.offIsha.value) || 0,
    },
  });
}
[el.offFajr, el.offSunrise, el.offDhuhr, el.offAsr, el.offMaghrib, el.offIsha].forEach((i) => i.addEventListener("change", saveOffsets));

function populateManualTimes(s: AppSettings) {
  el.manualTimesEnabled.checked = s.manualTimesEnabled;
  el.manualTimesFields.hidden = !s.manualTimesEnabled;
  el.manFajr.value = s.manualTimes.fajr;
  el.manSunrise.value = s.manualTimes.sunrise;
  el.manDhuhr.value = s.manualTimes.dhuhr;
  el.manAsr.value = s.manualTimes.asr;
  el.manMaghrib.value = s.manualTimes.maghrib;
  el.manIsha.value = s.manualTimes.isha;
}
el.manualTimesEnabled.addEventListener("change", async () => {
  el.manualTimesFields.hidden = !el.manualTimesEnabled.checked;
  await update({ manualTimesEnabled: el.manualTimesEnabled.checked });
});
function saveManualTimes() {
  const manual: ManualPrayerTimes = {
    fajr: el.manFajr.value || "05:00",
    sunrise: el.manSunrise.value || "06:30",
    dhuhr: el.manDhuhr.value || "12:30",
    asr: el.manAsr.value || "15:45",
    maghrib: el.manMaghrib.value || "18:15",
    isha: el.manIsha.value || "19:45",
  };
  update({ manualTimes: manual });
}
[el.manFajr, el.manSunrise, el.manDhuhr, el.manAsr, el.manMaghrib, el.manIsha].forEach((i) => i.addEventListener("change", saveManualTimes));

// ================= Adhan =================
function populateAdhan(s: AppSettings) {
  el.adhanEnabled.checked = s.adhanEnabled;
  el.volume.value = String(Math.round(s.adhanVolume * 100));
  el.adhanFileLabel.textContent = s.adhanSoundPath
    ? `الملف المختار: ${s.adhanSoundPath.split(/[\\/]/).pop()}`
    : "لم يتم اختيار ملف — الأذان سيكون صامتًا (الإشعار والحالة المرئية تعمل رغم ذلك).";
}
el.adhanEnabled.addEventListener("change", () => update({ adhanEnabled: el.adhanEnabled.checked }));
el.volume.addEventListener("change", () => update({ adhanVolume: Number(el.volume.value) / 100 }));
el.btnChooseAdhan.addEventListener("click", async () => {
  try {
    const selected = await openFileDialog({ multiple: false, filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] }] });
    if (!selected || Array.isArray(selected)) return;
    const destPath = await safeInvoke<string>("import_adhan_sound", { sourcePath: selected, purpose: "adhan" });
    if (!destPath) { el.adhanFileLabel.textContent = "تعذّر استيراد هذا الملف — جرّب ملفًا آخر."; return; }
    await update({ adhanSoundPath: destPath });
    el.adhanFileLabel.textContent = `الملف المختار: ${destPath.split(/[\\/]/).pop()}`;
  } catch (e) { console.warn("Adhan file picker failed", e); }
});
el.btnTestAdhan.addEventListener("click", async () => {
  if (!settings.adhanSoundPath) { el.adhanFileLabel.textContent = "اختر ملفًا أولًا لتجربته."; return; }
  try { await playAdhanFile(convertFileSrc(settings.adhanSoundPath), settings.adhanVolume); }
  catch (e) { console.warn("Test playback failed", e); }
});

// ================= Iqama =================
function populateIqama(s: AppSettings) {
  el.iqamaEnabled.checked = s.iqamaEnabled;
  el.iqFajr.value = String(s.iqama.fajr);
  el.iqDhuhr.value = String(s.iqama.dhuhr);
  el.iqAsr.value = String(s.iqama.asr);
  el.iqMaghrib.value = String(s.iqama.maghrib);
  el.iqIsha.value = String(s.iqama.isha);
  el.reminderEnabled.checked = s.reminderEnabled;
}
el.iqamaEnabled.addEventListener("change", () => update({ iqamaEnabled: el.iqamaEnabled.checked }));
el.reminderEnabled.addEventListener("change", () => update({ reminderEnabled: el.reminderEnabled.checked }));
function saveIqamaMinutes() {
  update({
    iqama: {
      fajr: Math.max(0, Number(el.iqFajr.value) || 0),
      dhuhr: Math.max(0, Number(el.iqDhuhr.value) || 0),
      asr: Math.max(0, Number(el.iqAsr.value) || 0),
      maghrib: Math.max(0, Number(el.iqMaghrib.value) || 0),
      isha: Math.max(0, Number(el.iqIsha.value) || 0),
    },
  });
}
[el.iqFajr, el.iqDhuhr, el.iqAsr, el.iqMaghrib, el.iqIsha].forEach((i) => i.addEventListener("change", saveIqamaMinutes));

// ================= Notifications =================
function populateNotifications(s: AppSettings) { el.notificationsEnabled.checked = s.notificationsEnabled; }
el.notificationsEnabled.addEventListener("change", () => update({ notificationsEnabled: el.notificationsEnabled.checked }));

// ================= Welcome =================
el.btnDismissWelcome.addEventListener("click", async () => {
  el.welcomeBanner.hidden = true;
  await update({ onboardingComplete: true });
});

// ================= Settings-changed from elsewhere (e.g. bar re-emitting) =================
listen("settings-changed", async () => {
  invalidateSettingsCache();
  settings = await getSettings();
  cachedForKey = "";
}).catch(() => {});

// ================= Init =================
async function init() {
  settings = await getSettings();

  populateGeneral(settings);
  populateWilayaOptions();
  populateLocation(settings);
  populateCalculation(settings);
  populateManualTimes(settings);
  populateAdhan(settings);
  populateIqama(settings);
  populateNotifications(settings);
  await populateMonitors(settings.monitorName);
  renderAlarms(settings.alarms);

  try { el.startWithWindows.checked = await isAutostartEnabled(); }
  catch { el.startWithWindows.checked = settings.startWithWindows; }

  if (!settings.onboardingComplete) el.welcomeBanner.hidden = false;

  await tickHome();
  setInterval(tickHome, 1000);
}

init();
