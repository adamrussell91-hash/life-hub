import { expect, it } from 'vitest';
import { readsAsAd, reconcileCriteria, splitCriteriaLines } from '@/domain/career-criteria-paste';

it('strips bullets and numbering, and drops blanks and repeats', () => {
  expect(splitCriteriaLines('- One thing\r\n\r\n2) Two things\n(a) Three\n• one thing\nWhole-school role')).toEqual([
    'One thing',
    'Two things',
    'Three',
    'Whole-school role'
  ]);
});

it('keeps a word that only starts like a list mark', () => {
  expect(splitCriteriaLines('A strong record\n3D design skills')).toEqual(['A strong record', '3D design skills']);
});

it('reads a list as a list, and paragraphs or too many lines as an ad', () => {
  expect(readsAsAd('Leads teams\nCoaches teachers')).toBe(false);
  expect(readsAsAd('word '.repeat(100))).toBe(true);
  expect(readsAsAd(Array.from({ length: 21 }, (_, i) => `Line ${i}`).join('\n'))).toBe(true);
});

const old = [
  { id: 'fcrit_a', text: 'Alpha', source: 'ad', order: 0 },
  { id: 'fcrit_b', text: 'Beta', source: 'ann', order: 1 }
];

it('keeps ids for moved and reworded lines, and new lines get none', () => {
  expect(
    reconcileCriteria([{ text: 'beta' }, { text: 'Alpha, reworded' }, { text: 'Gamma' }], old)
  ).toEqual([
    { id: 'fcrit_b', text: 'beta', order: 0, source: 'ann' },
    { text: 'Alpha, reworded', order: 1, source: 'adam' },
    { text: 'Gamma', order: 2, source: 'adam' }
  ]);
  expect(reconcileCriteria([{ text: 'Alpha' }, { text: 'Beta now' }], old)).toEqual([
    { id: 'fcrit_a', text: 'Alpha', order: 0, source: 'ad' },
    { id: 'fcrit_b', text: 'Beta now', order: 1, source: 'ann' }
  ]);
});
