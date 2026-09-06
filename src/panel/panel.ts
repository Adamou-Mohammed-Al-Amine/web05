import { calculateDailyTimes, DailyPrayerTimes, findNextPrayer, PrayerName } from "../lib/prayerCalc";
import { getSettings } from "../lib/store";

const PRAYER_ORDER: PrayerName[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

const el = {
  tabToday: document.getElementById("tabToday") as HTMLButtonElement,
  tabTomorrow: document.getElementById("tabTomorrow") as HTMLButtonElement,
  list: document.getElementById("panelList")!,
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function render(times: DailyPrayerTimes, highlightPrayer: PrayerName | null) {
  el.list.innerHTML = "";
  for (const name of PRAYER_ORDER) {
    const row = document.createElement("div");
    row.className = "panel-row" + (name === "sunrise" ? " panel-row-sunrise" : "");
    if (name === highlightPrayer) row.dataset.current = "true";

    const label = document.createElement("span");
    label.className = "panel-row-name";
    label.textContent = PRAYER_LABELS[name];

    const time = document.createElement("span");
    time.className = "panel-row-time";
    time.textContent = formatTime(times[name]);

    row.append(label, time);
    el.list.appendChild(row);
  }
}

async function init() {
  const settings = await getSettings();
  const now = new Date();
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  const today = calculateDailyTimes(now, settings.location, settings.calculationMethod, settings.madhab, settings.offsets);
  const tomorrow = calculateDailyTimes(tomorrowDate, settings.location, settings.calculationMethod, settings.madhab, settings.offsets);
  const next = findNextPrayer(today, tomorrow, now);

  let showingToday = true;

  function refresh() {
    if (showingToday) {
      // Only highlight the next prayer when it's actually still today's —
      // if it already rolled to tomorrow's Fajr, today's list has no
      // "current" row to highlight.
      const highlight = PRAYER_ORDER.includes(next.name) && today[next.name]?.getTime() === next.time.getTime()
        ? next.name
        : null;
      render(today, highlight);
    } else {
      const highlight = today[next.name]?.getTime() !== next.time.getTime() ? next.name : null;
      render(tomorrow, highlight);
    }
  }

  el.tabToday.addEventListener("click", () => {
    showingToday = true;
    el.tabToday.dataset.active = "true";
    el.tabTomorrow.dataset.active = "false";
    refresh();
  });
  el.tabTomorrow.addEventListener("click", () => {
    showingToday = false;
    el.tabTomorrow.dataset.active = "true";
    el.tabToday.dataset.active = "false";
    refresh();
  });

  refresh();
}

init();
