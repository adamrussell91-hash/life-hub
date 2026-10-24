// apps/teaching/tests/unit/sprint-rules.test.ts
import { describe, it, expect } from 'vitest';
import { sydneyEpoch, phaseDue, openPhases, lockState, isLate, tally, heatLevels, type GroupFacts } from '@/sprint/rules';

const at = (iso: string) => new Date(iso).getTime();
const phases = [
  { key: 'understand', due_date: '2026-10-21', due_time: '15:00' },
  { key: 'sketch', due_date: '2026-10-24', due_time: '09:00' },
  { key: 'decide', due_date: '2026-10-28', due_time: '15:00' },
  { key: 'prototype', due_date: '2026-11-03', due_time: '09:00' },
  { key: 'test', due_date: '2026-11-06', due_time: '15:00' }
] as const;
const facts = (over: Partial<GroupFacts> = {}): GroupFacts => ({ size: 4, submitted: {}, ended: {}, lock: null, ...over });

describe('sprint rules', () => {
  it('reads a Sydney date and time, summer time included', () => {
    expect(sydneyEpoch('2026-10-24', '09:00')).toBe(at('2026-10-23T22:00:00Z')); // AEDT, UTC+11
    expect(sydneyEpoch('2026-06-10', '09:00')).toBe(at('2026-06-09T23:00:00Z')); // AEST, UTC+10
    expect(sydneyEpoch('', '09:00')).toBeNull();
    expect(phaseDue({ due_date: '2026-10-24', due_time: '' })).toBe(sydneyEpoch('2026-10-24', '23:59'));
  });

  it('opens Understand at once and the next phase at the deadline', () => {
    expect(openPhases(phases, facts(), at('2026-10-20T00:00:00Z'))).toEqual(['understand']);
    expect(openPhases(phases, facts(), at('2026-10-21T05:00:00Z'))).toEqual(['understand', 'sketch']);
  });

  it('opens the next phase early when the whole group is in', () => {
    const f = facts({ submitted: { understand: 4 } });
    expect(openPhases(phases, f, at('2026-10-20T00:00:00Z'))).toEqual(['understand', 'sketch']);
    expect(openPhases(phases, facts({ submitted: { understand: 3 } }), at('2026-10-20T00:00:00Z'))).toEqual(['understand']);
  });

  it('opens the next phase when the class part ends, but only once the lock lifts', () => {
    const ended = { understand: { at: '2026-10-20T03:00:00.000Z', present: ['st_ann'] } };
    const lock = { phase: 'understand' as const, until: '2026-10-20T05:00:00.000Z', unlocked: [] };
    expect(openPhases(phases, facts({ ended, lock }), at('2026-10-20T04:00:00Z'))).toEqual(['understand']);
    expect(openPhases(phases, facts({ ended, lock }), at('2026-10-20T05:00:01Z'))).toEqual(['understand', 'sketch']);
  });

  it('locks everyone but unlocked students until the lock lifts', () => {
    const lock = { phase: 'decide' as const, until: '2026-10-28T05:00:00.000Z', unlocked: ['st_cy'] };
    expect(lockState(lock, 'st_ann', at('2026-10-28T04:00:00Z'))).toEqual({ locked: true, until: '2026-10-28T05:00:00.000Z' });
    expect(lockState(lock, 'st_cy', at('2026-10-28T04:00:00Z'))).toEqual({ locked: false, until: null });
    expect(lockState(lock, 'st_ann', at('2026-10-28T06:00:00Z'))).toEqual({ locked: false, until: null });
    expect(lockState(null, 'st_ann', 0)).toEqual({ locked: false, until: null });
  });

  it('marks late work', () => {
    expect(isLate(phases[1], '2026-10-23T21:59:00.000Z')).toBe(false);
    expect(isLate(phases[1], '2026-10-23T22:01:00.000Z')).toBe(true);
    expect(isLate({ due_date: '', due_time: '' }, '2030-01-01T00:00:00.000Z')).toBe(false);
  });

  it('tallies criterion votes, finds the top idea and spots a tie', () => {
    const votes = [{ c1: 'A', c2: 'B' }, { c1: 'A', c2: 'A' }, { c1: 'C', c2: 'B' }];
    const t = tally(votes, ['c1', 'c2'], ['A', 'B', 'C', 'D']);
    expect(t.totals).toEqual({ A: 3, B: 2, C: 1, D: 0 });
    expect(t.top).toBe('A');
    expect(t.tie).toBe(false);
    const tied = tally([{ c1: 'A' }, { c1: 'B' }], ['c1'], ['A', 'B']);
    expect(tied).toMatchObject({ top: null, tie: true });
    expect(tally([], ['c1'], ['A']).top).toBeNull();
  });

  it('turns counts into heat levels 0–3 for each criterion', () => {
    const t = tally([{ c1: 'A' }, { c1: 'A' }, { c1: 'A' }, { c1: 'B' }], ['c1'], ['A', 'B', 'C']);
    expect(heatLevels(t.counts, ['c1'])).toEqual({ A: { c1: 3 }, B: { c1: 1 }, C: { c1: 0 } });
  });
});
