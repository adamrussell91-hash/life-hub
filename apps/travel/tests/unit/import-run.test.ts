import { describe, expect, it, vi } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import type { InspectedPhoto } from '@/journal/import-group';
import { proposeGroups } from '@/journal/import-group';
import { fileImport, filedSummary, readPhotos, undoImport, type ReadPhoto } from '@/journal/import-run';
import { buildJournalMediaRow } from '@/journal/media-upload';

const journal = (): JournalDocument => lisbonPortoJournal('trp_import_test') as JournalDocument;

function photo(checksum: string, wall: string | null, extra: Partial<InspectedPhoto> = {}): InspectedPhoto {
  return {
    checksum,
    mime: 'image/jpeg',
    width: 1200,
    height: 900,
    capture_wall_time: wall,
    raw_metadata: {},
    provenance: { capture_time_source: wall ? 'exif' : 'none', file_last_modified: '2027-03-06T00:00:00.000Z', gps_source: 'none' },
    needs_date: wall ? undefined : true,
    ...extra,
  };
}
const file = (name: string): File => new File([name], `${name}.jpg`, { type: 'image/jpeg' });
const item = (checksum: string, wall: string | null, extra: Partial<InspectedPhoto> = {}): ReadPhoto => ({
  file: file(checksum),
  photo: photo(checksum, wall, extra),
});

describe('readPhotos', () => {
  it('sorts photos into ready, undated, already here, in Trash and unreadable', async () => {
    const table: Record<string, InspectedPhoto | null> = {
      'a.jpg': photo('aaa', '2027:03:06 09:00:00'),
      'b.jpg': photo('bbb', null),
      'c.jpg': photo('known', '2027:03:06 09:10:00'),
      'd.jpg': photo('gone', '2027:03:06 09:20:00'),
      'e.jpg': null,
      'f.jpg': photo('aaa', '2027:03:06 09:00:00'), // chosen twice
    };
    const progress: Array<[number, number]> = [];
    const result = await readPhotos(Object.keys(table).map((n) => new File(['x'], n)), {
      knownChecksums: ['known'],
      deletedChecksums: ['gone'],
      onProgress: (done, total) => progress.push([done, total]),
      inspect: async (f) => {
        const hit = table[f.name];
        if (!hit) throw new Error('unreadable');
        return hit;
      },
    });
    expect(result.ready.map((r) => r.photo.checksum)).toEqual(['aaa']);
    expect(result.undated.map((r) => r.photo.checksum)).toEqual(['bbb']);
    expect(result).toMatchObject({ alreadyHere: 2, inTrash: 1, unreadable: 1 });
    expect(progress.at(-1)).toEqual([6, 6]);
  });

  it('reads no more than three photos at a time, and each photo once', async () => {
    let running = 0;
    let peak = 0;
    const inspect = vi.fn(async (f: File) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return photo(f.name, '2027:03:06 09:00:00');
    });
    const files = Array.from({ length: 10 }, (_, i) => new File(['x'], `p${i}`));
    const result = await readPhotos(files, { knownChecksums: [], deletedChecksums: [], inspect });
    expect(peak).toBe(3);
    expect(inspect).toHaveBeenCalledTimes(10);
    // Order follows the order chosen, not the order reading finished.
    expect(result.ready.map((r) => r.photo.checksum)).toEqual(files.map((f) => f.name));
  });
});

describe('fileImport', () => {
  it('groups photos into moments by time and files them under the right city and day', async () => {
    const before = journal();
    const items = [
      item('p1', '2027:03:06 15:00:00', { coordinates: { lat: 41.14, lon: -8.61 } }),
      item('p2', '2027:03:06 15:20:00', { coordinates: { lat: 41.1401, lon: -8.6101 } }),
      item('p3', '2027:03:06 19:30:00'),
      item('p4', '2027:03:04 08:15:00'),
    ];
    const filed = await fileImport({ tripId: before.trip_id, journal: before, version: 'fixture', items });
    const after = filed.envelope.journal;
    const added = filed.momentIds.map((id) => after.moments.find((m) => m.id === id)!);
    expect(added.map((m) => [m.leg_id, m.local_date, m.local_time, m.media_ids.length])).toEqual([
      ['leg_lplisbon01', '2027-03-04', '08:15', 1],
      ['leg_lpporto001', '2027-03-06', '15:00', 2],
      ['leg_lpporto001', '2027-03-06', '19:30', 1],
    ]);
    expect(added[1]!.coordinates).toEqual({ lat: 41.14, lon: -8.61 });
    expect(added[1]!.location_source).toBe('exif');
    expect(added[2]!.coordinates).toBeUndefined();
    expect(filed.mediaIds).toHaveLength(4);
    expect(after.revision).toBe(before.revision + 1);
    // Each media row carries the checksum and size worked out when the photo was read.
    const rows = filed.mediaIds.map((id) => after.media.find((m) => m.id === id)!);
    expect(rows.map((r) => r.checksum).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(rows.every((r) => r.width === 1200 && r.height === 900 && r.upload_state === 'pending')).toBe(true);
  });

  it('files photos with no date as one moment on the chosen day', async () => {
    const before = journal();
    const filed = await fileImport({
      tripId: before.trip_id, journal: before, version: 'fixture',
      items: [item('s1', null), item('s2', null)],
      day: { legId: 'leg_lpporto001', localDate: '2027-03-07' },
    });
    const moment = filed.envelope.journal.moments.find((m) => m.id === filed.momentIds[0])!;
    expect(filed.momentIds).toHaveLength(1);
    expect(moment).toMatchObject({ leg_id: 'leg_lpporto001', local_date: '2027-03-07' });
    expect(moment.local_time).toBeUndefined();
    expect(moment.media_ids).toHaveLength(2);
  });

  it('throws rather than save an import with nothing in it', async () => {
    const before = journal();
    await expect(fileImport({ tripId: before.trip_id, journal: before, version: 'fixture', items: [] })).rejects.toThrow();
  });

  it('undo sends exactly the new moments and their photos to Trash', async () => {
    const before = journal();
    const filed = await fileImport({
      tripId: before.trip_id, journal: before, version: 'fixture',
      items: [item('u1', '2027:03:06 15:00:00'), item('u2', '2027:03:06 20:00:00')],
    });
    const undone = undoImport(filed.envelope.journal, filed.momentIds);
    const live = (j: JournalDocument) => j.moments.filter((m) => m.lifecycle === 'live').map((m) => m.id).sort();
    expect(live(undone)).toEqual(live(before));
    for (const id of filed.mediaIds) expect(undone.media.find((m) => m.id === id)!.lifecycle).toBe('deleted');
    expect(undone.media.filter((m) => m.lifecycle === 'live').length).toBe(before.media.filter((m) => m.lifecycle === 'live').length);
  });
});

describe('speed', () => {
  it('does not hash or decode a photo again when its checksum and size are already known', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest');
    const blob = new Blob(['not really a jpeg'], { type: 'image/jpeg' });
    const row = await buildJournalMediaRow('med_speedtest01', blob, 'image/jpeg', { checksum: 'abc123', width: 800, height: 600 });
    expect(digest).not.toHaveBeenCalled();
    expect(row).toMatchObject({ checksum: 'abc123', width: 800, height: 600, byte_size: blob.size });
    digest.mockRestore();
  });
});

describe('nearest city by date', () => {
  const legs = journal().legs;
  const legFor = (wall: string) => proposeGroups([photo('x', wall)], { legs })[0]!.leg_id;
  it('keeps a date inside a city in that city', () => {
    expect(legFor('2027:03:04 10:00:00')).toBe('leg_lplisbon01');
    expect(legFor('2027:03:06 10:00:00')).toBe('leg_lpporto001');
  });
  it('sends the day after the trip to the last city, not the first', () => {
    expect(legFor('2027:03:08 07:00:00')).toBe('leg_lpporto001');
    expect(legFor('2027:03:02 23:00:00')).toBe('leg_lplisbon01');
  });
});

describe('filedSummary', () => {
  it('says what was filed and what was left out', () => {
    expect(filedSummary({ photos: 12, moments: 4, alreadyHere: 3, inTrash: 1, unreadable: 1 })).toEqual({
      headline: 'Filed 12 photos into 4 moments',
      notes: ['3 were already here', '1 is in Trash', '1 file could not be read'],
    });
    expect(filedSummary({ photos: 1, moments: 1 })).toEqual({ headline: 'Filed 1 photo into 1 moment', notes: [] });
    expect(filedSummary({ photos: 0, moments: 0, alreadyHere: 1 })).toEqual({ headline: 'Nothing new to file', notes: ['1 was already here'] });
  });
});
