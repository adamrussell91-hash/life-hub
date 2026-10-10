import { describe, expect, it } from 'vitest';
import {
  buildPhotoStops,
  buildSegments,
  visualDedupeKey,
} from '@/journal/map-connections';
import type { JournalMoment } from '@/journal/types';

function moment(partial: Partial<JournalMoment> & Pick<JournalMoment, 'id' | 'display_order'>): JournalMoment {
  return {
    leg_id: 'leg_a',
    local_date: '2026-04-01',
    media_ids: [],
    lifecycle: 'live',
    ...partial,
  };
}

describe('buildPhotoStops', () => {
  it('keeps only located live moments in display order', () => {
    const stops = buildPhotoStops([
      moment({ id: 'm2', display_order: 2, coordinates: { lat: 41.01, lon: 28.97 } }),
      moment({ id: 'm1', display_order: 1, coordinates: { lat: 3.14, lon: 101.69 } }),
      moment({ id: 'm3', display_order: 3 }),
    ]);
    expect(stops.map((s) => s.momentId)).toEqual(['m1', 'm2']);
  });
});

describe('buildSegments', () => {
  it('draws two segments for three consecutive located stops', () => {
    const stops = buildPhotoStops([
      moment({ id: 'a', display_order: 1, coordinates: { lat: 0, lon: 0 } }),
      moment({ id: 'b', display_order: 2, coordinates: { lat: 1, lon: 1 } }),
      moment({ id: 'c', display_order: 3, coordinates: { lat: 2, lon: 2 } }),
    ]);
    const segments = buildSegments(stops);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.fromMomentId).toBe('a');
    expect(segments[0]?.toMomentId).toBe('b');
    expect(segments[1]?.fromMomentId).toBe('b');
    expect(segments[1]?.toMomentId).toBe('c');
  });

  it('breaks the chain when unlocated material sits between located stops', () => {
    const stops = buildPhotoStops([
      moment({ id: 'a', display_order: 1, coordinates: { lat: 10, lon: 10 } }),
      moment({ id: 'u', display_order: 2 }),
      moment({ id: 'b', display_order: 3, coordinates: { lat: 20, lon: 20 } }),
    ]);
    expect(buildSegments(stops)).toHaveLength(0);
  });

  it('interpolates across the antimeridian on the short great-circle path', () => {
    const stops = buildPhotoStops([
      moment({ id: 'w', display_order: 1, coordinates: { lat: 0, lon: 170 } }),
      moment({ id: 'e', display_order: 2, coordinates: { lat: 0, lon: -170 } }),
    ]);
    const [segment] = buildSegments(stops, { steps: 8 });
    expect(segment?.coordinates.length).toBeGreaterThan(2);
    const lons = segment!.coordinates.map(([lon]) => lon);
    expect(lons.some((lon) => Math.abs(lon) > 175)).toBe(true);
    expect(lons.every((lon) => Math.abs(lon) <= 180)).toBe(true);
  });
});

describe('visualDedupeKey', () => {
  it('clusters coordinates that differ only within display epsilon', () => {
    expect(visualDedupeKey(41.0082, 28.9784)).toBe(visualDedupeKey(41.00821, 28.97841));
    expect(visualDedupeKey(41.0082, 28.9784)).not.toBe(visualDedupeKey(41.02, 28.98));
  });
});
