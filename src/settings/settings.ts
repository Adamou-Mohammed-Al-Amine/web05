import { getSettings, saveSettings, invalidateSettingsCache, AppSettings } from "../lib/store";
import { searchCities, cityResultToLocation, formatCityLabel, CitySearchResult } from "../lib/cityLookup";
import { playAdhanFile, stopAdhan } from "../lib/audio";
import { PrayerName } from "../lib/prayerCalc";

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
// Verified against the installed @tauri-apps/plugin-autostart v2 type
// definitions via `tsc --noEmit` (see README) — enable/disable/isEnabled
// are the real exported names, not a guess.
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";

interface MonitorInfo {
  name: string | null;
  is_primary: boolean;
  width: number;
  height: number;
}

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    console.warn(`invoke(${cmd}) failed`, e);
    return undefined;
  }
}

const f = {
  startWithWindows: document.getElementById("fStartWithWindows") as HTMLInputElement,
  alwaysOnTop: document.getElementById("fAlwaysOnTop") as HTMLInputElement,
  showBar: document.getElementById("fShowBar") as HTMLInputElement,
  position: document.getElementById("fPosition") as HTMLSelectElement,
  monitor: document.getElementById("fMonitor") as HTMLSelectElement,
  compact: document.getElementById("fCompact") as HTMLInputElement,
  compact2: document.getElementById("fCompact2") as HTMLInputElement,

  citySearch: document.getElementById("fCitySearch") as HTMLInputElement,
  btnCitySearch: document.getElementById("btnCitySearch") as HTMLButtonElement,
  cityResults: document.getElementById("cityResults") as HTMLDivElement,
  citySearchHint: document.getElementById("citySearchHint") as HTMLParagraphElement,
  latitude: document.getElementById("fLatitude") as HTMLInputElement,
  longitude: document.getElementById("fLongitude") as HTMLInputElement,
  timeZone: document.getElementById("fTimeZone") as HTMLInputElement,

  method: document.getElementById("fMethod") as HTMLSelectElement,
  madhab: document.getElementById("fMadhab") as HTMLSelectElement,
  offFajr: document.getElementById("offFajr") as HTMLInputElement,
  offSunrise: document.getElementById("offSunrise") as HTMLInputElement,
  offDhuhr: document.getElementById("offDhuhr") as HTMLInputElement,
  offAsr: document.getElementById("offAsr") as HTMLInputElement,
  offMaghrib: document.getElementById("offMaghrib") as HTMLInputElement,
  offIsha: document.getElementById("offIsha") as HTMLInputElement,

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

  opacity: document.getElementById("fOpacity") as HTMLInputElement,
  blur: document.getElementById("fBlur") as HTMLInputElement,
  accent: document.getElementById("fAccent") as HTMLInputElement,

  welcomeBanner: document.getElementById("welcomeBanner") as HTMLDivElement,
  btnDismissWelcome: document.getElementById("btnDismissWelcome") as HTMLButtonElement,
  saveIndicator: document.getElementById("saveIndicator") as HTMLSpanElement,
};

let settings: AppSettings;
let saveIndicatorTimeout: number | undefined;

function flashSaved() {
  f.saveIndicator.textContent = "Saved";
  f.saveIndicator.classList.add("visible");
  window.clearTimeout(saveIndicatorTimeout);
  saveIndicatorTimeout = window.setTimeout(() => f.saveIndicator.classList.remove("visible"), 1200);
}

/** Persists a partial settings change, notifies the bar/panel windows, and flashes the save indicator. */
async function update(partial: Partial<AppSettings>) {
  settings = await saveSettings(partial);
  await emit("settings-changed");
  flashSaved();
}

// ---------- Tabs ----------
document.querySelectorAll<HTMLButtonElement>(".settings-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll<HTMLButtonElement>(".settings-tab").forEach((t) => (t.dataset.active = "false"));
    document.querySelectorAll<HTMLElement>(".settings-section").forEach((s) => (s.dataset.active = "false"));
    tab.dataset.active = "true";
    document.querySelector<HTMLElement>(`.settings-section[data-section="${tab.dataset.tab}"]`)!.dataset.active = "true";
  });
});

// ---------- General ----------
function populateGeneral(s: AppSettings) {
  f.alwaysOnTop.checked = s.alwaysOnTop;
  f.showBar.checked = s.showBar;
  f.position.value = s.barPosition === "custom" ? "top-center" : s.barPosition;
  f.compact.checked = s.compactMode;
  f.compact2.checked = s.compactMode;
}

f.alwaysOnTop.addEventListener("change", async () => {
  await update({ alwaysOnTop: f.alwaysOnTop.checked });
  await safeInvoke("set_always_on_top", { enabled: f.alwaysOnTop.checked });
});

f.showBar.addEventListener("change", async () => {
  await update({ showBar: f.showBar.checked });
  await safeInvoke("set_bar_visible", { visible: f.showBar.checked });
});

f.position.addEventListener("change", async () => {
  await update({ barPosition: f.position.value as AppSettings["barPosition"] });
  await safeInvoke("set_bar_position", { position: f.position.value });
});

f.monitor.addEventListener("change", async () => {
  const value = f.monitor.value === "__primary__" ? null : f.monitor.value;
  await update({ monitorName: value });
  await safeInvoke("set_bar_monitor", { monitorName: value });
});

async function onCompactChange(checked: boolean) {
  f.compact.checked = checked;
  f.compact2.checked = checked;
  await update({ compactMode: checked });
}
f.compact.addEventListener("change", () => onCompactChange(f.compact.checked));
f.compact2.addEventListener("change", () => onCompactChange(f.compact2.checked));

f.startWithWindows.addEventListener("change", async () => {
  const enabled = f.startWithWindows.checked;
  try {
    if (enabled) await enableAutostart();
    else await disableAutostart();
    await update({ startWithWindows: enabled });
  } catch (e) {
    console.warn("autostart toggle failed", e);
    // Revert the checkbox visually since the OS-level change didn't happen.
    f.startWithWindows.checked = !enabled;
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
  f.monitor.innerHTML = "";

  const primaryOpt = document.createElement("option");
  primaryOpt.value = "__primary__";
  primaryOpt.textContent = "Primary monitor";
  f.monitor.appendChild(primaryOpt);

  for (const m of monitors) {
    if (!m.name) continue;
    const opt = document.createElement("option");
    opt.value = m.name;
    opt.textContent = `${m.name} (${m.width}×${m.height})${m.is_primary ? " — primary" : ""}`;
    f.monitor.appendChild(opt);
  }

  f.monitor.value = selected ?? "__primary__";
  // If the saved monitor is no longer connected, fall back visibly too.
  if (f.monitor.value !== (selected ?? "__primary__")) f.monitor.value = "__primary__";
}

// ---------- Location ----------
function populateLocation(s: AppSettings) {
  f.latitude.value = String(s.location.latitude);
  f.longitude.value = String(s.location.longitude);
  f.timeZone.value = s.location.timeZoneId;
}

let citySearchToken = 0;
f.btnCitySearch.addEventListener("click", () => runCitySearch());
f.citySearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runCitySearch();
});

async function runCitySearch() {
  const query = f.citySearch.value.trim();
  if (query.length < 2) return;

  const token = ++citySearchToken;
  f.citySearchHint.textContent = "Searching…";
  f.cityResults.innerHTML = "";

  const results = await searchCities(query);
  if (token !== citySearchToken) return; // a newer search superseded this one

  if (results.length === 0) {
    f.citySearchHint.textContent = "No results — check your connection, or enter coordinates manually below.";
    return;
  }
  f.citySearchHint.textContent = "";
  renderCityResults(results);
}

function renderCityResults(results: CitySearchResult[]) {
  f.cityResults.innerHTML = "";
  for (const r of results) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "city-result";
    item.textContent = formatCityLabel(r);
    item.addEventListener("click", async () => {
      const location = cityResultToLocation(r);
      f.latitude.value = String(location.latitude);
      f.longitude.value = String(location.longitude);
      f.timeZone.value = location.timeZoneId;
      await update({ location });
      f.cityResults.innerHTML = "";
      f.citySearch.value = formatCityLabel(r);
    });
    f.cityResults.appendChild(item);
  }
}

async function saveManualLocation() {
  const latitude = parseFloat(f.latitude.value);
  const longitude = parseFloat(f.longitude.value);
  const timeZoneId = f.timeZone.value.trim();
  if (Number.isNaN(latitude) || Number.isNaN(longitude) || !timeZoneId) return;
  await update({ location: { latitude, longitude, timeZoneId } });
}
[f.latitude, f.longitude, f.timeZone].forEach((input) => input.addEventListener("change", saveManualLocation));

// ---------- Calculation ----------
function populateCalculation(s: AppSettings) {
  f.method.value = s.calculationMethod;
  f.madhab.value = s.madhab;
  f.offFajr.value = String(s.offsets.fajr);
  f.offSunrise.value = String(s.offsets.sunrise);
  f.offDhuhr.value = String(s.offsets.dhuhr);
  f.offAsr.value = String(s.offsets.asr);
  f.offMaghrib.value = String(s.offsets.maghrib);
  f.offIsha.value = String(s.offsets.isha);
}

f.method.addEventListener("change", () => update({ calculationMethod: f.method.value as AppSettings["calculationMethod"] }));
f.madhab.addEventListener("change", () => update({ madhab: f.madhab.value as AppSettings["madhab"] }));

function saveOffsets() {
  update({
    offsets: {
      fajr: Number(f.offFajr.value) || 0,
      sunrise: Number(f.offSunrise.value) || 0,
      dhuhr: Number(f.offDhuhr.value) || 0,
      asr: Number(f.offAsr.value) || 0,
      maghrib: Number(f.offMaghrib.value) || 0,
      isha: Number(f.offIsha.value) || 0,
    },
  });
}
[f.offFajr, f.offSunrise, f.offDhuhr, f.offAsr, f.offMaghrib, f.offIsha].forEach((input) =>
  input.addEventListener("change", saveOffsets)
);

// ---------- Adhan ----------
function populateAdhan(s: AppSettings) {
  f.adhanEnabled.checked = s.adhanEnabled;
  f.volume.value = String(Math.round(s.adhanVolume * 100));
  f.adhanFileLabel.textContent = s.adhanSoundPath
    ? `Selected: ${s.adhanSoundPath.split(/[\\/]/).pop()}`
    : "No file selected — Adhan will be silent (notification and visual state still fire).";
}

f.adhanEnabled.addEventListener("change", () => update({ adhanEnabled: f.adhanEnabled.checked }));
f.volume.addEventListener("change", () => update({ adhanVolume: Number(f.volume.value) / 100 }));

f.btnChooseAdhan.addEventListener("click", async () => {
  try {
    const selected = await openFileDialog({
      multiple: false,
      filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] }],
    });
    if (!selected || Array.isArray(selected)) return;

    const destPath = await safeInvoke<string>("import_adhan_sound", {
      sourcePath: selected,
      purpose: "adhan",
    });
    if (!destPath) {
      f.adhanFileLabel.textContent = "Couldn't import that file — please try another.";
      return;
    }
    await update({ adhanSoundPath: destPath });
    f.adhanFileLabel.textContent = `Selected: ${destPath.split(/[\\/]/).pop()}`;
  } catch (e) {
    console.warn("Adhan file picker failed", e);
  }
});

f.btnTestAdhan.addEventListener("click", async () => {
  if (!settings.adhanSoundPath) {
    f.adhanFileLabel.textContent = "Choose a file first to test it.";
    return;
  }
  try {
    await playAdhanFile(convertFileSrc(settings.adhanSoundPath), settings.adhanVolume);
  } catch (e) {
    console.warn("Test playback failed", e);
  }
});

// ---------- Iqama ----------
function populateIqama(s: AppSettings) {
  f.iqamaEnabled.checked = s.iqamaEnabled;
  f.iqFajr.value = String(s.iqama.fajr);
  f.iqDhuhr.value = String(s.iqama.dhuhr);
  f.iqAsr.value = String(s.iqama.asr);
  f.iqMaghrib.value = String(s.iqama.maghrib);
  f.iqIsha.value = String(s.iqama.isha);
  f.reminderEnabled.checked = s.reminderEnabled;
}

f.iqamaEnabled.addEventListener("change", () => update({ iqamaEnabled: f.iqamaEnabled.checked }));
f.reminderEnabled.addEventListener("change", () => update({ reminderEnabled: f.reminderEnabled.checked }));

function saveIqamaMinutes() {
  update({
    iqama: {
      fajr: Math.max(0, Number(f.iqFajr.value) || 0),
      dhuhr: Math.max(0, Number(f.iqDhuhr.value) || 0),
      asr: Math.max(0, Number(f.iqAsr.value) || 0),
      maghrib: Math.max(0, Number(f.iqMaghrib.value) || 0),
      isha: Math.max(0, Number(f.iqIsha.value) || 0),
    },
  });
}
[f.iqFajr, f.iqDhuhr, f.iqAsr, f.iqMaghrib, f.iqIsha].forEach((input) => input.addEventListener("change", saveIqamaMinutes));

// ---------- Notifications ----------
function populateNotifications(s: AppSettings) {
  f.notificationsEnabled.checked = s.notificationsEnabled;
}
f.notificationsEnabled.addEventListener("change", () => update({ notificationsEnabled: f.notificationsEnabled.checked }));

// ---------- Appearance ----------
function populateAppearance(s: AppSettings) {
  f.opacity.value = String(Math.round(s.glassOpacity * 100));
  f.blur.value = String(s.blurIntensity);
  f.accent.value = s.accentColor;
}
f.opacity.addEventListener("change", () => update({ glassOpacity: Number(f.opacity.value) / 100 }));
f.blur.addEventListener("change", () => update({ blurIntensity: Number(f.blur.value) }));
f.accent.addEventListener("change", () => update({ accentColor: f.accent.value }));

// ---------- Welcome / first run ----------
f.btnDismissWelcome.addEventListener("click", async () => {
  f.welcomeBanner.hidden = true;
  await update({ onboardingComplete: true });
});

// ---------- Init ----------
async function init() {
  settings = await getSettings();

  populateGeneral(settings);
  populateLocation(settings);
  populateCalculation(settings);
  populateAdhan(settings);
  populateIqama(settings);
  populateNotifications(settings);
  populateAppearance(settings);
  await populateMonitors(settings.monitorName);

  try {
    f.startWithWindows.checked = await isAutostartEnabled();
  } catch {
    f.startWithWindows.checked = settings.startWithWindows;
  }

  if (!settings.onboardingComplete) {
    f.welcomeBanner.hidden = false;
  }
}

init();
