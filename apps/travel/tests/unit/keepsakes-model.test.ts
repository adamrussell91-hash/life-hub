import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import {
  addPhotoKeepsake,
  countKept,
  hideBookingKeepsake,
  keepsakesForDay,
  listKeepsakes,
  listTrashedKeepsakes,
  purgeKeepsake,
  removeKeepsake,
  restoreKeepsake,
  type BookingKeepsake,
  type PhotoKeepsake,
} from '@/journal/keepsakes/model';
import { JOURNAL_SOUVENIRS_PREF_KEY, readSouvenirsMap } from '@/journal/souvenirs';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const trip = testTrip as unknown as Trip;

/** The fixture journal with no keepsakes of its own, so each test starts clean. */
function bare(): JournalDocument {
  const journal = lisbonPortoJournal(trip.id) as JournalDocument;
  return { ...journal, preferences: {} };
}

const photoKeeps = (journal: JournalDocument): PhotoKeepsake[] =>
  listKeepsakes(journal, trip).filter((k): k is PhotoKeepsake => k.type === 'photo');
const bookings = (journal: JournalDocument, t: Trip = trip): BookingKeepsake[] =>
  listKeepsakes(journal, t).filter((k): k is BookingKeepsake => k.type === 'booking');

describe('listKeepsakes', () => {
  it('reads a record from before keepsakes as kind other', () => {
    const journal: JournalDocument = {
      ...bare(),
      preferences: {
        [JOURNAL_SOUVENIRS_PREF_KEY]: {
          sv_old: { id: 'sv_old', title: 'Fridge magnet', moment_id: 'mom_lptram001', lifecycle: 'live', created_at: '2027-03-03T12:00:00.000Z' },
        },
      },
    };
    const [kept] = photoKeeps(journal);
    expect(kept).toMatchObject({ kind: 'other', title: 'Fridge magnet', legId: 'leg_lplisbon01', localDate: '2027-03-03' });
  });

  it('gives one stamp per live city with the country from the trip', () => {
    const stamps = listKeepsakes(bare(), trip).filter((k) => k.type === 'stamp');
    expect(stamps).toEqual([
      { type: 'stamp', id: 'stamp_leg_lplisbon01', legId: 'leg_lplisbon01', city: 'Lisbon', country: 'Portugal', date: '2027-03-03' },
      { type: 'stamp', id: 'stamp_leg_lpporto001', legId: 'leg_lpporto001', city: 'Porto', country: 'Portugal', date: '2027-03-05' },
    ]);
  });

  it('keeps a verified flight and train, and nothing for an unverified one', () => {
    expect(bookings(bare()).map((k) => [k.itemId, k.legId, k.side])).toEqual([
      ['itm_testflight01', 'leg_lplisbon01', 'arrive'],
      ['itm_testtrain01', 'leg_lplisbon01', 'depart'],
    ]);
    const unverified: Trip = {
      ...trip,
      items: trip.items.map((item) => (item.id === 'itm_testtrain01' ? { ...item, number: '' } : item)),
    } as Trip;
    expect(bookings(bare(), unverified).map((k) => k.itemId)).toEqual(['itm_testflight01']);
  });

  it('never carries the booking reference', () => {
    const text = JSON.stringify(bookings(bare()));
    expect(text).not.toContain('TEST-123');
    expect(text).not.toContain('TEST-TRAIN-4');
    expect(bookings(bare())[1]).toMatchObject({
      carrier: 'Test Rail', number: 'IC200', fromCode: 'LSB', toCode: 'OPO', date: '2027-03-05', departTime: '10:30', mode: 'train',
    });
  });

  it('hides a booked ticket, lists it in Trash, and shows it again when restored', () => {
    const hidden = hideBookingKeepsake(bare(), 'itm_testtrain01', 'Test Rail IC200');
    expect(bookings(hidden).map((k) => k.itemId)).toEqual(['itm_testflight01']);
    const trashed = listTrashedKeepsakes(hidden);
    expect(trashed).toEqual([{ id: 'sv_hide_itm_testtrain01', title: 'Test Rail IC200', booking: true }]);
    const restored = restoreKeepsake(hidden, trashed[0]!.id);
    expect(bookings(restored).map((k) => k.itemId)).toEqual(['itm_testflight01', 'itm_testtrain01']);
    expect(readSouvenirsMap(restored)).toEqual({});
  });

  it('files a keepsake with no moment under its own city and day, in time order', () => {
    let journal = addPhotoKeepsake(bare(), {
      kind: 'poster', title: 'Fado poster', legId: 'leg_lplisbon01', localDate: '2027-03-04', localTime: '22:00',
    });
    journal = addPhotoKeepsake(journal, {
      kind: 'ticket', title: 'Tram ticket', legId: 'leg_lplisbon01', localDate: '2027-03-04', localTime: '09:05',
    });
    const day = keepsakesForDay(listKeepsakes(journal, trip), 'leg_lplisbon01', '2027-03-04');
    expect(day.map((k) => k.title)).toEqual(['Tram ticket', 'Fado poster']);
    expect(keepsakesForDay(listKeepsakes(journal, trip), 'leg_lpporto001', '2027-03-04')).toEqual([]);
  });

  it('counts kept things without the stamps', () => {
    const journal = addPhotoKeepsake(bare(), { kind: 'round', title: 'Coaster', legId: 'leg_lpporto001', localDate: '2027-03-05' });
    const all = listKeepsakes(journal, trip);
    expect(countKept(all)).toBe(3);
    expect(countKept(all, 'leg_lpporto001')).toBe(1);
  });

  it('puts stamps first, then the ticket in, the kept things, and the ticket out', () => {
    const journal = addPhotoKeepsake(bare(), { kind: 'ticket', title: 'Tram ticket', legId: 'leg_lplisbon01', localDate: '2027-03-03' });
    const lisbon = listKeepsakes(journal, trip).filter((k) => k.legId === 'leg_lplisbon01');
    expect(lisbon.map((k) => k.type)).toEqual(['stamp', 'booking', 'photo', 'booking']);
  });
});

describe('removing a keepsake', () => {
  it('takes its own photo to Trash with it and brings both back', () => {
    const start = bare();
    const withMedia: JournalDocument = {
      ...start,
      media: [...start.media, { id: 'med_keepsake1', lifecycle: 'live', content_type: 'image/jpeg', width: 800, height: 600 }],
    };
    const journal = addPhotoKeepsake(withMedia, {
      kind: 'ticket', title: 'Funicular ticket', mediaId: 'med_keepsake1', legId: 'leg_lplisbon01', localDate: '2027-03-04',
    });
    const id = photoKeeps(journal)[0]!.id;

    const removed = removeKeepsake(journal, id);
    expect(photoKeeps(removed)).toEqual([]);
    expect(removed.media.find((m) => m.id === 'med_keepsake1')).toMatchObject({ lifecycle: 'deleted', deleted_with: id });
    expect(listTrashedKeepsakes(removed)).toEqual([{ id, title: 'Funicular ticket', booking: false }]);

    const restored = restoreKeepsake(removed, id);
    expect(photoKeeps(restored).map((k) => k.title)).toEqual(['Funicular ticket']);
    const media = restored.media.find((m) => m.id === 'med_keepsake1')!;
    expect(media.lifecycle).toBe('live');
    expect(media.deleted_with).toBeUndefined();

    const purged = purgeKeepsake(removed, id);
    expect(listTrashedKeepsakes(purged)).toEqual([]);
    expect(purged.media.some((m) => m.id === 'med_keepsake1')).toBe(false);
  });

  it('leaves a photo alone when a moment still shows it', () => {
    const journal = addPhotoKeepsake(bare(), {
      kind: 'other', title: 'The view', mediaId: 'med_lparch', momentId: 'mom_lparch001',
    });
    const moment = journal.moments.find((m) => m.id === 'mom_lparch001')!;
    const mediaId = moment.media_ids[0]!;
    const linked = addPhotoKeepsake(bare(), { kind: 'other', title: 'The view', mediaId, momentId: moment.id });
    const id = photoKeeps(linked)[0]!.id;
    const removed = removeKeepsake(linked, id);
    expect(removed.media.find((m) => m.id === mediaId)!.lifecycle).toBe('live');
    const purged = purgeKeepsake(removed, id);
    expect(purged.media.some((m) => m.id === mediaId)).toBe(true);
  });
});
