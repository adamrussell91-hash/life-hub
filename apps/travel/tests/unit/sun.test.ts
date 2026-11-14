import { describe, expect, it } from 'vitest';
import { sunsetLocal } from '@/lib/sun';
import { minutesOfDay } from '@/journal/trip-days';

function between(hhmm: string | null, from: string, to: string): boolean {
  const v = minutesOfDay(hhmm ?? undefined);
  return v !== null && v >= minutesOfDay(from)! && v <= minutesOfDay(to)!;
}

describe('sunsetLocal', () => {
  it('gives an early March sunset for a city on the west coast of Europe', () => {
    const sunset = sunsetLocal(38.72, -9.14, '2027-03-03', 'Europe/Lisbon');
    expect(between(sunset, '18:25', '18:37')).toBe(true);
  });

  it('gives a late summer sunset in the southern hemisphere, with daylight saving', () => {
    const sunset = sunsetLocal(-33.87, 151.21, '2027-01-10', 'Australia/Sydney');
    expect(between(sunset, '20:00', '20:15')).toBe(true);
  });

  it('gives a mid-afternoon winter sunset far north', () => {
    const sunset = sunsetLocal(56.82, -5.1, '2026-12-10', 'Europe/London');
    expect(between(sunset, '15:25', '15:50')).toBe(true);
  });

  it('returns null where the sun does not set', () => {
    expect(sunsetLocal(80, 15, '2027-06-21', 'Arctic/Longyearbyen')).toBeNull();
  });

  it('returns null for an unreadable date or zone', () => {
    expect(sunsetLocal(38.72, -9.14, 'soon', 'Europe/Lisbon')).toBeNull();
    expect(sunsetLocal(38.72, -9.14, '2027-03-03', 'Nowhere/Nope')).toBeNull();
  });
});
