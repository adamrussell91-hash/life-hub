import { describe, expect, it } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Checkin, Item, Trip } from '@/types';
import {
  addressFromParts,
  fallbackAddress,
  listPostcards,
  placeLine,
  postcardFacts,
  postcardForItem,
  tidyAddress
} from '@/postcard/model';

const trip = fixtureTrip as unknown as Trip;
const STOP = 'itm_testtodo01';
const FOOD = 'itm_testfood01';

const tick = (extra: Partial<Checkin> = {}): Checkin => ({
  id: 'chk_a',
  at: '2027-03-04T11:00:00.000Z',
  city_id: 'lis',
  label: 'Safe',
  item_id: STOP,
  ...extra
});
const card = (extra = {}): NonNullable<Checkin['postcard']> => ({
  photo_id: 'tph_p1',
  orientation: 'landscape',
  address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
  posted_at: '2027-03-04T11:30:00.000Z',
  ...extra
});
const withCheckins = (checkins: Checkin[]): Trip => ({ ...trip, checkins });

describe('listPostcards', () => {
  it('reads a postcard off the check-in that carries it, even under a later plain tick', () => {
    const cards = listPostcards(
      withCheckins([
        tick({ photo_id: 'tph_p1', postcard: card({ audio_id: 'tau_a1', audio_s: 21, text: 'All good here.' }) }),
        tick({ id: 'chk_b', at: '2027-03-04T13:00:00.000Z' })
      ])
    );
    expect(cards).toEqual([
      {
        id: 'chk_a',
        itemId: STOP,
        cityId: 'lis',
        title: 'Book Belém tram tickets',
        at: '2027-03-04T11:30:00.000Z',
        photoId: 'tph_p1',
        orientation: 'landscape',
        address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
        audioId: 'tau_a1',
        audioS: 21,
        text: 'All good here.'
      }
    ]);
    expect(postcardForItem(cards, STOP)?.id).toBe('chk_a');
    expect(postcardForItem(cards, FOOD)).toBeNull();
  });

  it('reads a photo from before postcards as a card with the stop as its address', () => {
    const [old] = listPostcards(withCheckins([tick({ photo_id: 'tph_old1' })]));
    expect(old).toMatchObject({ id: 'chk_a', at: '2027-03-04T11:00:00.000Z', photoId: 'tph_old1' });
    expect(old!.orientation).toBeUndefined();
    expect(old!.address).toEqual(['Belém Tower', 'Lisbon', 'Portugal']);
  });

  it('reads the public trip, where the stop carries the postcard and there are no check-ins', () => {
    const publicTrip = {
      ...trip,
      checkins: undefined,
      items: trip.items.map((item) =>
        item.id === STOP
          ? { ...item, safe_at: '2027-03-04T13:00:00.000Z', postcard: { id: 'chk_a', at: '2027-03-04T11:30:00.000Z', photo_id: 'tph_p1', orientation: 'portrait', address: ['Rua do Exemplo'] } }
          : item.id === FOOD
            ? { ...item, safe_at: '2027-03-04T12:00:00.000Z', safe_photo_id: 'tph_old1' }
            : item
      )
    } as unknown as Trip;
    const cards = listPostcards(publicTrip);
    expect(cards.map((c) => [c.id, c.photoId])).toEqual([
      ['chk_a', 'tph_p1'],
      // An API that does not send postcards yet: the photo still gets its card.
      [`safe_${FOOD}`, 'tph_old1']
    ]);
  });

  it('orders by when they were posted, then by id', () => {
    const cards = listPostcards(
      withCheckins([
        tick({ id: 'chk_z', item_id: FOOD, photo_id: 'tph_2', postcard: card({ photo_id: 'tph_2', posted_at: '2027-03-04T09:00:00.000Z' }) }),
        tick({ id: 'chk_b', photo_id: 'tph_1', postcard: card({ photo_id: 'tph_1', posted_at: '2027-03-04T12:00:00.000Z' }) }),
        tick({ id: 'chk_a', item_id: 'itm_teststay01', photo_id: 'tph_3', postcard: card({ photo_id: 'tph_3', posted_at: '2027-03-04T12:00:00.000Z' }) })
      ])
    );
    expect(cards.map((c) => c.id)).toEqual(['chk_z', 'chk_a', 'chk_b']);
  });
});

describe('postcardFacts', () => {
  it('uses the city\'s clock for the postmark and counts days from the trip\'s start', () => {
    // 23:30 in Lisbon on 4 March is still 4 March there, and the trip started on the 3rd.
    const [late] = listPostcards(withCheckins([tick({ photo_id: 'tph_p1', postcard: card({ posted_at: '2027-03-04T23:30:00.000Z' }) })]));
    const facts = postcardFacts(trip, late!);
    expect(facts).toMatchObject({
      cityName: 'Lisbon',
      country: 'Portugal',
      dayNumber: 2,
      postmarkDate: '4 MAR',
      postmarkYear: '2027',
      localTime: '23:30',
      caption: 'Thu 4 Mar, 23:30'
    });
  });

  it('puts a late-evening post in a city ahead of UTC on the next local day', () => {
    const tokyo = { ...trip, cities: trip.cities.map((c) => (c.id === 'lis' ? { ...c, tz: 'Asia/Tokyo' } : c)) };
    const [late] = listPostcards({ ...tokyo, checkins: [tick({ photo_id: 'tph_p1', postcard: card({ posted_at: '2027-03-04T23:30:00.000Z' }) })] });
    const facts = postcardFacts(tokyo, late!);
    expect(facts.postmarkDate).toBe('5 MAR');
    expect(facts.localTime).toBe('08:30');
    expect(facts.dayNumber).toBe(3);
  });

  it('never counts below day 1 and survives a bad date or zone', () => {
    const odd = { ...trip, cities: trip.cities.map((c) => ({ ...c, tz: 'Not/AZone' })) };
    const [early] = listPostcards({ ...odd, checkins: [tick({ photo_id: 'tph_p1', postcard: card({ posted_at: 'not a date' }) })] });
    expect(postcardFacts(odd, early!).dayNumber).toBe(1);
  });
});

describe('addresses', () => {
  it('builds lines from the parts of an address, leaving out blanks', () => {
    expect(addressFromParts({ street: 'Rua do Exemplo', district: 'Alfama', postcode: '1100-000', city: 'Lisboa', country: 'Portugal' })).toEqual([
      'Rua do Exemplo',
      'Alfama',
      '1100-000 Lisboa',
      'Portugal'
    ]);
    expect(addressFromParts({ city: 'Porto' })).toEqual(['Porto']);
    expect(addressFromParts(null)).toEqual([]);
  });

  it('tidies lines: trimmed, cut to 60 characters, repeats dropped, four at most', () => {
    expect(tidyAddress(['  Rua   do Exemplo ', '', 'rua do exemplo', 'x'.repeat(70), 'b', 'c', 'd'])).toEqual([
      'Rua do Exemplo',
      'x'.repeat(60),
      'b',
      'c'
    ]);
  });

  it('falls back to the stop, its city and country', () => {
    const stop = trip.items.find((i) => i.id === STOP) as Item;
    expect(fallbackAddress(trip, stop)).toEqual(['Belém Tower', 'Lisbon', 'Portugal']);
    const noPlace = trip.items.find((i) => i.id === 'itm_testnoplace01') as Item;
    expect(fallbackAddress(trip, noPlace)).toEqual(['Write postcards', 'Porto', 'Portugal']);
  });

  it('names a card by its first address line and its city', () => {
    const [one] = listPostcards(withCheckins([tick({ photo_id: 'tph_p1', postcard: card() })]));
    expect(placeLine(trip, one!)).toBe('Rua do Exemplo, Lisbon');
    expect(placeLine(trip, { ...one!, address: ['Lisbon', 'Portugal'] })).toBe('Lisbon');
  });
});
