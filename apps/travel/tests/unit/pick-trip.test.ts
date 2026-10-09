import { describe, expect, it } from 'vitest';
import { pickPrimaryTrip } from '@/lib/pick-trip';
import type { TripSummary } from '@/types';

function trip(partial: Partial<TripSummary> & Pick<TripSummary, 'id' | 'start_date' | 'end_date'>): TripSummary {
  return {
    title: partial.title ?? partial.id,
    cities: partial.cities ?? [],
    countries: partial.countries ?? [],
    ...partial
  };
}

describe('pickPrimaryTrip', () => {
  it('returns null for an empty list', () => {
    expect(pickPrimaryTrip([])).toBeNull();
  });

  it('prefers a trip that is on now', () => {
    const trips = [
      trip({ id: 'past', start_date: '2026-01-01', end_date: '2026-01-10' }),
      trip({ id: 'now', start_date: '2026-10-01', end_date: '2026-10-20' }),
      trip({ id: 'soon', start_date: '2026-12-01', end_date: '2026-12-20' })
    ];
    expect(pickPrimaryTrip(trips, '2026-10-09')?.id).toBe('now');
  });

  it('picks the soonest upcoming when none are on now', () => {
    const trips = [
      trip({ id: 'later', start_date: '2027-03-01', end_date: '2027-03-10' }),
      trip({ id: 'sooner', start_date: '2026-12-01', end_date: '2026-12-20' }),
      trip({ id: 'past', start_date: '2026-01-01', end_date: '2026-01-10' })
    ];
    expect(pickPrimaryTrip(trips, '2026-10-09')?.id).toBe('sooner');
  });

  it('falls back to the most recently finished trip', () => {
    const trips = [
      trip({ id: 'old', start_date: '2025-01-01', end_date: '2025-01-10' }),
      trip({ id: 'newer', start_date: '2026-02-01', end_date: '2026-02-14' })
    ];
    expect(pickPrimaryTrip(trips, '2026-10-09')?.id).toBe('newer');
  });
});
