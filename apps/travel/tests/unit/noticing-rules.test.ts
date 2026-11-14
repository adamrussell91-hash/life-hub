import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { lisbonPortoJournal } from '@/journal/fixtures/lisbon-porto';
import {
  cardsToOffer,
  dismissCard,
  keepCard,
  keptForDay,
  markSeen,
  readNoticingState,
  unkeepCard,
  UNKIND_WORDING,
  type NoticeCard,
} from '@/journal/noticing/model';
import { countingCards, noticingDay, tripDayFacts, type HistoryDay, type NoticingHistory } from '@/journal/noticing/rules';
import type { Trip } from '@/types';
import testTrip from '../../fixtures/test-trip.json';

const trip = testTrip as unknown as Trip; // 3 to 7 March 2027: Lisbon then Porto, both in Portugal
const journal = (): JournalDocument => lisbonPortoJournal(trip.id) as JournalDocument;

const pastDay = (date: string, city: string, country: string, extra: Partial<HistoryDay> = {}): HistoryDay => ({
  trip_id: 'trp_past0001', date, city, country, photos: 4, first_time: '09:00', last_time: '20:00',
  north: null, south: null, photo_ids: ['med_p1', 'med_p2'], ...extra,
});
const history = (days: HistoryDay[], tripDays = 6, cities = [{ name: 'Hanoi', country: 'Vietnam', start_date: '2026-03-01', end_date: '2026-03-06' }]): NoticingHistory => ({
  trips: [{ id: 'trp_past0001', title: 'Invented north', start_date: '2026-03-01', end_date: '2026-03-06', days: tripDays, cities }],
  days,
});
const kinds = (cards: NoticeCard[]): string[] => cards.map((c) => c.kind).sort();
const cardsFor = (day: string, h: NoticingHistory | null, j = journal(), t = trip): NoticeCard[] => countingCards({ journal: j, trip: t, history: h, day });
const find = (cards: NoticeCard[], kind: string): NoticeCard | undefined => cards.find((c) => c.kind === kind);

describe('which day the cards are about', () => {
  it('is the latest journaled day up to today, and nothing before the trip or well after it', () => {
    expect(noticingDay(journal(), trip, '2027-03-02')).toBeNull();
    expect(noticingDay(journal(), trip, '2027-03-03')).toBe('2027-03-03');
    expect(noticingDay(journal(), trip, '2027-03-07')).toBe('2027-03-06'); // nothing journaled on the 7th yet
    expect(noticingDay(journal(), trip, '2027-03-08')).toBe('2027-03-06'); // the morning after
    expect(noticingDay(journal(), trip, '2027-03-09')).toBeNull();
  });

  it('never counts Partner’s lines', () => {
    const facts = tripDayFacts(journal(), trip);
    expect(facts.flatMap((d) => d.moments).some((m) => m.author === 'partner')).toBe(false);
  });
});

describe('cards from past trips', () => {
  it('on this day: the same date in an earlier journal, with its photos', () => {
    const card = find(cardsFor('2027-03-05', history([pastDay('2026-03-05', 'Hanoi', 'Vietnam')])), 'on-this-day')!;
    expect(card.headline).toBe('A year ago today you were in Hanoi');
    expect(card.photos).toEqual([{ tripId: 'trp_past0001', mediaId: 'med_p1' }, { tripId: 'trp_past0001', mediaId: 'med_p2' }]);
    expect(card.basis).toBe('4 photos from 5 March 2026, in your journal of Invented north');
    expect(find(cardsFor('2027-03-05', history([pastDay('2025-03-05', 'Hanoi', 'Vietnam')])), 'on-this-day')!.headline).toBe('2 years ago today you were in Hanoi');
  });

  it('on this day: not for a different date, a day with no photos, or with no history', () => {
    expect(find(cardsFor('2027-03-05', history([pastDay('2026-03-04', 'Hanoi', 'Vietnam')])), 'on-this-day')).toBeUndefined();
    expect(find(cardsFor('2027-03-05', history([pastDay('2026-03-05', 'Hanoi', 'Vietnam', { photos: 0, photo_ids: [] })])), 'on-this-day')).toBeUndefined();
    expect(cardsFor('2027-03-05', null).every((c) => c.source === 'trip')).toBe(true);
  });

  it('back again: the first day in a city an earlier trip went to', () => {
    const h = history([pastDay('2025-06-10', 'Porto', 'Portugal')], 6, [{ name: 'Porto', country: 'Portugal', start_date: '2025-06-08', end_date: '2025-06-12' }]);
    const card = find(cardsFor('2027-03-05', h), 'back-again')!;
    expect(card.headline).toBe('Back in Porto');
    expect(card.body).toBe('You were last here in June 2025.');
    expect(card.basis).toBe('From your journal of Invented north');
    // Not on the second day there, and not in a city that is new.
    expect(find(cardsFor('2027-03-06', h), 'back-again')).toBeUndefined();
    expect(find(cardsFor('2027-03-03', h), 'back-again')).toBeUndefined();
  });

  it('new country: only when no earlier trip went there, and only on the first day', () => {
    const elsewhere = history([pastDay('2026-03-01', 'Hanoi', 'Vietnam')]);
    const card = find(cardsFor('2027-03-03', elsewhere), 'new-country')!;
    expect(card.headline).toBe('Portugal is new to your journal');
    expect(card.stats).toEqual([{ value: '2', label: 'countries journaled' }]);
    expect(find(cardsFor('2027-03-04', elsewhere), 'new-country')).toBeUndefined();
    const beenBefore = history([], 6, [{ name: 'Faro', country: 'Portugal', start_date: '2025-06-08', end_date: '2025-06-12' }]);
    expect(find(cardsFor('2027-03-03', beenBefore), 'new-country')).toBeUndefined();
    // With no earlier trips there is nothing to be new against.
    expect(find(cardsFor('2027-03-03', { trips: [], days: [] }), 'new-country')).toBeUndefined();
  });

  it('longest trip: on the day it passes the longest before, not a day early or late', () => {
    expect(find(cardsFor('2027-03-06', history([], 3)), 'longest-trip')!.body).toBe(
      'Today is day 4. The longest before it was Invented north, 3 days in 2026.',
    );
    expect(find(cardsFor('2027-03-05', history([], 3)), 'longest-trip')).toBeUndefined();
    expect(find(cardsFor('2027-03-06', history([], 2)), 'longest-trip')).toBeUndefined();
  });

  it('furthest north: beats every located day before, and needs three to beat', () => {
    const south = [
      pastDay('2026-03-01', 'Hanoi', 'Vietnam', { north: { lat: 21.0, place: 'Hanoi' }, south: { lat: 21.0, place: 'Hanoi' } }),
      pastDay('2026-03-02', 'Hue', 'Vietnam', { north: { lat: 16.5, place: 'Hue' }, south: { lat: 16.4, place: 'Hue' } }),
      pastDay('2026-03-03', 'Hoi An', 'Vietnam', { north: { lat: 15.9, place: 'Hoi An' }, south: { lat: 15.8, place: 'Hoi An' } }),
    ];
    const card = find(cardsFor('2027-03-03', history(south)), 'furthest-north')!;
    expect(card.headline).toBe('The furthest north your journal has been');
    expect(card.body).toMatch(/at 38\.7°N\. Before today it was Hanoi in 2026, at 21\.0°N\.$/);
    expect(card.basis).toBe('Compared with every located moment in your journal, 3 days of them');
    // Somewhere further north already journaled: no card.
    const north = [...south.slice(0, 2), pastDay('2026-03-03', 'Bergen', 'Norway', { north: { lat: 60.4, place: 'Bergen' }, south: { lat: 60.3, place: 'Bergen' } })];
    expect(find(cardsFor('2027-03-03', history(north)), 'furthest-north')).toBeUndefined();
    expect(find(cardsFor('2027-03-03', history(south.slice(0, 2))), 'furthest-north')).toBeUndefined();
  });

  it('most photographed city: on the day this city passes the record', () => {
    const facts = tripDayFacts(journal(), trip);
    const portoBefore = facts.filter((d) => d.city === 'Porto' && d.date < '2027-03-06').reduce((n, d) => n + d.photos.length, 0);
    const portoToday = facts.find((d) => d.date === '2027-03-06')!.photos.length;
    expect(portoToday).toBeGreaterThan(0);
    // An earlier visit to Porto with 30 photos, and a rival city that today's photos pass by one.
    const rival = 30 + portoBefore + portoToday - 1;
    const h = history([
      pastDay('2025-06-10', 'Porto', 'Portugal', { photos: 30 }),
      pastDay('2026-03-01', 'Hanoi', 'Vietnam', { photos: rival }),
    ]);
    const card = find(cardsFor('2027-03-06', h), 'most-photographed')!;
    expect(card.headline).toBe('Porto is now your most photographed city');
    expect(card.stats).toEqual([
      { value: String(rival + 1), label: 'photos of Porto' },
      { value: String(rival), label: 'of Hanoi, the most until today' },
    ]);
    // The day before, it had not passed it yet.
    expect(find(cardsFor('2027-03-05', h), 'most-photographed')).toBeUndefined();
    // A record this small is not worth a card, and one not yet passed makes none.
    expect(find(cardsFor('2027-03-06', history([pastDay('2026-03-01', 'Hanoi', 'Vietnam', { photos: 500 })])), 'most-photographed')).toBeUndefined();
    expect(find(cardsFor('2027-03-06', history([pastDay('2026-03-01', 'Hanoi', 'Vietnam', { photos: 3 })])), 'most-photographed')).toBeUndefined();
  });
});

describe('cards from this trip', () => {
  /** The fixture with extra photos on one day, so it becomes the biggest. */
  function withPhotosOn(date: string, count: number): JournalDocument {
    const j = journal();
    const moment = j.moments.find((m) => m.local_date === date && m.lifecycle === 'live' && m.author !== 'partner')!;
    const extra = Array.from({ length: count }, (_, i) => ({ id: `med_extra${i}`, lifecycle: 'live' as const, content_type: 'image/jpeg', width: 800, height: 600 }));
    return {
      ...j,
      media: [...j.media, ...extra],
      moments: j.moments.map((m) => (m.id === moment.id ? { ...m, media_ids: [...m.media_ids, ...extra.map((e) => e.id)] } : m)),
    };
  }

  it('biggest day: more photos than any other day, from the third day on, and at least eight', () => {
    const card = find(cardsFor('2027-03-06', null, withPhotosOn('2027-03-06', 8)), 'biggest-day')!;
    expect(card.headline).toBe('Your biggest day yet');
    expect(card.stats![0]!.label).toBe('photos today');
    expect(card.photos).toHaveLength(3);
    expect(find(cardsFor('2027-03-06', null), 'biggest-day')).toBeUndefined(); // only a few photos
    expect(find(cardsFor('2027-03-04', null, withPhotosOn('2027-03-04', 12)), 'biggest-day')).toBeUndefined(); // only the second day
  });

  it('halfway: on the middle day only', () => {
    const card = find(cardsFor('2027-03-05', null), 'halfway')!;
    expect(card.body).toBe('Day 3 of 5.');
    expect(card.stats!.map((s) => s.label)).toEqual(['photos', 'moments', 'cities']);
    expect(find(cardsFor('2027-03-04', null), 'halfway')).toBeUndefined();
    expect(find(cardsFor('2027-03-06', null), 'halfway')).toBeUndefined();
  });

  it('earliest start: earlier than every day before, and before 8 am', () => {
    const j = journal();
    const first = j.moments.filter((m) => m.local_date === '2027-03-06' && m.lifecycle === 'live').sort((a, b) => (a.local_time ?? '').localeCompare(b.local_time ?? ''))[0]!;
    const early = { ...j, moments: j.moments.map((m) => (m.id === first.id ? { ...m, local_time: '06:12' } : m)) };
    const card = find(cardsFor('2027-03-06', null, early), 'earliest-start')!;
    expect(card.stats).toEqual([{ value: '6:12 am', label: 'the first moment today' }]);
    expect(card.momentId).toBe(first.id);
    expect(find(cardsFor('2027-03-06', null), 'earliest-start')).toBeUndefined();
  });
});

describe('every card', () => {
  const rich = history(
    [pastDay('2026-03-05', 'Porto', 'Portugal'), pastDay('2026-03-03', 'Hanoi', 'Vietnam')],
    2,
    [{ name: 'Porto', country: 'Spain', start_date: '2026-03-01', end_date: '2026-03-06' }],
  );
  const all = ['2027-03-03', '2027-03-04', '2027-03-05', '2027-03-06'].flatMap((day) => cardsFor(day, rich));

  it('says what it is based on, has a stable key, and is kind', () => {
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const card of all) {
      expect(card.basis.length, card.kind).toBeGreaterThan(10);
      expect(card.key.startsWith(`${card.kind}:`)).toBe(true);
      const text = [card.headline, card.body ?? '', card.basis, ...(card.stats ?? []).map((s) => `${s.value} ${s.label}`)].join(' ');
      expect(text).not.toMatch(UNKIND_WORDING);
      expect(text).not.toMatch(/undefined|NaN|null/);
    }
    expect(new Set(all.map((c) => c.key)).size).toBe(all.length);
    expect(kinds(all)).toContain('on-this-day');
  });
});

describe('seen, kept and not right', () => {
  const card = (key: string, score: number, day = '2027-03-05'): NoticeCard => ({ key, kind: key.split(':')[0]!, source: 'trip', day, headline: key, basis: 'Counted from this trip so far', score });

  it('offers unseen cards best first, five at most, and never one twice', () => {
    const cards = [1, 2, 3, 4, 5, 6, 7].map((n) => card(`k:${n}`, n));
    const state = readNoticingState(journal());
    expect(cardsToOffer([...cards, cards[6]!], state).map((c) => c.key)).toEqual(['k:7', 'k:6', 'k:5', 'k:4', 'k:3']);
    const seen = markSeen(journal(), ['k:7', 'k:6']);
    expect(cardsToOffer(cards, readNoticingState(seen)).map((c) => c.key)).toEqual(['k:5', 'k:4', 'k:3', 'k:2', 'k:1']);
    expect(markSeen(seen, ['k:7'])).toBe(seen); // nothing new to save
  });

  it('keeps a card whole in the story, and takes it out again', () => {
    const kept = keepCard(journal(), card('halfway:x', 50));
    expect(keptForDay(readNoticingState(kept), '2027-03-05').map((c) => c.key)).toEqual(['halfway:x']);
    expect(keptForDay(readNoticingState(kept), '2027-03-06')).toEqual([]);
    expect(cardsToOffer([card('halfway:x', 50)], readNoticingState(kept))).toEqual([]);
    const out = unkeepCard(kept, 'halfway:x');
    expect(keptForDay(readNoticingState(out), '2027-03-05')).toEqual([]);
    expect(cardsToOffer([card('halfway:x', 50)], readNoticingState(out))).toEqual([]); // seen, so not offered again
  });

  it('"Not right" removes a card for good', () => {
    const dismissed = dismissCard(keepCard(journal(), card('biggest-day:x', 60)), 'biggest-day:x');
    const state = readNoticingState(dismissed);
    expect(state.dismissed).toEqual(['biggest-day:x']);
    expect(state.kept).toEqual({});
    expect(cardsToOffer([card('biggest-day:x', 60)], state)).toEqual([]);
  });

  it('ignores anything in storage that is not a card', () => {
    const odd = { ...journal(), preferences: { journal_noticing_v1: { seen: 'yes', kept: { a: { key: 1 } }, dismissed: [3, 'ok'] } } } as unknown as JournalDocument;
    expect(readNoticingState(odd)).toEqual({ seen: [], dismissed: ['ok'], kept: {} });
  });
});
