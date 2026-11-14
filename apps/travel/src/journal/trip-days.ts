/**
 * Day numbers, trip phase and reading-view dates for the journal.
 *
 * All maths is done on the YYYY-MM-DD parts in UTC, so the answer never
 * depends on the time zone of the phone showing it.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const DAY_MS = 86_400_000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function utcDay(localDate: string): number | null {
  const m = DATE_RE.exec(localDate);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

function daysBetween(from: string, to: string): number | null {
  const a = utcDay(from);
  const b = utcDay(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

/** 1 on the first day of the trip. 0 when the date is before the trip or unreadable. */
export function dayNumber(tripStart: string, localDate: string): number {
  const gap = daysBetween(tripStart, localDate);
  if (gap === null || gap < 0) return 0;
  return gap + 1;
}

/** Days in the trip, counting both ends. */
export function tripLength(tripStart: string, tripEnd: string): number {
  const gap = daysBetween(tripStart, tripEnd);
  if (gap === null || gap < 0) return 0;
  return gap + 1;
}

export type TripPhase =
  | { kind: 'before'; daysUntil: number }
  | { kind: 'during'; day: number; of: number }
  | { kind: 'after' };

export function tripPhase(tripStart: string, tripEnd: string, today: string): TripPhase {
  const untilStart = daysBetween(today, tripStart);
  const untilEnd = daysBetween(today, tripEnd);
  if (untilStart === null || untilEnd === null) return { kind: 'after' };
  if (untilStart > 0) return { kind: 'before', daysUntil: untilStart };
  if (untilEnd < 0) return { kind: 'after' };
  return { kind: 'during', day: dayNumber(tripStart, today), of: tripLength(tripStart, tripEnd) };
}

export function coverEyebrow(phase: TripPhase): string {
  if (phase.kind === 'during') return `Journal · Day ${phase.day} of ${phase.of}`;
  if (phase.kind === 'before') {
    return phase.daysUntil === 1
      ? 'Journal · starts tomorrow'
      : `Journal · starts in ${phase.daysUntil} days`;
  }
  return 'Journal';
}

/** "Friday 5 March". Empty when the date is unreadable. */
export function longDate(localDate: string): string {
  const ms = utcDay(localDate);
  if (ms === null) return '';
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "3 – 5 March", or "28 February – 2 March" when the month changes. */
export function shortDateRange(start: string, end: string): string {
  const a = utcDay(start);
  const b = utcDay(end);
  if (a === null) return '';
  const from = new Date(a);
  const fromMonth = MONTHS[from.getUTCMonth()];
  if (b === null || b <= a) return `${from.getUTCDate()} ${fromMonth}`;
  const to = new Date(b);
  const toMonth = MONTHS[to.getUTCMonth()];
  if (fromMonth === toMonth && from.getUTCFullYear() === to.getUTCFullYear()) {
    return `${from.getUTCDate()} – ${to.getUTCDate()} ${toMonth}`;
  }
  return `${from.getUTCDate()} ${fromMonth} – ${to.getUTCDate()} ${toMonth}`;
}

/** "09:40" becomes "9:40 am". Empty when there is no time or it is malformed. */
export function clock12(hhmm: string | undefined): string {
  if (!hhmm) return '';
  const m = TIME_RE.exec(hhmm.trim());
  if (!m) return '';
  const hours = Number(m[1]);
  const minutes = m[2]!;
  if (hours > 23 || Number(minutes) > 59) return '';
  const suffix = hours < 12 ? 'am' : 'pm';
  const shown = hours % 12 === 0 ? 12 : hours % 12;
  return `${shown}:${minutes} ${suffix}`;
}

/** Minutes since midnight for a stored "HH:mm", or null. */
export function minutesOfDay(hhmm: string | undefined): number | null {
  if (!hhmm) return null;
  const m = TIME_RE.exec(hhmm.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
