import { describe, expect, it } from 'vitest';
import { formatInZone, zonedToInstant, dateInZone } from '@/lib/time';

describe('zonedToInstant + formatInZone (§2.8)', () => {
  it('2026-12-04 08:30 Europe/Istanbul shows as 16:30 the same day in Sydney', () => {
    const instant = zonedToInstant('2026-12-04', '08:30', 'Europe/Istanbul');
    expect(formatInZone(instant, 'Australia/Sydney')).toBe('16:30');
    expect(dateInZone(instant, 'Australia/Sydney')).toBe('2026-12-04');
  });

  it('2026-12-09 20:00 Europe/London shows as 07:00 next day in Sydney', () => {
    const instant = zonedToInstant('2026-12-09', '20:00', 'Europe/London');
    expect(formatInZone(instant, 'Australia/Sydney')).toBe('07:00');
    expect(dateInZone(instant, 'Australia/Sydney')).toBe('2026-12-10');
  });

  it('2026-12-02 18:00 Asia/Kuala_Lumpur shows as 21:00 in Sydney', () => {
    const instant = zonedToInstant('2026-12-02', '18:00', 'Asia/Kuala_Lumpur');
    expect(formatInZone(instant, 'Australia/Sydney')).toBe('21:00');
  });

  it('round-trips back to the original wall-clock time in the source zone', () => {
    const instant = zonedToInstant('2026-12-04', '08:30', 'Europe/Istanbul');
    expect(formatInZone(instant, 'Europe/Istanbul')).toBe('08:30');
  });
});
