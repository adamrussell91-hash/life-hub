import { describe, expect, it } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Item, PlaceItem, Trip } from '@/types';
import {
  daysForCity,
  haversineKm,
  homeBaseForNight,
  hopFallback,
  numberStops,
  orderDayItems,
  showArrivalGuide
} from '@/model/day';

const trip = fixtureTrip as unknown as Trip;

describe('daysForCity (§3 rule 1)', () => {
  it('lists every date in the city range, ascending', () => {
    expect(daysForCity(trip, 'lis')).toEqual(['2027-03-03', '2027-03-04', '2027-03-05']);
    expect(daysForCity(trip, 'opo')).toEqual(['2027-03-05', '2027-03-06', '2027-03-07']);
  });

  it('includes a travel day in both the departing and arriving city', () => {
    const lisDays = daysForCity(trip, 'lis');
    const opoDays = daysForCity(trip, 'opo');
    expect(lisDays).toContain('2027-03-05');
    expect(opoDays).toContain('2027-03-05');
  });
});

describe('orderDayItems (§3 rule 2)', () => {
  it('puts time:null first, then ascending time, ties keep insertion order', () => {
    const day = trip.items.filter((item) => item.city_id === 'lis' && item.date === '2027-03-04');
    const ordered = orderDayItems(day);
    expect(ordered.map((item) => item.id)).toEqual(['itm_testtodo01', 'itm_testfood01']);
  });

  it('sorts tickets by depart_time', () => {
    const items: Item[] = [
      {
        id: 'b',
        kind: 'train',
        city_id: 'x',
        date: '2027-01-01',
        time: '10:00',
        title: 'Later train',
        note: '',
        status: 'planned',
        carrier: 'X',
        number: '1',
        from_code: 'AAA',
        to_code: 'BBB',
        depart_time: '10:00',
        arrive_time: '11:00',
        arrive_date: '2027-01-01',
        created_at: '',
        updated_at: ''
      },
      {
        id: 'a',
        kind: 'flight',
        city_id: 'x',
        date: '2027-01-01',
        time: '08:00',
        title: 'Earlier flight',
        note: '',
        status: 'planned',
        carrier: 'X',
        number: '2',
        from_code: 'CCC',
        to_code: 'DDD',
        depart_time: '08:00',
        arrive_time: '09:00',
        arrive_date: '2027-01-01',
        created_at: '',
        updated_at: ''
      }
    ];
    expect(orderDayItems(items).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('numberStops (§3 rule 3)', () => {
  it('numbers only place-bearing, non-stay, non-ticket items, in rendered order', () => {
    const day = trip.items.filter((item) => item.city_id === 'lis' && item.date === '2027-03-04');
    const ordered = orderDayItems(day);
    const numbers = numberStops(ordered);
    expect(numbers.get('itm_testtodo01')).toBe(1);
    expect(numbers.get('itm_testfood01')).toBe(2);
  });

  it('skips stays, tickets and items without a place', () => {
    const day = trip.items.filter((item) => item.city_id === 'lis' && item.date === '2027-03-03');
    const numbers = numberStops(orderDayItems(day));
    expect(numbers.size).toBe(0); // just the flight + the stay that day

    const opoDay3 = trip.items.filter((item) => item.city_id === 'opo' && item.date === '2027-03-06');
    const opoNumbers = numberStops(orderDayItems(opoDay3));
    expect(opoNumbers.has('itm_testnoplace01')).toBe(false); // no place
    expect(opoNumbers.has('itm_testcheckin01')).toBe(false); // checkin slot
  });
});

describe('homeBaseForNight (§3 rule 4)', () => {
  it('finds the home-base stay covering the given night', () => {
    expect(homeBaseForNight(trip, '2027-03-03')?.id).toBe('itm_teststay01');
    expect(homeBaseForNight(trip, '2027-03-04')?.id).toBe('itm_teststay01');
    expect(homeBaseForNight(trip, '2027-03-05')?.id).toBe('itm_teststay02');
    expect(homeBaseForNight(trip, '2027-03-06')?.id).toBe('itm_teststay02');
  });

  it('returns null when no stay covers the night', () => {
    expect(homeBaseForNight(trip, '2027-03-08')).toBeNull();
  });
});

describe('showArrivalGuide (§3 rule 5)', () => {
  it('shows on the city\'s first day', () => {
    expect(showArrivalGuide(trip, 'lis', '2027-03-03')).toBe(true);
  });

  it('shows on a day with a ticket arriving into that city', () => {
    expect(showArrivalGuide(trip, 'opo', '2027-03-05')).toBe(true);
  });

  it('is false on other days', () => {
    expect(showArrivalGuide(trip, 'lis', '2027-03-04')).toBe(false);
  });
});

describe('haversineKm + hopFallback (§3 rule 6)', () => {
  it('computes a plausible short distance', () => {
    const km = haversineKm({ lat: 38.7, lon: -9.14 }, { lat: 38.702, lon: -9.138 });
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(1);
  });

  it('suggests a walk when items are close and neither has an explicit hop', () => {
    const from: Item = {
      id: 'a',
      kind: 'do',
      city_id: 'x',
      date: '2027-01-01',
      time: '09:00',
      title: 'A',
      note: '',
      status: 'planned',
      place: { name: 'A', lat: 38.7, lon: -9.14 },
      created_at: '',
      updated_at: ''
    };
    const to: Item = {
      ...from,
      id: 'b',
      title: 'B',
      place: { name: 'B', lat: 38.702, lon: -9.138 }
    };
    const hop = hopFallback(from, to);
    expect(hop).not.toBeNull();
    expect(hop!.minutes).toBeGreaterThan(0);
  });

  it('returns null beyond the 2.5km threshold', () => {
    const from: Item = {
      id: 'a',
      kind: 'do',
      city_id: 'x',
      date: '2027-01-01',
      time: '09:00',
      title: 'A',
      note: '',
      status: 'planned',
      place: { name: 'A', lat: 38.7, lon: -9.14 },
      created_at: '',
      updated_at: ''
    };
    const to: Item = { ...from, id: 'b', place: { name: 'B', lat: 38.9, lon: -9.4 } };
    expect(hopFallback(from, to)).toBeNull();
  });

  it('returns null when the item already has an explicit hop', () => {
    const from = trip.items.find((i) => i.id === 'itm_testfood01') as PlaceItem;
    const to: Item = { ...from, id: 'nearby', place: { name: 'Nearby', lat: 38.7005, lon: -9.1395 } };
    expect(from.hop).toBeTruthy();
    expect(hopFallback(from, to)).toBeNull();
  });
});
