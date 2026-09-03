import { describe, it, expect } from 'vitest';
import { PASTEL_TINTS, pastelFromId } from '@/design/pastel';

describe('pastelFromId', () => {
  it('returns a tint from the closed set', () => {
    const tint = pastelFromId('unit_aotfw');
    expect(PASTEL_TINTS).toContain(tint);
  });

  it('is stable for the same id', () => {
    expect(pastelFromId('unit_aotfw')).toBe(pastelFromId('unit_aotfw'));
  });

  it('spreads different ids across the set', () => {
    const ids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];
    const unique = new Set(ids.map(pastelFromId));
    expect(unique.size).toBeGreaterThan(1);
  });
});
