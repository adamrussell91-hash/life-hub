import { describe, expect, it } from 'vitest';
import { tripLegs } from '@/components/world-map';
import fixture from '../../fixtures/test-trip.json';
import type { Trip } from '@/types';

describe('world map legs (D7)', () => {
  it('walks home → cities in order, using tickets filed under their arrival city', () => {
    const legs = tripLegs(fixture as unknown as Trip);
    expect(legs.map((l) => `${l.fromCity.name}→${l.toCity.name}`)).toEqual(['Sydney→Lisbon', 'Lisbon→Porto']);
    expect(legs[0]).toMatchObject({ booked: true, rail: false });
    expect(legs[1]).toMatchObject({ booked: true, rail: true });
    expect(legs[0]!.statusHtml).toContain('SYD → LIS');
  });

  it('names both calendar days on an overnight inbound leg', () => {
    const base = fixture as unknown as Trip;
    const overnight: Trip = {
      ...base,
      items: base.items.map((item) =>
        item.id === 'itm_testflight01'
          ? { ...item, date: '2027-03-02', arrive_date: '2027-03-03', depart_time: '22:15', arrive_time: '04:10' }
          : item
      )
    };
    const leg = tripLegs(overnight)[0]!;
    expect(leg.statusHtml).toContain('Tue 2 Mar – Wed 3 Mar');
    expect(leg.statusHtml).toContain('Overnight.');
  });
});
