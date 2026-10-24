import { describe, expect, it } from 'vitest';
import { earlyNotes, phaseSpans } from '@/sprint/phase-timeline';
import { sydneyEpoch } from '@/sprint/rules';

const phase = (key: 'understand' | 'sketch' | 'decide' | 'prototype' | 'test', where: 'class' | 'home', due_date: string, ends_at = '') => ({ key, where, due_date, due_time: '15:00', ends_at });

describe('phaseSpans', () => {
  const phases = [
    phase('understand', 'class', '2026-10-26', '2026-10-26T12:30'),
    phase('sketch', 'home', '2026-10-28'),
    phase('decide', 'class', '2026-10-29'),
    phase('prototype', 'home', ''),
    phase('test', 'class', '2026-11-02')
  ];
  const spans = phaseSpans(phases, 2);

  it('opens each phase when the one before closes', () => {
    expect(spans[0]!.opens).toBeNull();
    expect(spans[1]!.opens).toBe(sydneyEpoch('2026-10-26', '15:00'));
    expect(spans[2]!.opens).toBe(spans[1]!.closes);
  });

  it('locks a class phase for the lock hours after the lesson ends', () => {
    const from = sydneyEpoch('2026-10-26', '12:30')!;
    expect(spans[0]!.lock).toEqual({ from, until: from + 2 * 3_600_000 });
    expect(spans[2]!.lock).toBeNull();
  });

  it('names a missing close and a close out of order', () => {
    expect(spans[3]!.problems).toEqual(['Set a close time']);
    const swapped = phaseSpans([phases[0]!, phase('sketch', 'home', '2026-10-25'), ...phases.slice(2)], 2);
    expect(swapped[1]!.problems).toEqual(['Closes before Understand closes']);
  });

  it('flags a lesson that ends after the phase closes', () => {
    const late = phaseSpans([phase('understand', 'class', '2026-10-26', '2026-10-26T16:00')], 2);
    expect(late[0]!.problems).toEqual(['The lesson ends after the phase closes']);
  });

  it('uses the real end time once a class part has ended', () => {
    const at = '2026-10-26T01:00:00.000Z';
    expect(phaseSpans(phases, 2, { understand: { at } })[0]!.lock!.from).toBe(Date.parse(at));
  });
});

describe('earlyNotes', () => {
  it('counts the groups that opened a phase before its time', () => {
    const spans = phaseSpans([phase('understand', 'class', '2026-10-26'), phase('sketch', 'home', '2026-10-28')], 2);
    const now = sydneyEpoch('2026-10-26', '10:00')!;
    expect(earlyNotes(spans, [['understand', 'sketch'], ['understand']], now)).toEqual({ sketch: 'Open early for 1 group' });
  });
});
