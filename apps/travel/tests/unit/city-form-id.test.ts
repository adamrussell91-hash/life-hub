import { describe, expect, it } from 'vitest';
import { uniqueCityId } from '@/components/city-form';

describe('uniqueCityId', () => {
  it('slugifies the city name', () => {
    expect(uniqueCityId('Lisbon', [])).toBe('lisbon');
  });

  it('avoids colliding with existing ids', () => {
    expect(uniqueCityId('Lisbon', ['lisbon'])).toBe('lisbon2');
    expect(uniqueCityId('Lisbon', ['lisbon', 'lisbon2'])).toBe('lisbon3');
  });

  it('pads very short names', () => {
    expect(uniqueCityId('Oz', [])).toBe('ozcity');
  });
});
