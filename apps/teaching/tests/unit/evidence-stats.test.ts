import { describe, expect, it } from 'vitest';
import { cronbachAlpha, itemStats, quantile, questionFacility, summary } from '@/evidence/stats';

describe('summary', () => {
  it('mean, median, sample sd, quartiles (linear interpolation)', () => {
    const s = summary([0.8, 0.2, 0.6, 0.4])!;
    expect(s.n).toBe(4);
    expect(s.mean).toBeCloseTo(0.5, 6);
    expect(s.median).toBeCloseTo(0.5, 6);
    expect(s.sd).toBeCloseTo(0.258199, 5);
    expect(s.q1).toBeCloseTo(0.35, 6);
    expect(s.q3).toBeCloseTo(0.65, 6);
    expect(s.min).toBe(0.2);
    expect(s.max).toBe(0.8);
  });
  it('is null when empty; sd 0 for one value', () => {
    expect(summary([])).toBeNull();
    expect(summary([0.7])!.sd).toBe(0);
  });
  it('quantile at the ends', () => {
    expect(quantile([1, 2, 3], 0)).toBe(1);
    expect(quantile([1, 2, 3], 1)).toBe(3);
  });
});

const m = [
  [1, 1, 1],
  [1, 1, 0],
  [1, 0, 0],
  [0, 0, 0]
];

describe('reliability and items', () => {
  it("Cronbach's alpha (KR-20 for right/wrong)", () => {
    expect(cronbachAlpha(m)).toBeCloseTo(0.75, 6);
  });
  it('alpha is null with under 2 items or 2 students, or no spread', () => {
    expect(cronbachAlpha([[1], [0]])).toBeNull();
    expect(cronbachAlpha([[1, 1]])).toBeNull();
    expect(cronbachAlpha([[1, 1], [1, 1]])).toBeNull();
  });
  it('facility and corrected item–total discrimination', () => {
    const stats = itemStats(m, [1, 1, 1]);
    expect(stats[0]!.facility).toBeCloseTo(0.75, 6);
    expect(stats[0]!.discrimination).toBeCloseTo(0.5222, 3);
    expect(stats[2]!.facility).toBeCloseTo(0.25, 6);
  });
  it('discrimination is null when an item has no spread', () => {
    expect(itemStats([[1, 0], [1, 1]], [1, 1])[0]!.discrimination).toBeNull();
  });
  it('question facility uses each question\'s own marked answers, null when none', () => {
    expect(questionFacility([[1, null], [0, null], [2, 1]], [2, 1])).toEqual([0.5, 1]);
    expect(questionFacility([[null], [null]], [1])).toEqual([null]);
  });
});
