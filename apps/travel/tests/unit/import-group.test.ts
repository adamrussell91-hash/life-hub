import { describe, expect, it } from 'vitest';
import {
  coordsFromGps,
  DEFAULT_GROUPING_THRESHOLDS,
  haversineMetres,
  orientationAppliedDims,
  proposeGroups,
  type InspectedPhoto,
} from '@/journal/import-group';
import { instantFromWallAndOffset, inspectFile } from '@/journal/exif-worker';
import type { JournalLeg } from '@/journal/types';

const IST_LEG: JournalLeg = {
  id: 'leg_istanbul',
  trip_id: 'trp_test',
  pattern_id: 'ist',
  destination: 'Istanbul',
  timezone: 'Europe/Istanbul',
  order: 1,
  lifecycle: 'live',
  start_date: '2026-04-05',
  end_date: '2026-04-12',
};

function photo(partial: Partial<InspectedPhoto> & { checksum: string }): InspectedPhoto {
  return {
    mime: 'image/jpeg',
    width: 1200,
    height: 800,
    capture_wall_time: null,
    raw_metadata: {},
    provenance: {
      capture_time_source: 'none',
      file_last_modified: '2026-04-06T10:00:00.000Z',
      gps_source: 'none',
    },
    ...partial,
  };
}

describe('orientationAppliedDims', () => {
  it('swaps dimensions for EXIF orientations 5–8', () => {
    expect(orientationAppliedDims(4000, 3000, 6)).toEqual({ width: 3000, height: 4000 });
    expect(orientationAppliedDims(4000, 3000, 1)).toEqual({ width: 4000, height: 3000 });
  });
});

describe('coordsFromGps', () => {
  it('drops zero coordinates and keeps real GPS', () => {
    expect(coordsFromGps(0, 0)).toBeUndefined();
    expect(coordsFromGps(41.01, 28.98)).toEqual({ lat: 41.01, lon: 28.98 });
  });
});

describe('instantFromWallAndOffset', () => {
  it('applies positive timezone offset evidence', () => {
    const instant = instantFromWallAndOffset('2026:04:06 14:30:00', 180);
    expect(instant).toBe('2026-04-06T11:30:00.000Z');
  });
});

describe('proposeGroups', () => {
  const ctx = { legs: [IST_LEG], thresholds: DEFAULT_GROUPING_THRESHOLDS };

  it('merges consecutive photos within 45 minutes and 250 metres', () => {
    const base = {
      capture_wall_time: '2026:04:06 10:00:00',
      coordinates: { lat: 41.008, lon: 28.978 },
      provenance: {
        capture_time_source: 'exif' as const,
        file_last_modified: '2026-04-06T10:00:00.000Z',
        gps_source: 'exif' as const,
      },
    };
    const photos = [
      photo({ checksum: 'a', ...base }),
      photo({
        checksum: 'b',
        ...base,
        capture_wall_time: '2026:04:06 10:20:00',
        coordinates: { lat: 41.009, lon: 28.979 },
      }),
    ];
    const groups = proposeGroups(photos, ctx);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.checksums).toEqual(['a', 'b']);
    expect(groups[0]?.location_source).toBe('exif');
  });

  it('splits when GPS stops are farther than 250 metres within the time window', () => {
    const photos = [
      photo({
        checksum: 'near',
        capture_wall_time: '2026:04:06 10:00:00',
        coordinates: { lat: 41.0, lon: 29.0 },
        provenance: {
          capture_time_source: 'exif',
          file_last_modified: '2026-04-06T10:00:00.000Z',
          gps_source: 'exif',
        },
      }),
      photo({
        checksum: 'far',
        capture_wall_time: '2026:04:06 10:15:00',
        coordinates: { lat: 41.01, lon: 29.02 },
        provenance: {
          capture_time_source: 'exif',
          file_last_modified: '2026-04-06T10:00:00.000Z',
          gps_source: 'exif',
        },
      }),
    ];
    expect(haversineMetres(photos[0]!.coordinates!, photos[1]!.coordinates!)).toBeGreaterThan(250);
    const groups = proposeGroups(photos, ctx);
    expect(groups).toHaveLength(2);
  });

  it('time-groups photos without GPS and never invents coordinates', () => {
    const photos = [
      photo({
        checksum: 't1',
        capture_wall_time: '2026:04:06 18:00:00',
        needs_timezone: true,
        provenance: {
          capture_time_source: 'exif',
          file_last_modified: '2026-04-06T10:00:00.000Z',
          gps_source: 'none',
        },
      }),
      photo({
        checksum: 't2',
        capture_wall_time: '2026:04:06 18:30:00',
        needs_timezone: true,
        provenance: {
          capture_time_source: 'exif',
          file_last_modified: '2026-04-06T10:00:00.000Z',
          gps_source: 'none',
        },
      }),
    ];
    const groups = proposeGroups(photos, ctx);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.unlocated).toBe(true);
    expect(groups[0]?.coordinates).toBeUndefined();
    expect(groups[0]?.location_source).toBeUndefined();
  });

  it('keeps midnight-span captures in one group when within 45 minutes', () => {
    const offset = 180;
    const instantA = instantFromWallAndOffset('2026:04:06 23:50:00', offset)!;
    const instantB = instantFromWallAndOffset('2026:04:07 00:05:00', offset)!;
    const photos = [
      photo({
        checksum: 'late',
        capture_wall_time: '2026:04:06 23:50:00',
        offset_minutes: offset,
        instant: instantA,
        provenance: {
          capture_time_source: 'exif',
          file_last_modified: '2026-04-06T10:00:00.000Z',
          gps_source: 'none',
        },
      }),
      photo({
        checksum: 'early',
        capture_wall_time: '2026:04:07 00:05:00',
        offset_minutes: offset,
        instant: instantB,
        provenance: {
          capture_time_source: 'exif',
          file_last_modified: '2026-04-06T10:00:00.000Z',
          gps_source: 'none',
        },
      }),
    ];
    const groups = proposeGroups(photos, ctx);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.checksums).toHaveLength(2);
  });

  it('flags duplicate checksums against known and in-batch copies', () => {
    const photos = [
      photo({
        checksum: 'duphash',
        capture_wall_time: '2026:04:06 12:00:00',
        provenance: {
          capture_time_source: 'exif',
          file_last_modified: '2026-04-06T10:00:00.000Z',
          gps_source: 'none',
        },
      }),
      photo({
        checksum: 'duphash',
        capture_wall_time: '2026:04:06 12:10:00',
        provenance: {
          capture_time_source: 'exif',
          file_last_modified: '2026-04-06T10:00:00.000Z',
          gps_source: 'none',
        },
      }),
    ];
    const groups = proposeGroups(photos, { ...ctx, known_checksums: ['duphash'] });
    expect(groups[0]?.duplicate_checksums).toContain('duphash');
  });

  it('marks missing capture date with needs_date', () => {
    const groups = proposeGroups(
      [photo({ checksum: 'nodate', needs_date: true })],
      ctx
    );
    expect(groups[0]?.needs_date).toBe(true);
    expect(groups[0]?.local_date).toBeNull();
  });

  it('sets needs_timezone when wall time lacks offset evidence', () => {
    const groups = proposeGroups(
      [
        photo({
          checksum: 'wallonly',
          capture_wall_time: '2026:04:06 09:15:00',
          needs_timezone: true,
          provenance: {
            capture_time_source: 'exif',
            file_last_modified: '2026-04-06T10:00:00.000Z',
            gps_source: 'none',
          },
        }),
      ],
      ctx
    );
    expect(groups[0]?.needs_timezone).toBe(true);
    expect(groups[0]?.instant).toBeUndefined();
  });
});

describe('inspectFile', () => {
  it('hashes bytes and does not treat file modification as capture time for stripped PNG', async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);
    const blob = new Blob([png], { type: 'image/png' });
    Object.defineProperty(blob, 'lastModified', { value: Date.parse('2026-04-06T20:00:00.000Z') });
    const inspected = await inspectFile(blob);
    expect(inspected.checksum).toHaveLength(64);
    expect(inspected.mime).toBe('image/png');
    expect(inspected.capture_wall_time).toBeNull();
    expect(inspected.needs_date).toBe(true);
    expect(inspected.provenance.file_last_modified).toBe('2026-04-06T20:00:00.000Z');
    expect(inspected.provenance.capture_time_source).toBe('none');
  });
});
