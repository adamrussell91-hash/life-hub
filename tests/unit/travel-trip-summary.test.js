import test from 'node:test';
import assert from 'node:assert/strict';
import { tripSummary } from '../../netlify/functions/_shared/travel-schema.mjs';

test('tripSummary lists unique countries in first-appearance order', () => {
  const summary = tripSummary({
    id: 'trp_x',
    title: 'T',
    start_date: '2026-01-01',
    end_date: '2026-01-10',
    cities: [
      { name: 'Lisbon', country: 'Portugal' },
      { name: 'Porto', country: 'Portugal' },
      { name: 'Seoul', country: 'South Korea' },
      { name: 'Nowhere', country: '  ' }
    ]
  });
  assert.deepEqual(summary.cities, ['Lisbon', 'Porto', 'Seoul', 'Nowhere']);
  assert.deepEqual(summary.countries, ['Portugal', 'South Korea']);
});
