import { describe, expect, it } from 'vitest';
import { buildPhotoStops, buildSegments } from '@/journal/map-connections';
import { layoutPhotoStopSchematic } from '@/journal/map-preview';
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

describe('layoutPhotoStopSchematic', () => {
  it('returns one point and no paths for a single stop', () => {
    const stops = buildPhotoStops([
      moment({ id: 'a', display_order: 1, coordinates: { lat: 3, lon: 101 } }),
    ]);
    const layout = layoutPhotoStopSchematic(stops, buildSegments(stops));
    expect(layout.points).toHaveLength(1);
    expect(layout.paths).toHaveLength(0);
  });

  it('draws a path when two stops connect', () => {
    const stops = buildPhotoStops([
      moment({ id: 'a', display_order: 1, coordinates: { lat: 3, lon: 101 } }),
      moment({ id: 'b', display_order: 2, coordinates: { lat: 3.1, lon: 101.2 } }),
    ]);
    const layout = layoutPhotoStopSchematic(stops, buildSegments(stops));
    expect(layout.points).toHaveLength(2);
    expect(layout.paths.length).toBeGreaterThan(0);
  });
});
