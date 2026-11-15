/** Times on a Progress share page, always in Sydney time: the class's time, wherever the viewer is. */
const TZ = 'Australia/Sydney';
const stamp = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const dayOnly = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

function pick(fmt: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

/** "Wed 11 Nov, 9:42pm". */
export function formatTickTime(iso: string): string {
  const p = pick(stamp, new Date(iso));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}${String(p.dayPeriod ?? '').toLowerCase().replace(/\./g, '')}`;
}

/** A YYYY-MM-DD calendar day: "Tue 3 Nov". */
export function formatDay(day: string): string {
  const p = pick(dayOnly, new Date(`${day}T00:00:00Z`));
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "planned Tue 3 Nov". */
export const formatPlanned = (day: string): string => `planned ${formatDay(day)}`;

/** "5 ticked within 4 minutes". */
export function burstLabel(burst: { from: string; to: string; count: number }): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(burst.to) - Date.parse(burst.from)) / 60_000));
  return `${burst.count} ticked within ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/** Today in Sydney, YYYY-MM-DD. */
export function sydneyToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
