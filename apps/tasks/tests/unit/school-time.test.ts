import { describe, expect, it } from 'vitest';
import {
  buildTimeScale,
  holidayRuns,
  isHoliday,
  mondayOf,
  termAt,
  termWeek,
  weekLabel,
  type SchoolTerm
} from '@/domain/school-time';

const TERMS: SchoolTerm[] = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

describe('school weeks', () => {
  it('labels weeks from the Monday of the week the term starts', () => {
    expect(weekLabel('2026-07-21', TERMS)).toBe('T3 W1');
    expect(weekLabel('2026-09-22', TERMS)).toBe('T3 W10');
    expect(weekLabel('2026-10-13', TERMS)).toBe('T4 W1');
    expect(weekLabel('2026-10-26', TERMS)).toBe('T4 W3');
    expect(termWeek('2026-10-26', TERMS)).toBe(3);
    expect(weekLabel('2026-12-17', TERMS)).toBe('T4 W10');
  });

  it('finds holidays between and after terms', () => {
    expect(isHoliday('2026-09-28', TERMS)).toBe(true);
    expect(isHoliday('2026-10-12', TERMS)).toBe(true);
    expect(isHoliday('2026-10-13', TERMS)).toBe(false);
    expect(weekLabel('2026-09-28', TERMS)).toBe('Hol W1');
    expect(weekLabel('2026-10-01', TERMS)).toBe('Hol W1');
    expect(weekLabel('2026-10-05', TERMS)).toBe('Hol W2');
    expect(termWeek('2026-10-05', TERMS)).toBeNull();
    expect(termAt('2026-12-20', TERMS)).toBeNull();
  });

  it('never treats days as holidays when no terms are set', () => {
    expect(isHoliday('2026-10-01', [])).toBe(false);
  });

  it('finds Mondays', () => {
    expect(mondayOf('2026-09-22')).toBe('2026-09-21');
    expect(mondayOf('2026-09-27')).toBe('2026-09-21');
    expect(mondayOf('2026-09-21')).toBe('2026-09-21');
  });
});

describe('time scale', () => {
  const scale = buildTimeScale({ start: '2026-09-21', end: '2026-10-18', terms: TERMS, dayWidth: 10 });

  it('compresses holiday days to a quarter width by default', () => {
    const term = scale.days.find((d) => d.key === '2026-09-22')!;
    const hol = scale.days.find((d) => d.key === '2026-10-01')!;
    expect(term.w).toBe(10);
    expect(hol.w).toBe(2.5);
  });

  it('shows holidays at full width when asked', () => {
    const full = buildTimeScale({ start: '2026-09-21', end: '2026-10-18', terms: TERMS, dayWidth: 10, holidayFactor: 1 });
    expect(full.width).toBe(28 * 10);
  });

  it('round-trips date to x to date for every day', () => {
    for (const d of scale.days) expect(scale.dateAt(scale.x(d.key) + 0.01)).toBe(d.key);
  });

  it('is continuous and increasing across the holiday boundary', () => {
    let last = -1;
    for (const d of scale.days) {
      expect(scale.x(d.key)).toBeGreaterThan(last);
      last = scale.x(d.key);
    }
    expect(scale.x('2026-09-26')).toBeCloseTo(scale.x('2026-09-25') + 10, 6);
  });

  it('clamps outside the range', () => {
    expect(scale.x('2026-01-01')).toBe(0);
    expect(scale.x('2027-01-01')).toBe(scale.width);
  });

  it('reports holiday runs for the axis', () => {
    const runs = holidayRuns(scale);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ start: '2026-09-26', end: '2026-10-12' });
    expect(runs[0]!.w).toBeCloseTo(17 * 2.5, 6);
  });
});
