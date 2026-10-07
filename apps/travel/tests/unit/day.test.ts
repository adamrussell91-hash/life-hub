import { describe, expect, it } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Item, PlaceItem, TicketItem, Trip } from '@/types';
import {
  daysForCity,
  haversineKm,
  homeBaseForNight,
  hopFallback,
  isOvernightTicket,
  itemsForCityDay,
  numberStops,
  orderDayItems,
  otherCitiesSharingDate,
  showArrivalGuide,
  travelDayCue
} from '@/model/day';

const trip = fixtureTrip as unknown as Trip;

function overnightFlight(
  partial: Partial<TicketItem> & Pick<TicketItem, 'id' | 'city_id' | 'date' | 'arrive_date'>
): TicketItem {
  return {
    kind: 'flight',
    time: '22:15',
    title: 'Overnight test',
    note: '',
    status: 'booked',
    carrier: 'Test Air',
    number: 'TA999',
    from_code: 'AAA',
    to_code: 'BBB',
    depart_time: '22:15',
    arrive_time: '04:10',
    arrive_city_id: partial.arrive_city_id ?? partial.city_id,
    created_at: '',
    updated_at: '',
    ...partial
  };
}

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

describe('travelDayCue (§3 travel days)', () => {
  it('marks the shared Lisbon→Porto day with an outbound cue from Lisbon', () => {
    expect(travelDayCue(trip, 'lis', '2027-03-05')).toBe('→ Porto');
    expect(travelDayCue(trip, 'opo', '2027-03-05')).toBe('← Lisbon');
    expect(otherCitiesSharingDate(trip, 'lis', '2027-03-05').map((c) => c.id)).toEqual(['opo']);
  });

  it('returns null on ordinary single-city days', () => {
    expect(travelDayCue(trip, 'opo', '2027-03-06')).toBeNull();
  });

  it('marks the fixture overnight inbound on leave and land days', () => {
    expect(travelDayCue(trip, 'lis', '2027-03-03')).toBe('Overnight');
    expect(travelDayCue(trip, 'lis', '2027-03-04')).toBe('Overnight');
  });

  it('marks same-city overnight leave and land days', () => {
    const withNight: Trip = {
      ...trip,
      items: [
        ...trip.items,
        overnightFlight({
          id: 'itm_night_same',
          city_id: 'lis',
          date: '2027-03-03',
          arrive_date: '2027-03-04',
          arrive_city_id: 'lis'
        })
      ]
    };
    expect(travelDayCue(withNight, 'lis', '2027-03-03')).toBe('Overnight');
    expect(travelDayCue(withNight, 'lis', '2027-03-04')).toBe('Overnight');
  });

  it('marks cross-city overnight leave and land when cities do not share a date', () => {
    const withNight: Trip = {
      ...trip,
      cities: trip.cities.map((c) =>
        c.id === 'lis'
          ? { ...c, end_date: '2027-03-04' }
          : c.id === 'opo'
            ? { ...c, start_date: '2027-03-05' }
            : c
      ),
      items: [
        overnightFlight({
          id: 'itm_night_cross',
          city_id: 'lis',
          date: '2027-03-04',
          arrive_date: '2027-03-05',
          arrive_city_id: 'opo',
          from_code: 'LIS',
          to_code: 'OPO'
        })
      ]
    };
    expect(travelDayCue(withNight, 'lis', '2027-03-04')).toBe('→ Porto · overnight');
    expect(travelDayCue(withNight, 'opo', '2027-03-05')).toBe('← Lisbon · overnight');
  });
});

describe('overnight tickets on both days', () => {
  it('detects overnight when arrive_date differs', () => {
    expect(
      isOvernightTicket(
        overnightFlight({
          id: 'n',
          city_id: 'lis',
          date: '2027-03-03',
          arrive_date: '2027-03-04'
        })
      )
    ).toBe(true);
    expect(isOvernightTicket(trip.items.find((i) => i.id === 'itm_testflight01')!)).toBe(true);
    expect(isOvernightTicket(trip.items.find((i) => i.id === 'itm_testtrain01')!)).toBe(false);
  });

  it('lists an overnight ticket on the depart day and again on the land day', () => {
    const withNight: Trip = {
      ...trip,
      items: [
        ...trip.items,
        overnightFlight({
          id: 'itm_night_same',
          city_id: 'lis',
          date: '2027-03-03',
          arrive_date: '2027-03-04',
          arrive_city_id: 'lis'
        })
      ]
    };
    expect(itemsForCityDay(withNight, 'lis', '2027-03-03').map((i) => i.id)).toContain('itm_night_same');
    expect(itemsForCityDay(withNight, 'lis', '2027-03-04').map((i) => i.id)).toContain('itm_night_same');
  });

  it('opens the land city day for a cross-city overnight arrival', () => {
    const withNight: Trip = {
      ...trip,
      cities: trip.cities.map((c) =>
        c.id === 'opo' ? { ...c, start_date: '2027-03-06' } : c
      ),
      items: [
        overnightFlight({
          id: 'itm_night_cross',
          city_id: 'lis',
          date: '2027-03-05',
          arrive_date: '2027-03-06',
          arrive_city_id: 'opo'
        })
      ]
    };
    expect(daysForCity(withNight, 'opo')).toContain('2027-03-06');
    expect(itemsForCityDay(withNight, 'opo', '2027-03-06').map((i) => i.id)).toEqual(['itm_night_cross']);
  });

  it('sorts an overnight landing by arrive_time on the land day', () => {
    const night = overnightFlight({
      id: 'itm_night_land',
      city_id: 'lis',
      date: '2027-03-03',
      arrive_date: '2027-03-04',
      arrive_city_id: 'lis',
      arrive_time: '04:10'
    });
    const later: Item = {
      id: 'itm_later',
      kind: 'do',
      city_id: 'lis',
      date: '2027-03-04',
      time: '09:00',
      title: 'Later',
      note: '',
      status: 'planned',
      place: { name: 'X', lat: 1, lon: 1 },
      created_at: '',
      updated_at: ''
    };
    expect(orderDayItems([later, night], '2027-03-04').map((i) => i.id)).toEqual([
      'itm_night_land',
      'itm_later'
    ]);
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

  it('map and list share the same numbers when trip.items order differs from time order', () => {
    const day = trip.items.filter((item) => item.city_id === 'lis' && item.date === '2027-03-04');
    // Reverse insertion order so unordered numbering would flip 1 and 2.
    const shuffled = [...day].reverse();
    const listNumbers = numberStops(orderDayItems(day));
    const mapNumbers = numberStops(orderDayItems(shuffled));
    expect(mapNumbers.get('itm_testtodo01')).toBe(listNumbers.get('itm_testtodo01'));
    expect(mapNumbers.get('itm_testfood01')).toBe(listNumbers.get('itm_testfood01'));
    expect(mapNumbers.get('itm_testtodo01')).toBe(1);
    expect(mapNumbers.get('itm_testfood01')).toBe(2);
    // Guard: numbering without orderDayItems disagrees with the list.
    const buggy = numberStops(shuffled);
    expect(buggy.get('itm_testfood01')).toBe(1);
    expect(buggy.get('itm_testtodo01')).toBe(2);
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

  it('numbers post (post home) stops like other place-bearing kinds', () => {
    const items: Item[] = [
      {
        id: 'a',
        kind: 'post',
        city_id: 'x',
        date: '2027-01-01',
        time: '10:00',
        title: 'Post parcels home',
        note: '',
        status: 'planned',
        place: { name: 'Post office', lat: 38.7, lon: -9.14 },
        created_at: '',
        updated_at: ''
      },
      {
        id: 'b',
        kind: 'do',
        city_id: 'x',
        date: '2027-01-01',
        time: '11:00',
        title: 'Museum',
        note: '',
        status: 'planned',
        place: { name: 'Museum', lat: 38.71, lon: -9.13 },
        created_at: '',
        updated_at: ''
      }
    ];
    const numbers = numberStops(orderDayItems(items));
    expect(numbers.get('a')).toBe(1);
    expect(numbers.get('b')).toBe(2);
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
    expect(showArrivalGuide(trip, 'opo', '2027-03-06')).toBe(false);
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
