/**
 * Audio for Prayer Bar.
 *
 * Adhan (the call to prayer) is religious recitation and cannot be bundled
 * without explicit permission/license — per the spec, it's always a file the
 * user supplies themselves via Settings. If none is configured, Adhan
 * playback silently no-ops (the notification and visual state still fire).
 *
 * The 5-minutes-before-Iqama reminder and the Iqama-due chime are NOT
 * religious audio — they're short synthesized tones generated at runtime
 * with the Web Audio API, so there's zero licensing question and the
 * feature works out of the box with no file to configure.
 */

let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** Plays a short, gentle two-tone chime. Used for reminders, not Adhan. */
export function playChime(volume = 0.5): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [880, 1108.73]; // A5 -> C#6, a soft two-note ping

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const start = now + i * 0.18;
      const dur = 0.35;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    });
  } catch {
    // Web Audio unavailable for some reason — never let a sound failure
    // break the rest of the reminder flow (notification still fires).
  }
}

let adhanElement: HTMLAudioElement | null = null;

function getAdhanElement(): HTMLAudioElement {
  if (!adhanElement) {
    adhanElement = document.createElement("audio");
    adhanElement.preload = "auto";
  }
  return adhanElement;
}

/**
 * Plays the user-configured Adhan file. `src` should already be a
 * webview-loadable URL (see convertFileSrc usage in bar.ts) — this module
 * doesn't know about Tauri's asset protocol, keeping it testable in a plain
 * browser too.
 */
export async function playAdhanFile(src: string, volume: number): Promise<void> {
  const el = getAdhanElement();
  el.src = src;
  el.volume = Math.max(0, Math.min(1, volume));
  try {
    await el.play();
  } catch {
    // Autoplay restrictions or a bad file path — fail soft. The visual
    // state and notification still communicate that it's prayer time.
  }
}

export function stopAdhan(): void {
  if (adhanElement) {
    adhanElement.pause();
    adhanElement.currentTime = 0;
  }
}

export function isAdhanPlaying(): boolean {
  return !!adhanElement && !adhanElement.paused;
}
