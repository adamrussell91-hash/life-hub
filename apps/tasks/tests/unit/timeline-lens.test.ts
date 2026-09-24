import { describe, expect, it } from 'vitest';
import type { SchoolTerm } from '@/domain/school-time';
import { addDaysKey } from '@/domain/school-time';
import { buildLensScale, clampLensStart, LENS_FOCUS_PX, LENS_OUTER_PX, LENS_SHOULDER_PX } from '@/domain/timeline-lens';

const TERMS: SchoolTerm[] = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

const scale = buildLensScale({
  start: '2026-07-20',
  end: '2027-01-31',
  terms: TERMS,
  lensStart: '2026-09-21',
  holidayFactor: 0.25
});

describe('focus lens scale', () => {
  it('round-trips every day and stays continuous', () => {
    for (let index = 0; index < scale.days.length; index += 1) {
      const day = scale.days[index]!;
      expect(scale.dateAt(day.x + day.w * 0.25)).toBe(day.key);
      const next = scale.days[index + 1];
      if (next) expect(day.x + day.w).toBeCloseTo(next.x, 5);
    }
    expect(scale.x('2026-09-22')).toBeGreaterThan(scale.x('2026-09-21'));
  });

  it('holds the focus fortnight at day width, including holidays', () => {
    const focus = scale.days.filter((day) => day.key >= '2026-09-21' && day.key < '2026-10-05');
    expect(focus).toHaveLength(14);
    expect(focus.every((day) => day.w === LENS_FOCUS_PX)).toBe(true);
    expect(scale.days.find((day) => day.key === '2026-09-26')!.holiday).toBe(true);
  });

  it('uses week width on the shoulders and term width outside, and compresses holidays there', () => {
    expect(scale.days.find((day) => day.key === '2026-09-01')!.w).toBe(LENS_SHOULDER_PX);
    expect(scale.days.find((day) => day.key === '2026-10-05')!.w).toBeCloseTo(LENS_SHOULDER_PX * 0.25, 5);
    expect(scale.days.find((day) => day.key === '2026-07-21')!.w).toBe(LENS_OUTER_PX);
  });

  it('clamps the window inside the range', () => {
    expect(clampLensStart('2026-01-01', '2026-07-20', '2027-01-31')).toBe('2026-07-20');
    expect(clampLensStart('2027-01-30', '2026-07-20', '2027-01-31')).toBe(addDaysKey('2027-01-31', -13));
    expect(clampLensStart('2026-09-21', '2026-07-20', '2027-01-31')).toBe('2026-09-21');
  });
});
