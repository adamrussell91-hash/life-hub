import { describe, expect, it } from 'vitest';
import { parseRoute, tabTitle } from '@/app/router';

describe('tabTitle', () => {
  it('names each page', () => {
    expect(tabTitle(parseRoute('#/'))).toBe('Trips · Travel');
    expect(tabTitle(parseRoute('#/today'))).toBe('Today · Travel');
    expect(tabTitle(parseRoute('#/atlas'))).toBe('Arches Atlas · Travel');
    expect(tabTitle(parseRoute('#/trip/t1/journal'))).toBe('Journal · Travel');
  });

  it('leaves a trip to add its own title', () => {
    expect(tabTitle(parseRoute('#/trip/t1'))).toBe('Travel');
  });
});
