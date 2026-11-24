// Calendar-date helpers. Dates are UTC-midnight Date objects so that day
// arithmetic is never affected by time zones or daylight saving.

const DAY_MS = 86_400_000;

const pad2 = (n) => String(n).padStart(2, '0');

export function makeDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Today's date in the browser's local calendar, as YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Strict YYYY-MM-DD parser; returns null for anything that is not a real date. */
export function parseISODate(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200) return null; // provisional range — still an open item in PROJECT_SPEC
  const dt = makeDate(y, mo, d);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function toISO(dt) {
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function addDays(dt, days) {
  return new Date(dt.getTime() + days * DAY_MS);
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Adds calendar months. Month-end rule (approved D15, unless the bank's
 * official terms say otherwise): the day is clamped to the last day of the target month (31 Jan + 1 → 28/29 Feb).
 */
export function addMonthsClamp(dt, months) {
  const total = dt.getUTCMonth() + months;
  const year = dt.getUTCFullYear() + Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  const day = Math.min(dt.getUTCDate(), daysInMonth(year, month));
  return makeDate(year, month, day);
}

export function diffDays(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function sameDate(a, b) {
  return a.getTime() === b.getTime();
}

/** Mongolian display format: 2026.11.11 */
export function formatDateMN(dt) {
  return `${dt.getUTCFullYear()}.${pad2(dt.getUTCMonth() + 1)}.${pad2(dt.getUTCDate())}`;
}

/** D4 — an empty or invalid start date falls back to today. */
export function resolveStartDate(value, today = todayISO()) {
  const parsed = parseISODate(value);
  if (parsed) return { date: parsed, fallback: false };
  return { date: parseISODate(today), fallback: true };
}

/** Accepts YYYY-MM-DD or an ISO timestamp; returns the calendar date or null. */
export function parseObservedDate(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  return parseISODate(value.slice(0, 10));
}
