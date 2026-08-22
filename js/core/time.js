export const SYDNEY_TZ = 'Australia/Sydney';

function parts(instant, options) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ, ...options
  }).formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

export function isCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthLengths[month - 1];
}

function parseKey(key) {
  if (!isCalendarDate(key)) throw new TypeError(`Invalid calendar date: ${key}`);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Axis-tick form of a date: "May ’26". */
export function formatShortMonth(value) {
  if (value == null || value === '') return '';
  if (!isCalendarDate(value)) return String(value);
  const { year, month } = parseKey(value);
  return `${SHORT_MONTHS[month - 1]} ’${String(year).slice(-2)}`;
}

function utcDate(key) {
  const { year, month, day } = parseKey(key);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
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

/** Build a Sydney-valid (+10/+11) ISO stamp for a calendar date + HH:MM. */
export function sydneyLocalStamp(dateKey, time) {
  if (!isCalendarDate(dateKey)) throw new TypeError(`Invalid calendar date: ${dateKey}`);
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new TypeError(`Invalid time: ${time}`);
  }
  for (const offset of ['+11:00', '+10:00']) {
    const candidate = `${dateKey}T${time}:00${offset}`;
    const rebuilt = getSydneyTimestamp(new Date(candidate));
    if (rebuilt.startsWith(`${dateKey}T${time}:`)) return rebuilt;
  }
  return getSydneyTimestamp(new Date(`${dateKey}T${time}:00Z`));
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
  parseKey(start);
  parseKey(end);
  const keys = [];
  for (let key = start; key <= end; key = addCalendarDays(key, 1)) keys.push(key);
  return keys;
}
