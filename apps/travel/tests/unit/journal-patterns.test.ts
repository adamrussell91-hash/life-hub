import { describe, expect, it } from 'vitest';
import { getPattern } from '@/journal/patterns/registry';

describe('journal pattern registry', () => {
  it('resolves kul and ist to distinct bundled SVG URLs with labels', () => {
    const kul = getPattern('kul');
    const ist = getPattern('ist');

    expect(kul?.label).toBe('Kuala Lumpur — batik botanical');
    expect(ist?.label).toBe('Istanbul — Iznik tulip and carnation');
    expect(kul?.href).toMatch(/^(data:image\/svg\+xml|.*\.svg)/);
    expect(ist?.href).toMatch(/^(data:image\/svg\+xml|.*\.svg)/);
    expect(kul?.href).not.toBe(ist?.href);
  });

  it('returns null for unknown pattern ids', () => {
    expect(getPattern('nyc')).toBeNull();
    expect(getPattern('')).toBeNull();
  });
});
