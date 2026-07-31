export const SYDNEY_TZ = 'Australia/Sydney';

function parts(instant, options) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ, ...options
  }).formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function parseKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new TypeError(`Invalid calendar date: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function utcDate(key) {
  const { year, month, day } = parseKey(key);
  return new Date(Date.UTC(year, month - 1, day));
}

export function getSydneyDateKey(instant = new Date()) {
  const p = parts(instant, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

export function getSydneyTimestamp(instant = new Date()) {
  const p = parts(instant, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset'
  });
  const offset = p.timeZoneName.replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

export function addCalendarDays(key, count) {
  const date = utcDate(key);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function getSydneyWeekStart(key) {
  const day = utcDate(key).getUTCDay();
  return addCalendarDays(key, -((day + 6) % 7));
}

export const daysBetween = (a, b) => Math.round((utcDate(b) - utcDate(a)) / 86400000);

export function enumerateDateKeys(start, end) {
  const keys = [];
  for (let key = start; key <= end; key = addCalendarDays(key, 1)) keys.push(key);
  return keys;
}
