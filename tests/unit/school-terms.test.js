import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSchoolTerms, resolveSchoolTerms } from '../../packages/design-kit/js/calendar/school-terms.js';

test('parseSchoolTerms flattens year-nested hub-prefs and flat visual rows', () => {
  const nested = parseSchoolTerms([
    {
      year: 2026,
      terms: [
        { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
        { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
      ]
    }
  ]);
  assert.equal(nested.length, 2);
  assert.equal(nested[0].term, 3);
  const flat = parseSchoolTerms([{ term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' }]);
  assert.equal(flat.length, 1);
});

test('resolveSchoolTerms prefers hub-prefs over planning-profile over visual', () => {
  const resolved = resolveSchoolTerms({
    hubPrefs: {
      school_terms: [{ year: 2026, terms: [{ term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' }] }]
    },
    planningProfile: { school_terms: [{ term: 1, starts_on: '2026-02-02', ends_on: '2026-04-02' }] },
    visual: { school_terms: [{ term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }] }
  });
  assert.equal(resolved[0].term, 3);
  const fromVisual = resolveSchoolTerms({
    hubPrefs: null,
    planningProfile: null,
    visual: { school_terms: [{ term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }] }
  });
  assert.equal(fromVisual[0].term, 4);
});
