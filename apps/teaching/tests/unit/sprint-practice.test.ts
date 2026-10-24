import { describe, expect, it } from 'vitest';
import { nextChange, sydneyEpoch } from '@/sprint/rules';
import { yourMove } from '@/sprint/practice';
import type { SprintSummary } from '@/sprint/api';

const p = (key: 'understand' | 'sketch', where: 'class' | 'home', due_date: string, ends_at = '') => ({ key, where, due_date, due_time: '15:00', ends_at });

describe('nextChange', () => {
  const phases = [p('understand', 'class', '2026-10-26', '2026-10-26T12:30'), p('sketch', 'home', '2026-10-28')];
  it('takes the lesson end first, then the lock, then the close', () => {
    const nine = sydneyEpoch('2026-10-26', '09:00')!;
    expect(nextChange(phases, {}, nine)?.label).toBe('Understand lesson ending (Mon 12:30 pm)');
    const end = sydneyEpoch('2026-10-26', '12:30')!;
    const lock = { until: new Date(end + 2 * 3_600_000).toISOString() };
    expect(nextChange(phases, { ended: { understand: {} }, lock }, end)?.label).toBe('Lock lifting (Mon 2:30 pm)');
    expect(nextChange(phases, { ended: { understand: {} }, lock }, end + 2 * 3_600_000)?.label).toBe('Understand closing (Mon 3:00 pm)');
  });
  it('is null once everything has passed', () => {
    expect(nextChange(phases, {}, sydneyEpoch('2026-10-29', '09:00')!)).toBeNull();
  });
});

describe('yourMove', () => {
  const base = (over: Partial<SprintSummary['groups'][number]> = {}, rest: Partial<SprintSummary> = {}): SprintSummary => ({
    groups: [{ id: 'practice', name: 'Practice group', students: [], open: ['understand'], awaiting: null, chosen: false, question: null, ...over }],
    class_parts: { understand: 'open' }, ended: {}, lock: null, extend: {}, running: null, spotlight: null, ...rest
  });
  const phases = [{ key: 'understand' as const, where: 'class' as const }, { key: 'sketch' as const, where: 'home' as const }];
  const now = Date.parse('2026-10-26T00:00:00Z');
  it('asks for End class part during a class phase', () => {
    expect(yourMove(base(), phases, 2, now).action).toEqual({ label: 'End class part', kind: 'end_class', phase: 'understand' });
  });
  it('asks for a choice when the group waits', () => {
    expect(yourMove(base({ awaiting: { kind: 'idea', tie: true, empty: false } }), phases, 2, now).text).toBe('The vote tied. Choose the group’s idea.');
  });
  it('says the lock is on while it runs', () => {
    expect(yourMove(base({}, { lock: { phase: 'understand', until: '2026-10-26T02:00:00Z', unlocked: [] } }), phases, 2, now).action).toBeUndefined();
  });
  it('has nothing during a home phase', () => {
    expect(yourMove(base({ open: ['understand', 'sketch'] }), phases, 2, now).text).toMatch(/^Nothing waits on you/);
  });
});
