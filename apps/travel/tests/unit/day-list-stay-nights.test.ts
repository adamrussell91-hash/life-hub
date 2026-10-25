import { describe, expect, it } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { StayItem, Trip } from '@/types';
import { daysForCity, itemsForCityDay, orderDayItems, stayNightOf } from '@/model/day';
import { renderDayList } from '@/views/day-list';

const trip = fixtureTrip as unknown as Trip;

const fiveNights: StayItem = {
  id: 'itm_five',
  kind: 'stay',
  city_id: 'lis',
  date: '2027-03-01',
  time: '15:00',
  title: 'Test Five Night Hotel',
  note: '',
  status: 'booked',
  nights: 5,
  check_out_date: '2027-03-06',
  home_base: true,
  cost: { amount: 900, currency: 'AUD', aud: 900, rate: 1, rate_date: '2026-09-27' },
  place: { name: 'Test Five Night Hotel', lat: 38.71, lon: -9.13 },
  created_at: '',
  updated_at: ''
};

const withStay: Trip = { ...trip, items: [fiveNights] };

describe('multi-night stays', () => {
  it('lists the stay on every night from check-in to the night before check-out', () => {
    const nights = ['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05'];
    for (const night of nights) {
      expect(itemsForCityDay(withStay, 'lis', night).map((i) => i.id)).toEqual(['itm_five']);
    }
    expect(itemsForCityDay(withStay, 'lis', '2027-03-06')).toEqual([]);
    expect(itemsForCityDay(withStay, 'lis', '2027-02-28')).toEqual([]);
  });

  it('keeps one booking record (no copies in trip.items)', () => {
    expect(withStay.items.filter((i) => i.kind === 'stay')).toHaveLength(1);
  });

  it('opens a day for every covered night', () => {
    const days = daysForCity(withStay, 'lis');
    for (const night of ['2027-03-01', '2027-03-02', '2027-03-05']) expect(days).toContain(night);
  });

  it('numbers the nights', () => {
    expect(stayNightOf(fiveNights, '2027-03-01')).toEqual({ night: 1, total: 5 });
    expect(stayNightOf(fiveNights, '2027-03-05')).toEqual({ night: 5, total: 5 });
    expect(stayNightOf(fiveNights, '2027-03-06')).toBeNull();
  });

  it('sorts a continuing stay to the top of the day', () => {
    const lunch = { ...trip.items.find((i) => i.kind === 'food')!, city_id: 'lis', date: '2027-03-02', time: '12:00' };
    const both: Trip = { ...trip, items: [lunch, fiveNights] };
    const ordered = orderDayItems(itemsForCityDay(both, 'lis', '2027-03-02'), '2027-03-02');
    expect(ordered.map((i) => i.id)).toEqual(['itm_five', lunch.id]);
  });

  it('renders Night N of 5 on each night, with the price only on check-in night', () => {
    const first = document.createElement('div');
    renderDayList(first, withStay, 'lis', '2027-03-01', {});
    expect(first.textContent).toContain('Test Five Night Hotel');
    expect(first.textContent).toContain('15:00');
    expect(first.textContent).toContain('Night 1 of 5');
    expect(first.querySelector('.price')).not.toBeNull();

    const third = document.createElement('div');
    renderDayList(third, withStay, 'lis', '2027-03-03', {});
    expect(third.textContent).toContain('Test Five Night Hotel');
    expect(third.textContent).toContain('Night 3 of 5');
    expect(third.textContent).not.toContain('15:00');
    expect(third.textContent).not.toContain('Nothing planned yet');
    expect(third.querySelector('.price')).toBeNull();
  });

  it('does not label a one-night stay', () => {
    const one: Trip = { ...trip, items: [{ ...fiveNights, nights: 1, check_out_date: '2027-03-02' }] };
    const host = document.createElement('div');
    renderDayList(host, one, 'lis', '2027-03-01', {});
    expect(host.textContent).not.toContain('Night 1 of 1');
  });
});

describe('multi-night stays and Mark safe', () => {
  it('offers Mark safe on check-in night only', () => {
    const first = document.createElement('div');
    renderDayList(first, { ...withStay, checkins: [] }, 'lis', '2027-03-01', { onMarkSafe: () => {} });
    expect(first.textContent).toContain('Mark safe');
    const later = document.createElement('div');
    renderDayList(later, { ...withStay, checkins: [] }, 'lis', '2027-03-02', { onMarkSafe: () => {} });
    expect(later.textContent).not.toContain('Mark safe');
  });
});
