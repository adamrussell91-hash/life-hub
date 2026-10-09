import type { TripSummary } from '@/types';

const ALIASES: Record<string, string> = {
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'great britain': 'United Kingdom',
  britain: 'United Kingdom',
  usa: 'United States of America',
  us: 'United States of America',
  'u.s.': 'United States of America',
  'u.s.a.': 'United States of America',
  'united states': 'United States of America',
  'united states of america': 'United States of America',
  korea: 'South Korea',
  'south korea': 'South Korea',
  'republic of korea': 'South Korea',
  turkiye: 'Turkey',
  türkiye: 'Turkey'
};

export function normalizeCountryKey(name: string): string {
  return name.trim().toLowerCase();
}

export function matchAtlasCountry(raw: string, atlasNames: Iterable<string>): string | null {
  const key = normalizeCountryKey(raw);
  if (!key) return null;

  const aliased = ALIASES[key];
  const candidate = aliased ?? raw.trim();
  const candidateKey = normalizeCountryKey(candidate);

  for (const atlasName of atlasNames) {
    if (normalizeCountryKey(atlasName) === candidateKey) return atlasName;
  }
  return null;
}

export function visitedAtlasCountries(
  trips: TripSummary[],
  atlasNames: Iterable<string>,
  todayIso: string
): Set<string> {
  const visited = new Set<string>();
  for (const trip of trips) {
    if (!(trip.end_date < todayIso)) continue;
    for (const country of trip.countries || []) {
      const matched = matchAtlasCountry(country, atlasNames);
      if (matched) visited.add(matched);
    }
  }
  return visited;
}

export function tripsForAtlasCountry(
  trips: TripSummary[],
  atlasCountry: string,
  atlasNames: Iterable<string>
): TripSummary[] {
  const target = matchAtlasCountry(atlasCountry, atlasNames) ?? atlasCountry;
  return trips.filter((trip) =>
    (trip.countries || []).some((country) => matchAtlasCountry(country, atlasNames) === target)
  );
}
