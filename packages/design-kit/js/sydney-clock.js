/** Australia/Sydney wall clock for hub calendars. Pure helpers — no I/O. */

export const SYDNEY_TZ = 'Australia/Sydney';

function parts(instant, options) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SYDNEY_TZ,
      ...options
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

/** Calendar day key `YYYY-MM-DD` on the Sydney clock. */
export function getSydneyDateKey(instant = new Date()) {
  const p = parts(instant, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since midnight on the Sydney wall clock. */
export function getSydneyMinutesOfDay(instant = new Date()) {
  const p = parts(instant, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return Number(p.hour) * 60 + Number(p.minute);
}
