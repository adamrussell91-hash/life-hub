import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LISBON_PORTO_PHOTOS, lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import { isAudioMedia } from '@/journal/transcripts';
import testTrip from '../../fixtures/test-trip.json';

const journal = lisbonPortoJournal(testTrip.id);

describe('lisbonPortoJournal', () => {
  it('has a photo file on disk for every photo it names', () => {
    for (const name of Object.keys(LISBON_PORTO_PHOTOS)) {
      const file = path.resolve(__dirname, '../../fixtures/journal-photos', `${name}.jpg`);
      expect(existsSync(file), `${name}.jpg`).toBe(true);
    }
  });

  it('only refers to media, legs and days that exist', () => {
    const mediaIds = new Set(journal.media.map((m) => m.id));
    const legIds = new Set(journal.legs.map((l) => l.id));
    const days = new Set(journal.days.map((d) => `${d.leg_id}|${d.local_date}`));
    for (const moment of journal.moments) {
      expect(legIds.has(moment.leg_id)).toBe(true);
      expect(days.has(`${moment.leg_id}|${moment.local_date}`)).toBe(true);
      for (const id of moment.media_ids) expect(mediaIds.has(id), `${moment.id} → ${id}`).toBe(true);
    }
  });

  it('matches the test trip: its cities, its dates and its train', () => {
    const cityIds = new Set(testTrip.cities.map((c) => c.id));
    for (const leg of journal.legs) expect(cityIds.has(leg.city_id ?? '')).toBe(true);
    for (const day of journal.days) {
      expect(day.local_date >= testTrip.start_date && day.local_date <= testTrip.end_date).toBe(true);
    }
    const itemIds = new Set(testTrip.items.map((i) => i.id));
    expect(itemIds.has(journal.transitions[0]!.itinerary_item_id ?? '')).toBe(true);
  });

  it('covers every kind of moment the story view draws', () => {
    const photosOf = (id: string) =>
      journal.moments.find((m) => m.id === id)!.media_ids.filter((mid) => !isAudioMedia(journal.media.find((x) => x.id === mid)!));
    expect(journal.moments.some((m) => photosOf(m.id).length === 1)).toBe(true);
    expect(journal.moments.some((m) => photosOf(m.id).length >= 2)).toBe(true);
    expect(journal.moments.some((m) => photosOf(m.id).length === 0 && m.text)).toBe(true);
    expect(journal.moments.some((m) => m.media_ids.some((mid) => isAudioMedia(journal.media.find((x) => x.id === mid)!)))).toBe(true);
    expect(journal.moments.some((m) => m.meal)).toBe(true);
    expect(journal.moments.some((m) => m.author === 'partner')).toBe(true);
    expect(journal.days.some((d) => d.empty_marker)).toBe(true);
  });
});
