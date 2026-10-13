/** What the forest plants: one finished task, already placed in its week of the year. */
export type Species = 'life' | 'teaching' | 'health' | 'wedding' | 'other';
export type Done = { id: string; title: string; species: Species; completed: Date; week: number; late?: boolean };

const DAY = 86400000;

/** Monday on or before 1 January: week 1 of the Grove year (the same weeks as the Notion zones). */
export function weekOne(year: number): number {
  const jan1 = Date.UTC(year, 0, 1);
  return jan1 - ((new Date(jan1).getUTCDay() + 6) % 7) * DAY;
}

/** Week of the year for a YYYY-MM-DD day. The forest has 52 pieces; a partial week 53 joins week 52. */
export function weekOfDay(dayKey: string, year: number): number {
  const day = Date.parse(dayKey + 'T00:00:00Z');
  return Math.min(52, Math.floor((day - weekOne(year)) / (7 * DAY)) + 1);
}

export function weekRange(week: number, year: number): [Date, Date] {
  const start = new Date(Math.max(weekOne(year) + (week - 1) * 7 * DAY, Date.UTC(year, 0, 1)));
  const end = new Date(Math.min(weekOne(year) + (week * 7 - 1) * DAY, Date.UTC(year, 11, 31)));
  return [start, week === 52 ? new Date(Date.UTC(year, 11, 31)) : end];
}
