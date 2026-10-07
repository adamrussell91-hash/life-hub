import { describe, expect, it } from 'vitest';
import fixtureTrip from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';
import { renderDayList } from '@/views/day-list';

const trip = fixtureTrip as unknown as Trip;

describe('renderDayList overnight tickets', () => {
  it('shows full calendar dates and a 1 – 2 Dec overnight span', () => {
    const withNight: Trip = {
      ...trip,
      items: [
        {
          id: 'itm_night',
          kind: 'flight',
          city_id: 'lis',
          date: '2027-03-03',
          time: '22:15',
          title: 'Overnight inbound',
          note: '',
          status: 'booked',
          carrier: 'Test Air',
          number: 'TA9',
          from_code: 'SYD',
          to_code: 'LIS',
          depart_time: '22:15',
          arrive_time: '04:10',
          arrive_date: '2027-03-04',
          arrive_city_id: 'lis',
          created_at: '',
          updated_at: ''
        }
      ]
    };
    const host = document.createElement('div');
    renderDayList(host, withNight, 'lis', '2027-03-03', {});
    expect(host.textContent).toContain('Wed 3 Mar 22:15');
    expect(host.textContent).toContain('Thu 4 Mar 04:10');
    expect(host.textContent).toContain('3 – 4 Mar · overnight');

    const land = document.createElement('div');
    renderDayList(land, withNight, 'lis', '2027-03-04', {});
    expect(land.textContent).toContain('3 – 4 Mar · overnight');
    expect(land.querySelector('.ticket')).not.toBeNull();
  });
});
