import { describe, expect, it } from 'vitest';
import {
  clock12,
  coverEyebrow,
  dayNumber,
  longDate,
  shortDateRange,
  tripLength,
  tripPhase,
} from '@/journal/trip-days';

describe('trip days', () => {
  it('numbers days from the first day of the trip', () => {
    expect(dayNumber('2027-03-03', '2027-03-03')).toBe(1);
    expect(dayNumber('2027-03-03', '2027-03-05')).toBe(3);
    expect(dayNumber('2026-12-30', '2027-01-02')).toBe(4);
  });

  it('returns 0 for a date before the trip or a malformed date', () => {
    expect(dayNumber('2027-03-03', '2027-03-02')).toBe(0);
    expect(dayNumber('2027-03-03', 'soon')).toBe(0);
  });

  it('counts the length of a trip inclusively', () => {
    expect(tripLength('2027-03-03', '2027-03-07')).toBe(5);
    expect(tripLength('2027-03-03', '2027-03-03')).toBe(1);
  });

  it('knows whether the trip is ahead, under way or over', () => {
    expect(tripPhase('2027-03-03', '2027-03-07', '2027-02-19')).toEqual({ kind: 'before', daysUntil: 12 });
    expect(tripPhase('2027-03-03', '2027-03-07', '2027-03-03')).toEqual({ kind: 'during', day: 1, of: 5 });
    expect(tripPhase('2027-03-03', '2027-03-07', '2027-03-07')).toEqual({ kind: 'during', day: 5, of: 5 });
    expect(tripPhase('2027-03-03', '2027-03-07', '2027-03-08')).toEqual({ kind: 'after' });
  });

  it('words the cover eyebrow for each phase', () => {
    expect(coverEyebrow({ kind: 'during', day: 4, of: 5 })).toBe('Journal · Day 4 of 5');
    expect(coverEyebrow({ kind: 'before', daysUntil: 12 })).toBe('Journal · starts in 12 days');
    expect(coverEyebrow({ kind: 'before', daysUntil: 1 })).toBe('Journal · starts tomorrow');
    expect(coverEyebrow({ kind: 'after' })).toBe('Journal');
  });

  it('writes a date out in full', () => {
    expect(longDate('2027-03-05')).toBe('Friday 5 March');
    expect(longDate('2027-01-01')).toBe('Friday 1 January');
    expect(longDate('nope')).toBe('');
  });

  it('writes a date range, repeating the month only when it changes', () => {
    expect(shortDateRange('2027-03-03', '2027-03-05')).toBe('3 – 5 March');
    expect(shortDateRange('2027-02-28', '2027-03-02')).toBe('28 February – 2 March');
    expect(shortDateRange('2027-03-03', '2027-03-03')).toBe('3 March');
  });

  it('shows stored 24 hour times as 12 hour times', () => {
    expect(clock12('09:40')).toBe('9:40 am');
    expect(clock12('00:05')).toBe('12:05 am');
    expect(clock12('12:00')).toBe('12:00 pm');
    expect(clock12('21:50')).toBe('9:50 pm');
    expect(clock12(undefined)).toBe('');
    expect(clock12('9am')).toBe('');
    expect(clock12('25:00')).toBe('');
  });
});
