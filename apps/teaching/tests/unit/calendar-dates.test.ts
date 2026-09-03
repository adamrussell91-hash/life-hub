import { describe, it, expect } from 'vitest';
import {
  isCalendarDate, addCalendarDays, weekStartMonday, enumerateDateKeys, daysBetween
} from '@/schedule/calendar-dates';

describe('calendar-dates', () => {
  it('validates real dates only', () => {
    expect(isCalendarDate('2026-08-12')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2024-02-29')).toBe(true);   // leap
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('12/08/2026')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('snaps to Monday', () => {
    expect(weekStartMonday('2026-08-12')).toBe('2026-08-10'); // Wed -> Mon
    expect(weekStartMonday('2026-08-10')).toBe('2026-08-10'); // Mon -> itself
    expect(weekStartMonday('2026-08-16')).toBe('2026-08-10'); // Sun -> prior Mon
  });

  it('enumerates inclusive ranges', () => {
    expect(enumerateDateKeys('2026-08-10', '2026-08-12'))
      .toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('counts days between', () => {
    expect(daysBetween('2026-08-10', '2026-08-12')).toBe(2);
    expect(daysBetween('2026-08-12', '2026-08-10')).toBe(-2);
  });
});
