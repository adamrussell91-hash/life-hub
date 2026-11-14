/**
 * Names for moments that have coordinates and no place, looked up from the
 * coordinates at street or neighbourhood level. A typed name is never replaced.
 */
import type { JournalDocument } from '@/api/journal';
import { reversePlaceName } from '@/api/travel';
import type { JournalMoment } from '@/journal/types';
import { distanceKm } from '@/lib/distance';

/** The server allows 30 place requests a minute, shared with typed search. */
export const PLACE_LOOKUPS_PER_RUN = 12;
/** Two photos this close get the same name from one lookup. */
const SAME_SPOT_KM = 0.05;

export type PlaceLookup = (lat: number, lon: number) => Promise<{ name: string | null }>;

/** Live moments with a location and no name, in story order. Limited to `ids` when given. */
export function momentsNeedingPlace(journal: JournalDocument, ids?: string[]): JournalMoment[] {
  const wanted = ids ? new Set(ids) : null;
  return journal.moments
    .filter((m) => m.lifecycle === 'live' && m.coordinates && !m.place?.name?.trim() && (!wanted || wanted.has(m.id)))
    .sort((a, b) => `${a.local_date}|${a.local_time ?? ''}`.localeCompare(`${b.local_date}|${b.local_time ?? ''}`));
}

/**
 * Look names up one at a time. Stops at the first failure (offline, or the
 * server asking for a pause): the rest are tried on a later visit.
 */
export async function lookUpPlaces(
  moments: JournalMoment[],
  lookup: PlaceLookup = reversePlaceName,
  limit = PLACE_LOOKUPS_PER_RUN,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const seen: Array<{ lat: number; lon: number; name: string | null }> = [];
  let calls = 0;
  for (const moment of moments) {
    const at = moment.coordinates!;
    const near = seen.find((s) => distanceKm(s, at) <= SAME_SPOT_KM);
    let name: string | null;
    if (near) {
      name = near.name;
    } else {
      if (calls >= limit) break;
      calls += 1;
      try {
        name = (await lookup(at.lat, at.lon)).name?.trim() || null;
      } catch {
        break;
      }
      seen.push({ lat: at.lat, lon: at.lon, name });
    }
    if (name) names.set(moment.id, name);
  }
  return names;
}

/** Write the names in, only where the moment still has none. Returns the same journal when nothing changes. */
export function applyPlaceNames(journal: JournalDocument, names: Map<string, string>): JournalDocument {
  let changed = false;
  const moments = journal.moments.map((m) => {
    const name = names.get(m.id);
    if (!name || m.lifecycle !== 'live' || m.place?.name?.trim()) return m;
    changed = true;
    return { ...m, place: { name, source: 'lookup' as const } };
  });
  return changed ? { ...journal, moments, revision: journal.revision + 1 } : journal;
}
