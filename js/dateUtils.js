import { CUTOFF_HOUR } from './config.js';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateStr(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

// Monday of the week containing `d`.
export function mondayOf(d) {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Mon..Fri date strings for the week starting on `weekStart` (a Monday date string).
export function weekDates(weekStart) {
  const start = parseDateStr(weekStart);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toDateStr(d);
  });
}

// The Monday that should be showing right now: this week's, unless it's
// already past CUTOFF_HOUR on Friday, in which case next week's (computed
// straight from today's date, so it's always correct even after a long gap
// with no visits — never trails behind by drifting one week at a time).
export function currentTargetWeekStart() {
  const now = new Date();
  const monday = mondayOf(now);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(CUTOFF_HOUR, 0, 0, 0);
  if (now >= friday) monday.setDate(monday.getDate() + 7);
  return toDateStr(monday);
}

// `n` days after a date string (negative to go back).
export function addDays(dateStr, n) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// Whether the week starting `weekStart` has already passed its own Friday
// cutoff — used to decide whether the stored "current week" pointer should
// auto-advance. Framed around the stored week itself (not "today's real
// week") so an admin's manual week override sticks until its own natural
// rollover point, instead of being silently reverted on the next page load.
export function hasWeekRolledOver(weekStart) {
  const monday = parseDateStr(weekStart);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(CUTOFF_HOUR, 0, 0, 0);
  return new Date() >= friday;
}

export function weekdayLabel(dateStr) {
  const d = parseDateStr(dateStr);
  return WEEKDAY_LABELS[d.getDay()];
}

export function dayMonthLabel(dateStr) {
  const d = parseDateStr(dateStr);
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

export function formatDate(dateStr) {
  const d = parseDateStr(dateStr);
  return `${weekdayLabel(dateStr)}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// A day locks at CUTOFF_HOUR on the day before it.
export function isCutoffPassed(dateStr) {
  const cutoff = parseDateStr(dateStr);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(CUTOFF_HOUR, 0, 0, 0);
  return new Date() >= cutoff;
}

// Inclusive list of YYYY-MM-DD strings between two date strings.
export function datesInRange(startStr, endStr) {
  const start = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  const dates = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(toDateStr(d));
  }
  return dates;
}

// First/last calendar day of a "YYYY-MM" string, as YYYY-MM-DD.
export function monthBounds(yearMonthStr) {
  const [y, m] = yearMonthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}
