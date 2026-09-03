export function isCalendarDate(value: unknown): value is string {
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

function parseKey(key: string): { year: number; month: number; day: number } {
  if (!isCalendarDate(key)) throw new TypeError(`Invalid calendar date: ${key}`);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)!;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function utcDate(key: string): Date {
  const { year, month, day } = parseKey(key);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function addCalendarDays(key: string, count: number): string {
  const date = utcDate(key);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function weekStartMonday(key: string): string {
  const day = utcDate(key).getUTCDay();
  return addCalendarDays(key, -((day + 6) % 7));
}

export const daysBetween = (a: string, b: string): number =>
  Math.round((utcDate(b).getTime() - utcDate(a).getTime()) / 86400000);

export function enumerateDateKeys(start: string, end: string): string[] {
  parseKey(start);
  parseKey(end);
  const keys: string[] = [];
  for (let key = start; key <= end; key = addCalendarDays(key, 1)) keys.push(key);
  return keys;
}
