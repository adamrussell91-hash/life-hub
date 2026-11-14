import { describe, expect, it } from 'vitest';
import { distanceKm, formatApart, formatLater, stitchLabel } from '@/lib/distance';

describe('distance', () => {
  it('measures the straight line between two points', () => {
    const km = distanceKm({ lat: 38.7223, lon: -9.1393 }, { lat: 41.1579, lon: -8.6291 });
    expect(km).toBeGreaterThan(270);
    expect(km).toBeLessThan(280);
    expect(distanceKm({ lat: 10, lon: 10 }, { lat: 10, lon: 10 })).toBe(0);
  });

  it('words a distance without made-up precision', () => {
    expect(formatApart(0.04)).toBe('40 m');
    expect(formatApart(0.444)).toBe('440 m');
    expect(formatApart(1.26)).toBe('1.3 km');
    expect(formatApart(9.96)).toBe('10 km');
    expect(formatApart(12.4)).toBe('12 km');
    expect(formatApart(0.004)).toBe('');
  });

  it('words the time between two moments on the same day', () => {
    expect(formatLater('09:40', '11:15')).toBe('1 h 35 min later');
    expect(formatLater('11:15', '11:50')).toBe('35 min later');
    expect(formatLater('11:00', '13:00')).toBe('2 h later');
    expect(formatLater('11:15', '09:40')).toBe('');
    expect(formatLater('11:15', '11:15')).toBe('');
    expect(formatLater(undefined, '09:40')).toBe('');
  });

  it('joins distance and time, or uses whichever it has', () => {
    const a = { coordinates: { lat: 38.7075, lon: -9.1364 }, local_time: '09:40' };
    const b = { coordinates: { lat: 38.7105, lon: -9.1466 }, local_time: '11:15' };
    expect(stitchLabel(a, b)).toBe('950 m away · 1 h 35 min later');
    expect(stitchLabel({ local_time: '09:40' }, { local_time: '11:15' })).toBe('1 h 35 min later');
    expect(stitchLabel({ coordinates: a.coordinates }, { coordinates: b.coordinates })).toBe('950 m away');
    expect(stitchLabel({}, {})).toBe('');
  });

  it('never says how far anyone walked', () => {
    const a = { coordinates: { lat: 38.7075, lon: -9.1364 }, local_time: '09:40' };
    const b = { coordinates: { lat: 38.7105, lon: -9.1466 }, local_time: '11:15' };
    expect(stitchLabel(a, b)).not.toMatch(/walk|on foot/i);
  });
});
