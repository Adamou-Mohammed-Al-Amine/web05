import { calculateDailyTimes, manualTimesToDaily, DailyPrayerTimes } from "./prayerCalc";
import { AppSettings } from "./store";

/**
 * Resolves today's (or any date's) prayer times from settings, honoring the
 * manual-times override when enabled. Used by both the floating bar and the
 * main window so they never disagree with each other.
 */
export function resolveDailyTimes(settings: AppSettings, date: Date): DailyPrayerTimes {
  if (settings.manualTimesEnabled) {
    return manualTimesToDaily(date, settings.manualTimes);
  }
  return calculateDailyTimes(date, settings.location, settings.calculationMethod, settings.madhab, settings.offsets);
}

/** A cache key that changes whenever anything affecting the resolved times changes. */
export function scheduleKey(settings: AppSettings, date: Date): string {
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (settings.manualTimesEnabled) {
    return `manual:${dateKey}:${JSON.stringify(settings.manualTimes)}`;
  }
  return `calc:${dateKey}:${settings.location.latitude},${settings.location.longitude},${settings.location.timeZoneId},${settings.calculationMethod},${settings.madhab},${JSON.stringify(settings.offsets)}`;
}
