import type { PageManifestEntry } from "../domain/page";
import type { SavedConstellation } from "./schema";
import { monthIndexFromIso } from "./timeline";

export type PanoramaNote = { pageId: string; title: string; monthIndex: number };

export type MonthBucket = {
  monthIndex: number;
  notes: PanoramaNote[];
  constellations: SavedConstellation[];
};

export function unconnectedEntries(entries: PageManifestEntry[], saved: SavedConstellation[]): PageManifestEntry[] {
  const connected = new Set(saved.flatMap(item => item.notes.map(note => note.pageId)));
  return entries.filter(entry => !connected.has(entry.id));
}

export function buildSkyIndex(entries: PageManifestEntry[], saved: SavedConstellation[]): Map<number, MonthBucket> {
  const buckets = new Map<number, MonthBucket>();
  function bucketFor(monthIndex: number): MonthBucket {
    let bucket = buckets.get(monthIndex);
    if (!bucket) {
      bucket = { monthIndex, notes: [], constellations: [] };
      buckets.set(monthIndex, bucket);
    }
    return bucket;
  }
  for (const entry of unconnectedEntries(entries, saved)) {
    const monthIndex = monthIndexFromIso(entry.created_at);
    if (monthIndex === null) continue;
    bucketFor(monthIndex).notes.push({ pageId: entry.id, title: entry.title, monthIndex });
  }
  for (const item of saved) {
    const monthIndex = monthIndexFromIso(item.createdAt);
    if (monthIndex === null) continue;
    bucketFor(monthIndex).constellations.push(item);
  }
  return buckets;
}

export function skyIndexRange(index: Map<number, MonthBucket>, fallbackMonthIndex: number): { min: number; max: number } {
  if (index.size === 0) return { min: fallbackMonthIndex - 12, max: fallbackMonthIndex };
  const keys = [...index.keys()];
  return { min: Math.min(...keys, fallbackMonthIndex), max: Math.max(...keys, fallbackMonthIndex) };
}
