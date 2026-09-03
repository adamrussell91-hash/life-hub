import { describe, it, expect } from 'vitest';
import { unitDateSpan, unitDateProgress } from '@/schedule/unit-progress';

const scheduled = [
  { unit_id: 'u1', date: '2026-08-10' },
  { unit_id: 'u1', date: '2026-08-14' },
  { unit_id: 'u2', date: '2026-09-01' }
] as never;

describe('unitDateSpan', () => {
  it('prefers explicit unit dates', () => {
    const span = unitDateSpan(
      { id: 'u1', start_date: '2026-08-03', end_date: '2026-09-11' } as never, scheduled);
    expect(span).toEqual({ start: '2026-08-03', end: '2026-09-11', source: 'unit' });
  });

  it('falls back to min/max of that unit\'s scheduled lessons', () => {
    const span = unitDateSpan({ id: 'u1' } as never, scheduled);
    expect(span).toEqual({ start: '2026-08-10', end: '2026-08-14', source: 'scheduled' });
  });

  it('returns null when there is nothing to go on', () => {
    expect(unitDateSpan({ id: 'u9' } as never, scheduled)).toBeNull();
  });

  it('ignores an end_date that precedes start_date', () => {
    const span = unitDateSpan(
      { id: 'u1', start_date: '2026-09-01', end_date: '2026-08-01' } as never, scheduled);
    expect(span?.source).toBe('scheduled');
  });
});

describe('unitDateProgress', () => {
  const span = { start: '2026-08-03', end: '2026-08-31', source: 'unit' as const };

  it('clamps before, during and after', () => {
    expect(unitDateProgress(span, '2026-07-01').ratio).toBe(0);
    expect(unitDateProgress(span, '2026-12-01').ratio).toBe(1);
    expect(unitDateProgress(span, '2026-08-17').ratio).toBeCloseTo(0.5, 1);
  });

  it('reports whole days remaining, never negative', () => {
    expect(unitDateProgress(span, '2026-08-24').daysRemaining).toBe(7);
    expect(unitDateProgress(span, '2026-09-30').daysRemaining).toBe(0);
  });

  it('treats a single-day unit as complete on the day', () => {
    const one = { start: '2026-08-10', end: '2026-08-10', source: 'unit' as const };
    expect(unitDateProgress(one, '2026-08-10').ratio).toBe(1);
  });
});
