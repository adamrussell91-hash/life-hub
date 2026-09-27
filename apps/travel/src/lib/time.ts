/** Time helpers per brief §2.8. Every item stores date+time in the city's
 * local wall-clock time; these convert to/from real instants. */

/** Guess-then-correct UTC offset loop (Intl has no direct zoned constructor). */
export function zonedToInstant(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  let guess = Date.UTC(y!, (m ?? 1) - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const offsetMinutes = offsetMinutesAt(guess, tz);
    guess = Date.UTC(y!, (m ?? 1) - 1, d, hh, mm) - offsetMinutes * 60_000;
  }
  return new Date(guess);
}

function offsetMinutesAt(epochMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
  const part = dtf.formatToParts(new Date(epochMs)).find((p) => p.type === 'timeZoneName');
  const match = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec(part?.value ?? 'GMT+0');
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

export interface FormatInZoneOptions {
  hour?: '2-digit' | 'numeric';
  minute?: '2-digit' | 'numeric';
  hour12?: boolean;
  weekday?: 'short' | 'long';
  day?: 'numeric';
  month?: 'short' | 'long';
}

/** Formats an instant in a zone. Default: 24h "HH:MM". */
export function formatInZone(instant: Date, tz: string, opts: FormatInZoneOptions = {}): string {
  const { hour = '2-digit', minute = '2-digit', hour12 = false, ...rest } = opts;
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour,
    minute,
    hour12,
    ...rest
  });
  return dtf.format(instant);
}

/** Local YYYY-MM-DD of an instant in a zone, for "(next day)" comparisons. */
export function dateInZone(instant: Date, tz: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dtf.format(instant);
}
