import type { IsoDate } from '@/types';

function weekdayShort(date: IsoDate): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short',
    timeZone: 'UTC'
  });
}

/** "Fri 4 Dec" style label used by the world map status chip and check-ins. */
export function formatWeekdayDate(date: IsoDate): string {
  // Built by hand: en-GB inserts a comma ("Fri, 4 Dec") in some engines.
  const d = new Date(date + 'T00:00:00Z');
  const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${weekdayShort(date)} ${d.getUTCDate()} ${month}`;
}

/**
 * Ticket depart/arrive line. Same-day keeps "Fri 09:35"; overnight uses the
 * full calendar day so a span reads as "Tue 1 Dec 22:15" → "Wed 2 Dec 04:10".
 */
export function formatTicketMoment(date: IsoDate, time: string | undefined, overnight: boolean): string {
  if (!time) return 'Time to set';
  return overnight ? `${formatWeekdayDate(date)} ${time}` : `${weekdayShort(date)} ${time}`;
}

function parts(date: IsoDate): { day: number; month: string; year: number } {
  const d = new Date(date + 'T00:00:00Z');
  return {
    day: d.getUTCDate(),
    month: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
    year: d.getUTCFullYear()
  };
}

/** "1 – 4 Dec", or "30 Nov – 2 Dec" across a month (city chips, scene eyebrow). */
export function formatShortRange(start: IsoDate, end: IsoDate): string {
  const a = parts(start);
  const b = parts(end);
  return a.month === b.month && a.year === b.year
    ? `${a.day} – ${b.day} ${b.month}`
    : `${a.day} ${a.month} – ${b.day} ${b.month}`;
}

/** "1 Dec 2026 – 10 Jan 2027" (trip header). */
export function formatLongRange(start: IsoDate, end: IsoDate): string {
  const a = parts(start);
  const b = parts(end);
  return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`;
}

/** "leave in 65 days" before the trip, "day 3 of 41" during, "back home" after. */
export function formatCountdown(start: IsoDate, end: IsoDate, today: IsoDate): string {
  const dayMs = 86_400_000;
  const toStart = Math.round((Date.parse(start) - Date.parse(today)) / dayMs);
  if (toStart > 1) return `leave in ${toStart} days`;
  if (toStart === 1) return 'leave tomorrow';
  if (toStart === 0) return 'leave today';
  if (today <= end) {
    const total = Math.round((Date.parse(end) - Date.parse(start)) / dayMs) + 1;
    return `day ${-toStart + 1} of ${total}`;
  }
  return 'back home';
}
