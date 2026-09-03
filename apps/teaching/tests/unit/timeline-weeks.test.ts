import { describe, it, expect } from 'vitest';
import {
  clampWeek,
  clampSpan,
  findFirstFreeStart,
  weeksToLabel
} from '@/scope/timeline-weeks';

describe('clampWeek', () => {
  it('clamps below 1 to 1', () => {
    expect(clampWeek(0, 40)).toBe(1);
    expect(clampWeek(-3, 40)).toBe(1);
  });

  it('clamps above weekCount to weekCount', () => {
    expect(clampWeek(41, 40)).toBe(40);
    expect(clampWeek(100, 40)).toBe(40);
  });

  it('rounds fractional weeks', () => {
    expect(clampWeek(5.4, 40)).toBe(5);
    expect(clampWeek(5.6, 40)).toBe(6);
  });

  it('passes through valid weeks unchanged', () => {
    expect(clampWeek(12, 40)).toBe(12);
  });
});

describe('clampSpan', () => {
  it('clamps both ends to week bounds', () => {
    expect(clampSpan(0, 50, 40)).toEqual({ start_week: 1, end_week: 40 });
  });

  it('inverts when end is before start', () => {
    expect(clampSpan(10, 5, 40)).toEqual({ start_week: 10, end_week: 10 });
  });

  it('preserves a valid span', () => {
    expect(clampSpan(12, 18, 40)).toEqual({ start_week: 12, end_week: 18 });
  });
});

describe('findFirstFreeStart', () => {
  it('returns the first week with no overlap', () => {
    const items = [{ start_week: 1, end_week: 4 }];
    expect(findFirstFreeStart(40, 4, items)).toBe(5);
  });

  it('skips gaps too small for the span', () => {
    const items = [
      { start_week: 1, end_week: 4 },
      { start_week: 6, end_week: 10 }
    ];
    expect(findFirstFreeStart(40, 4, items)).toBe(11);
  });

  it('returns 1 when timeline is empty', () => {
    expect(findFirstFreeStart(40, 4, [])).toBe(1);
  });

  it('returns null when no room fits the span', () => {
    const items = [{ start_week: 1, end_week: 40 }];
    expect(findFirstFreeStart(40, 4, items)).toBeNull();
  });
});

describe('weeksToLabel', () => {
  it('formats a single week', () => {
    expect(weeksToLabel(5, 5)).toBe('Week 5');
  });

  it('formats a week range', () => {
    expect(weeksToLabel(12, 18)).toBe('Weeks 12–18');
  });
});
