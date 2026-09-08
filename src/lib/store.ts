import { CalculationMethodId, Location, Madhab, PrayerOffsetsMinutes, ZERO_OFFSETS } from "./prayerCalc";
import { IqamaConfig, DEFAULT_IQAMA } from "./stateMachine";

export interface ManualPrayerTimes {
  fajr: string;    // "HH:MM", used every day when manualTimesEnabled is true
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface Alarm {
  id: string;
  name: string;
  time: string; // "HH:MM"
  enabled: boolean;
}

export interface AppSettings {
  location: Location;
  calculationMethod: CalculationMethodId;
  madhab: Madhab;
  offsets: PrayerOffsetsMinutes;
  manualTimesEnabled: boolean; // when true, manualTimes is used instead of astronomical calculation
  manualTimes: ManualPrayerTimes;
  iqamaEnabled: boolean;
  iqama: IqamaConfig;
  reminderEnabled: boolean;      // 5-minutes-before-Iqama reminder
  notificationsEnabled: boolean; // master toggle for Windows toast notifications
  adhanEnabled: boolean;
  adhanSoundPath: string | null; // absolute path under $APPDATA/sounds/, set via import_adhan_sound
  adhanVolume: number; // 0-1, also used for the synthesized reminder chime
  showBar: boolean;          // independent of alwaysOnTop and startWithWindows
  alwaysOnTop: boolean;      // independent of showBar and startWithWindows
  barPosition: "top-center" | "top-left" | "top-right" | "custom";
  customPosition: { x: number; y: number } | null;
  monitorName: string | null; // null = primary monitor
  startWithWindows: boolean;  // independent of showBar and alwaysOnTop
  glassOpacity: number;   // 0-1, maps to --glass-bg alpha
  blurIntensity: number;  // px
  accentColor: string;
  compactMode: boolean;
  onboardingComplete: boolean;
  alarms: Alarm[];
}

const DEFAULT_MANUAL_TIMES: ManualPrayerTimes = {
  fajr: "05:00",
  sunrise: "06:30",
  dhuhr: "12:30",
  asr: "15:45",
  maghrib: "18:15",
  isha: "19:45",
};

// Sensible defaults so the app is usable before onboarding finishes; real
// values are overwritten once the user picks a location.
const DEFAULT_SETTINGS: AppSettings = {
  location: { latitude: 21.4225, longitude: 39.8262, timeZoneId: "Asia/Riyadh" }, // Makkah, placeholder until onboarding
  calculationMethod: "MWL",
  madhab: "SHAFI",
  offsets: ZERO_OFFSETS,
  manualTimesEnabled: false,
  manualTimes: DEFAULT_MANUAL_TIMES,
  iqamaEnabled: true,
  iqama: DEFAULT_IQAMA,
  reminderEnabled: true,
  notificationsEnabled: true,
  adhanEnabled: true,
  adhanSoundPath: null,
  adhanVolume: 0.8,
  showBar: true,
  alwaysOnTop: true, // ON by default, per spec
  barPosition: "top-center",
  customPosition: null,
  monitorName: null, // primary monitor
  startWithWindows: true,
  glassOpacity: 0.55,
  blurIntensity: 26,
  accentColor: "#78AAFF",
  compactMode: false,
  onboardingComplete: false,
  alarms: [],
};

const STORE_KEY = "settings";
let cache: AppSettings | null = null;

// Tauri plugin-store is loaded dynamically so this module also works
// during plain browser UI development (falls back to localStorage there).
async function getBackingStore() {
  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    return await Store.load("prayer-bar-settings.json");
  } catch {
    return null;
  }
}

/**
 * Drops the in-memory cache so the next getSettings() call re-reads from
 * disk. Each window (bar/panel/settings) is a separate JS context with its
 * own copy of this module-level cache — without calling this after an
 * external "settings-changed" event, a window that already called
 * getSettings() once would keep serving its stale first read forever.
 */
export function invalidateSettingsCache(): void {
  cache = null;
}

export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache;

  let resolved: AppSettings;
  const store = await getBackingStore();
  if (store) {
    const saved = await store.get<AppSettings>(STORE_KEY);
    resolved = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  } else {
    const raw = localStorage.getItem(STORE_KEY);
    resolved = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  }
  cache = resolved;
  return resolved;
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...partial };
  cache = next;

  const store = await getBackingStore();
  if (store) {
    await store.set(STORE_KEY, next);
    await store.save();
  } else {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }
  return next;
}
