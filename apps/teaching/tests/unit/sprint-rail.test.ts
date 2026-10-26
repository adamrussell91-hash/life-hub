import { describe, expect, it } from 'vitest';
import { railState } from '@/sprint/rail';

const row = (key: 'understand' | 'sketch', open: boolean, state: 'none' | 'draft' | 'in', closed = false) => ({ key, open, state, closed });

describe('railState', () => {
  it('marks the current phase now, whatever its state', () => {
    expect(railState(row('sketch', true, 'in'), 'sketch')).toBe('now');
  });
  it('fades phases that are not open yet', () => {
    expect(railState(row('sketch', false, 'none'), 'understand')).toBe('later');
  });
  it('ticks a handed-in phase', () => {
    expect(railState(row('understand', true, 'in'), 'sketch')).toBe('in');
  });
  it('flags a closed phase with no hand-in, and keeps it openable', () => {
    expect(railState(row('understand', true, 'draft', true), 'sketch')).toBe('late');
  });
  it('leaves an open phase plain', () => {
    expect(railState(row('understand', true, 'none'), 'sketch')).toBe('open');
  });
});
