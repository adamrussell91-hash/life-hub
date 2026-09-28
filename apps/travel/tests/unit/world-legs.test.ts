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
});
