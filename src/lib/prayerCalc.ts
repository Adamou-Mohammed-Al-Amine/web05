/**
 * Prayer time calculation engine.
 *
 * Implements the standard solar-angle method used across the prayer-times
 * ecosystem (equation of time + sun declination + hour-angle solving for a
 * given depression angle). This is public-domain astronomical math, not a
 * copy of any particular library's source.
 *
 * All calculations are local/offline once lat/lng/timezone are known.
 */

import { getTimezoneOffsetHours } from "./timezone";

export type CalculationMethodId =
  | "MWL"           // Muslim World League
  | "EGYPT"         // Egyptian General Authority of Survey
  | "KARACHI"       // University of Islamic Sciences, Karachi
  | "UMM_AL_QURA"   // Umm al-Qura, Makkah
  | "DUBAI"
  | "MOONSIGHTING"  // Moonsighting Committee Worldwide
  | "ISNA";         // Islamic Society of North America

export type Madhab = "SHAFI" | "HANAFI";

export interface MethodParams {
  fajrAngle: number;          // degrees below horizon
  ishaAngle?: number;         // degrees below horizon (mutually exclusive with ishaMinutesAfterMaghrib)
  ishaMinutesAfterMaghrib?: number;
  maghribMinutesAfterSunset?: number; // default 0
}

export const CALCULATION_METHODS: Record<CalculationMethodId, MethodParams> = {
  MWL: { fajrAngle: 18, ishaAngle: 17 },
  EGYPT: { fajrAngle: 19.5, ishaAngle: 17.5 },
  KARACHI: { fajrAngle: 18, ishaAngle: 18 },
  UMM_AL_QURA: { fajrAngle: 18.5, ishaMinutesAfterMaghrib: 90 },
  DUBAI: { fajrAngle: 18.2, ishaAngle: 18.2 },
  MOONSIGHTING: { fajrAngle: 18, ishaAngle: 18 },
  ISNA: { fajrAngle: 15, ishaAngle: 15 },
};

export interface Location {
  latitude: number;
  longitude: number;
  timeZoneId: string; // IANA identifier, e.g. "Africa/Algiers" — resolved per-date for DST correctness
}

export interface PrayerOffsetsMinutes {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

export const ZERO_OFFSETS: PrayerOffsetsMinutes = {
  fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0,
};

export interface DailyPrayerTimes {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function sinD(d: number) { return Math.sin(d * DEG2RAD); }
function cosD(d: number) { return Math.cos(d * DEG2RAD); }
function tanD(d: number) { return Math.tan(d * DEG2RAD); }
function arccosD(x: number) { return Math.acos(x) * RAD2DEG; }
function arctanD(x: number) { return Math.atan(x) * RAD2DEG; }
function arccotD(x: number) { return arctanD(1 / x); }

/** Julian date at 0h UT for a given calendar date. */
function julianDate(year: number, month: number, day: number): number {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day + B - 1524.5
  );
}

/** Sun's equation of time (minutes) and declination (degrees) for a Julian date. */
function sunPosition(jd: number): { eqTime: number; declination: number } {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * sinD(g) + 0.020 * sinD(2 * g));

  const e = 23.439 - 0.00000036 * D;
  // atan2 (not atan of a ratio) so the right ascension lands in the correct
  // quadrant relative to L — using a plain ratio here was the original bug:
  // it silently wrapped by up to 12 hours depending on the season.
  const RA = fixHour(atan2D(cosD(e) * sinD(L), cosD(L)) / 15);

  const decl = arcsinD(sinD(e) * sinD(L));
  let eqTime = q / 15 - RA;
  // eqTime is physically always a small fraction of an hour (-12..12); undo
  // any full-day wrap the /15 scaling and RA subtraction can introduce.
  if (eqTime > 12) eqTime -= 24;
  if (eqTime < -12) eqTime += 24;

  return { eqTime, declination: decl };
}

function arcsinD(x: number) { return Math.asin(x) * RAD2DEG; }
function atan2D(y: number, x: number) { return Math.atan2(y, x) * RAD2DEG; }

function fixAngle(a: number): number {
  a = a - 360 * Math.floor(a / 360);
  return a < 0 ? a + 360 : a;
}
function fixHour(h: number): number {
  h = h - 24 * Math.floor(h / 24);
  return h < 0 ? h + 24 : h;
}

/**
 * Computes the local solar time (in hours, 0-24) at which the sun is at
 * `angle` degrees below the horizon, for the given day/latitude, either
 * before solar noon (direction=-1, for Fajr) or after (direction=1, for Isha).
 */
function sunAngleTime(
  angle: number,
  jd: number,
  latitude: number,
  direction: -1 | 1
): number {
  const { eqTime, declination } = sunPosition(jd);
  const numerator = -sinD(angle) - sinD(latitude) * sinD(declination);
  const denominator = cosD(latitude) * cosD(declination);
  const ratio = numerator / denominator;
  const clamped = Math.max(-1, Math.min(1, ratio));
  const t = arccosD(clamped) / 15;
  return 12 - eqTime + direction * t; // hours, local apparent solar time relative to prime meridian
}

function solarNoon(jd: number): number {
  const { eqTime } = sunPosition(jd);
  return 12 - eqTime;
}

function asrTime(jd: number, latitude: number, declination: number, shadowFactor: number): number {
  const angle = -arccotD(shadowFactor + tanD(Math.abs(latitude - declination)));
  return sunAngleTime(angle, jd, latitude, 1);
}

/**
 * Converts an hour value expressed as "local apparent solar time referenced
 * to the prime meridian" (the convention produced by sunAngleTime/solarNoon,
 * since their equation-of-time term is meridian-relative) into a concrete
 * UTC instant on `baseDate`'s calendar day at `location`.
 *
 * local clock time = solarTime - (longitude / 15) + tzOffset
 */
function hoursToDate(baseDate: Date, solarTimeHours: number, tzOffset: number, longitude: number): Date {
  const localClockHours = solarTimeHours - longitude / 15 + tzOffset;
  const utcHours = localClockHours - tzOffset;
  const midnightUtc = new Date(Date.UTC(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate(),
    0, 0, 0, 0
  ));
  return new Date(midnightUtc.getTime() + utcHours * 3600 * 1000);
}

export function calculateDailyTimes(
  date: Date,
  location: Location,
  methodId: CalculationMethodId,
  madhab: Madhab,
  offsets: PrayerOffsetsMinutes = ZERO_OFFSETS
): DailyPrayerTimes {
  const method = CALCULATION_METHODS[methodId];
  const jd = julianDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  const { declination } = sunPosition(jd);

  // Resolved once per call, from this specific calendar date, so DST
  // transitions land on the correct side automatically.
  const tzOffset = getTimezoneOffsetHours(location.timeZoneId, date);

  const noon = solarNoon(jd);
  const fajrH = sunAngleTime(method.fajrAngle, jd, location.latitude, -1);
  const sunriseH = sunAngleTime(0.833, jd, location.latitude, -1); // 0.833° accounts for refraction + solar radius
  const sunsetH = sunAngleTime(0.833, jd, location.latitude, 1);
  const asrShadow = madhab === "HANAFI" ? 2 : 1;
  const asrH = asrTime(jd, location.latitude, declination, asrShadow);

  let ishaH: number;
  if (method.ishaMinutesAfterMaghrib !== undefined) {
    ishaH = sunsetH + method.ishaMinutesAfterMaghrib / 60;
  } else {
    ishaH = sunAngleTime(method.ishaAngle!, jd, location.latitude, 1);
  }

  const maghribH = sunsetH + (method.maghribMinutesAfterSunset ?? 0) / 60;

  const toDate = (h: number, offsetMin: number) => {
    const withOffset = h + offsetMin / 60;
    return hoursToDate(date, withOffset, tzOffset, location.longitude);
  };

  return {
    fajr: toDate(fajrH, offsets.fajr),
    sunrise: toDate(sunriseH, offsets.sunrise),
    dhuhr: toDate(noon, offsets.dhuhr),
    asr: toDate(asrH, offsets.asr),
    maghrib: toDate(maghribH, offsets.maghrib),
    isha: toDate(ishaH, offsets.isha),
  };
}

export type PrayerName = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";
export const ADHAN_PRAYERS: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

/**
 * Builds a DailyPrayerTimes object from fixed "HH:MM" clock times for a
 * given calendar date — used when the user enables manual prayer times
 * (a fixed daily schedule, like a printed masjid timetable) instead of
 * astronomical calculation.
 */
export function manualTimesToDaily(date: Date, manual: ManualTimesLike): DailyPrayerTimes {
  const build = (hhmm: string): Date => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0, 0, 0);
    return d;
  };
  return {
    fajr: build(manual.fajr),
    sunrise: build(manual.sunrise),
    dhuhr: build(manual.dhuhr),
    asr: build(manual.asr),
    maghrib: build(manual.maghrib),
    isha: build(manual.isha),
  };
}

interface ManualTimesLike {
  fajr: string; sunrise: string; dhuhr: string; asr: string; maghrib: string; isha: string;
}

export interface NextPrayer {
  name: PrayerName;
  time: Date;
}

/** Finds the next prayer that requires an Adhan (excludes sunrise). */
export function findNextPrayer(
  today: DailyPrayerTimes,
  tomorrow: DailyPrayerTimes,
  now: Date
): NextPrayer {
  for (const name of ADHAN_PRAYERS) {
    if (today[name].getTime() > now.getTime()) {
      return { name, time: today[name] };
    }
  }
  // All of today's adhan prayers have passed — next is tomorrow's Fajr.
  return { name: "fajr", time: tomorrow.fajr };
}
