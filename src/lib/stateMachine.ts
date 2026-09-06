import { DailyPrayerTimes, PrayerName, findNextPrayer } from "./prayerCalc";

export type BarState =
  | "normal"
  | "close"       // < 60s to next prayer — same visual family as normal, slightly emphasized
  | "adhan"
  | "iqama"
  | "iqamaWarning" // last 5 minutes of iqama countdown
  | "paused";

export interface IqamaConfig {
  fajr: number; dhuhr: number; asr: number; maghrib: number; isha: number; // minutes
}

export const DEFAULT_IQAMA: IqamaConfig = {
  fajr: 20, dhuhr: 15, asr: 15, maghrib: 10, isha: 15,
};

export interface EngineState {
  barState: BarState;
  prayerName: PrayerName;
  /** Seconds remaining in the current phase (countdown to prayer, or iqama countdown). */
  secondsRemaining: number;
  pausedUntil: Date | null;
}

export interface EngineCallbacks {
  onEnterAdhan: (prayer: PrayerName) => void;      // fire adhan sound + notification
  onEnterIqamaWarning: (prayer: PrayerName) => void; // 5-min-before reminder
  onEnterIqamaDue: (prayer: PrayerName) => void;    // iqama countdown reaches 0
}

/**
 * Pure-ish state computation: given the day's prayer times and "now", derive
 * what the bar should show. Kept side-effect free except for the one-shot
 * callbacks, which the caller should only invoke once per transition (the
 * caller is responsible for edge-detection / de-duplication across ticks).
 */
export class PrayerEngine {
  private lastFiredAdhanFor: string | null = null;
  private lastFiredWarningFor: string | null = null;
  private manuallySilenced = false;
  private pausedUntil: Date | null = null;

  constructor(private iqama: IqamaConfig, private callbacks: EngineCallbacks) {}

  setIqamaConfig(cfg: IqamaConfig) { this.iqama = cfg; }

  pause(until: Date | null) { this.pausedUntil = until; }
  resume() { this.pausedUntil = null; this.manuallySilenced = false; }
  get isPaused(): boolean { return this.pausedUntil !== null; }
  silenceCurrent() { this.manuallySilenced = true; }
  unsilenceCurrent() { this.manuallySilenced = false; }

  private iqamaMinutesFor(name: PrayerName): number {
    if (name === "sunrise") return 0;
    return this.iqama[name];
  }

  tick(today: DailyPrayerTimes, tomorrow: DailyPrayerTimes, now: Date): EngineState {
    if (this.pausedUntil && now < this.pausedUntil) {
      return {
        barState: "paused",
        prayerName: findNextPrayer(today, tomorrow, now).name,
        secondsRemaining: Math.floor((this.pausedUntil.getTime() - now.getTime()) / 1000),
        pausedUntil: this.pausedUntil,
      };
    } else if (this.pausedUntil && now >= this.pausedUntil) {
      this.pausedUntil = null;
    }

    const next = findNextPrayer(today, tomorrow, now);
    const secondsToNext = Math.floor((next.time.getTime() - now.getTime()) / 1000);

    if (secondsToNext > 0) {
      const state: BarState = secondsToNext <= 60 ? "close" : "normal";
      return { barState: state, prayerName: next.name, secondsRemaining: secondsToNext, pausedUntil: null };
    }

    // Prayer time has arrived or passed — figure out iqama phase.
    const iqamaMinutes = this.iqamaMinutesFor(next.name);
    const secondsSincePrayer = -secondsToNext;
    const iqamaTotalSeconds = iqamaMinutes * 60;
    const iqamaKey = `${next.name}-${next.time.toISOString()}`;

    if (secondsSincePrayer <= 3 && this.lastFiredAdhanFor !== iqamaKey) {
      this.lastFiredAdhanFor = iqamaKey;
      this.manuallySilenced = false;
      this.callbacks.onEnterAdhan(next.name);
    }

    if (secondsSincePrayer < iqamaTotalSeconds) {
      const remaining = iqamaTotalSeconds - secondsSincePrayer;

      if (remaining <= 300 && this.lastFiredWarningFor !== iqamaKey) {
        this.lastFiredWarningFor = iqamaKey;
        this.callbacks.onEnterIqamaWarning(next.name);
      }

      // First ~4s after prayer time shows the "adhan" visual state before
      // settling into the iqama countdown, per the animation spec.
      if (secondsSincePrayer <= 4) {
        return { barState: "adhan", prayerName: next.name, secondsRemaining: 0, pausedUntil: null };
      }

      const state: BarState = remaining <= 300 ? "iqamaWarning" : "iqama";
      return { barState: state, prayerName: next.name, secondsRemaining: remaining, pausedUntil: null };
    }

    if (secondsSincePrayer === iqamaTotalSeconds) {
      this.callbacks.onEnterIqamaDue(next.name);
    }

    // Iqama window has fully elapsed — fall through to counting toward the
    // *actual* next prayer (findNextPrayer will pick it up on the next tick
    // once secondsToNext for this prayer stays negative and we recurse).
    const followingToday = today;
    const nextAfter = this.findFollowing(today, tomorrow, next.name);
    const secondsToFollowing = Math.floor((nextAfter.time.getTime() - now.getTime()) / 1000);
    return {
      barState: secondsToFollowing <= 60 ? "close" : "normal",
      prayerName: nextAfter.name,
      secondsRemaining: Math.max(secondsToFollowing, 0),
      pausedUntil: null,
    };
  }

  private findFollowing(today: DailyPrayerTimes, tomorrow: DailyPrayerTimes, current: PrayerName) {
    const order: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
    const idx = order.indexOf(current);
    if (idx === order.length - 1) return { name: "fajr" as PrayerName, time: tomorrow.fajr };
    const name = order[idx + 1];
    return { name, time: today[name] };
  }

  get isSilenced() { return this.manuallySilenced; }
}
