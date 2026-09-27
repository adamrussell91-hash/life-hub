import type { IsoDate } from '@/types';

/** "Fri 4 Dec" style label used by the world map status chip and check-ins. */
export function formatWeekdayDate(date: IsoDate): string {
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
