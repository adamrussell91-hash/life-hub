import type { TripSummary } from '@/types';

/** Pick the trip Today / bare `/travel/` should open: on now, else soonest upcoming, else most recently finished. */
export function pickPrimaryTrip(trips: TripSummary[], today = new Date().toISOString().slice(0, 10)): TripSummary | null {
  if (!trips.length) return null;
  const onNow = trips
    .filter((t) => t.start_date <= today && today <= t.end_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (onNow[0]) return onNow[0];
  const upcoming = trips
    .filter((t) => t.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (upcoming[0]) return upcoming[0];
  return [...trips].sort((a, b) => b.end_date.localeCompare(a.end_date))[0] ?? null;
}
