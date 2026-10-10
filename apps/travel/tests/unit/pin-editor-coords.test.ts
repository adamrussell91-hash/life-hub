import { describe, expect, it } from 'vitest';
import { parseCoordinates } from '@/journal/pin-editor';

describe('parseCoordinates', () => {
  it('accepts valid bounds', () => {
    const result = parseCoordinates('3.1579', '101.7116');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.coordinates.lat).toBeCloseTo(3.1579);
    }
  });

  it('rejects out-of-range latitude', () => {
    const result = parseCoordinates('95', '0');
    expect(result.ok).toBe(false);
  });

  it('rejects non-finite values', () => {
    const result = parseCoordinates('abc', '10');
    expect(result.ok).toBe(false);
  });
});
