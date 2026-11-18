import { describe, expect, it } from 'vitest';
import { caseMoves } from '@/case-study/practice';

const cls = (over = {}) => ({ pace: 'teacher' as const, open_to: 0, last: 4, parts_open: 1, parts_total: 2, outcome_revealed: false, ...over });

describe('caseMoves', () => {
  it('offers the next station, in order', () => {
    expect(caseMoves(cls(), true).moves).toEqual([{ label: 'Open The case', action: 'open', station: 1 }]);
    expect(caseMoves(cls({ open_to: 2, parts_open: 2 }), true).moves.map((m) => m.label)).toEqual(['Open Outcome']);
  });
  it('offers the next part beside the next station on a layered case', () => {
    expect(caseMoves(cls({ open_to: 1 }), true).moves.map((m) => m.label)).toEqual(['Release part 2', 'Open Decide']);
    expect(caseMoves(cls({ open_to: 1 }), false).moves.map((m) => m.label)).toEqual(['Open Decide']);
  });
  it('reveals the Outcome before Rules opens, and stops at the last station', () => {
    expect(caseMoves(cls({ open_to: 3, parts_open: 2 }), true).moves.map((m) => m.label)).toEqual(['Reveal the Outcome']);
    expect(caseMoves(cls({ open_to: 3, parts_open: 2, outcome_revealed: true }), true).moves.map((m) => m.label)).toEqual(['Open Rules']);
    expect(caseMoves(cls({ open_to: 3, parts_open: 2, outcome_revealed: true, last: 3 }), true).moves).toEqual([]);
  });
  it('waits on nobody at own pace', () => {
    expect(caseMoves(cls({ pace: 'own' }), true).moves).toEqual([]);
  });
});
