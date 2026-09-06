/**
 * Resolves a UTC offset (in hours, e.g. 1, -5, 5.5) for a given IANA time
 * zone identifier ("Africa/Algiers", "America/New_York", ...) at a specific
 * date. Uses the WebView's built-in Intl/ICU time zone database, so DST
 * transitions are handled correctly for any date without a bundled
 * timezone-data library.
 *
 * This works because Chromium-based WebViews (including WebView2, which
 * Tauri uses on Windows) ship full ICU data — Intl.DateTimeFormat with an
 * arbitrary `timeZone` option is reliable there, unlike some minimal
 * embedded JS engines.
 */
export function getTimezoneOffsetHours(timeZoneId: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZoneId,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});

  // "24" shows up for midnight in some ICU implementations; normalize it.
  const hour = parts.hour === "24" ? "00" : parts.hour;

  const asUtcMillis = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (asUtcMillis - date.getTime()) / 3_600_000;
}

/** Validates that a string is a time zone Intl actually recognizes. */
export function isValidTimeZone(timeZoneId: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timeZoneId });
    return true;
  } catch {
    return false;
  }
}
