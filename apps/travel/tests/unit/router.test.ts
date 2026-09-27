import { describe, expect, it } from 'vitest';
import { parseRoute, tripRoute, todayRoute, tripsRoute } from '@/app/router';

describe('parseRoute', () => {
  it('defaults an empty or root hash to the trips list', () => {
    expect(parseRoute('')).toEqual({ name: 'trips' });
    expect(parseRoute('#/')).toEqual({ name: 'trips' });
    expect(parseRoute('#')).toEqual({ name: 'trips' });
  });

  it('parses #/today', () => {
    expect(parseRoute('#/today')).toEqual({ name: 'today' });
  });

  it('parses #/trip/:tripId', () => {
    expect(parseRoute('#/trip/trp_abc123')).toEqual({ name: 'trip', tripId: 'trp_abc123' });
  });

  it('parses #/trip/:tripId/:cityId/:date', () => {
    expect(parseRoute('#/trip/trp_abc123/lis/2027-03-04')).toEqual({
      name: 'trip',
      tripId: 'trp_abc123',
      cityId: 'lis',
      date: '2027-03-04'
    });
  });

  it('falls back to the trips list for a malformed trip route', () => {
    expect(parseRoute('#/trip/trp_abc/lis')).toEqual({ name: 'trips' });
    expect(parseRoute('#/trip/trp_abc/lis/not-a-date')).toEqual({ name: 'trips' });
    expect(parseRoute('#/trip')).toEqual({ name: 'trips' });
  });

  it('falls back to the trips list for an unknown hash', () => {
    expect(parseRoute('#/nonsense')).toEqual({ name: 'trips' });
    expect(parseRoute('#/trip/../etc')).toEqual({ name: 'trips' });
  });
});

describe('route helpers', () => {
  it('builds hash strings', () => {
    expect(tripsRoute()).toBe('#/');
    expect(todayRoute()).toBe('#/today');
    expect(tripRoute('trp_1')).toBe('#/trip/trp_1');
    expect(tripRoute('trp_1', 'lis', '2027-03-04')).toBe('#/trip/trp_1/lis/2027-03-04');
  });
});
