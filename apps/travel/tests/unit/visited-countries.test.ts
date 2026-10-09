import { describe, expect, it } from 'vitest';
import {
  matchAtlasCountry,
  tripsForAtlasCountry,
  visitedAtlasCountries
} from '@/lib/visited-countries';
import type { TripSummary } from '@/types';

const ATLAS = ['Portugal', 'Malaysia', 'United Kingdom', 'United States of America', 'South Korea', 'Turkey'];

function trip(partial: Partial<TripSummary> & Pick<TripSummary, 'id' | 'end_date' | 'countries'>): TripSummary {
  return {
    title: partial.title ?? partial.id,
    start_date: partial.start_date ?? '2020-01-01',
    cities: partial.cities ?? [],
    ...partial
  };
}

describe('matchAtlasCountry', () => {
  it('matches exact and aliases', () => {
    expect(matchAtlasCountry('Portugal', ATLAS)).toBe('Portugal');
    expect(matchAtlasCountry('UK', ATLAS)).toBe('United Kingdom');
    expect(matchAtlasCountry('USA', ATLAS)).toBe('United States of America');
    expect(matchAtlasCountry('Korea', ATLAS)).toBe('South Korea');
    expect(matchAtlasCountry('Narnia', ATLAS)).toBeNull();
  });
});

describe('visitedAtlasCountries', () => {
  const today = '2026-10-09';
  it('fills only finished trips', () => {
    const trips = [
      trip({ id: 'past', end_date: '2025-01-01', countries: ['Portugal'] }),
      trip({ id: 'now', start_date: '2026-10-01', end_date: '2026-10-20', countries: ['Malaysia'] }),
      trip({ id: 'future', start_date: '2027-03-01', end_date: '2027-03-10', countries: ['South Korea'] })
    ];
    const visited = visitedAtlasCountries(trips, ATLAS, today);
    expect([...visited].sort()).toEqual(['Portugal']);
  });
});

describe('tripsForAtlasCountry', () => {
  it('returns all trips that map to that atlas country', () => {
    const trips = [
      trip({ id: 'a', end_date: '2025-01-01', countries: ['UK'] }),
      trip({ id: 'b', end_date: '2024-01-01', countries: ['United Kingdom'] }),
      trip({ id: 'c', end_date: '2024-01-01', countries: ['Portugal'] })
    ];
    expect(tripsForAtlasCountry(trips, 'United Kingdom', ATLAS).map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
});
