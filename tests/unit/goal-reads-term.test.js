// tests/unit/goal-reads-term.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentTermRef,
  goalMatchesTermFilter,
  parseTermQuery,
  termRefsFromHubPrefs
} from '../../netlify/functions/_shared/goal-term-filter.mjs';
import { goalsForTermFilter } from '../../netlify/functions/goal-reads.mjs';

const PREFS = {
  school_terms: [{
    year: 2026,
    terms: [
      { term: 3, starts_on: '2026-07-20', ends_on: '2026-09-25' },
      { term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }
    ]
  }]
};

test('termRefsFromHubPrefs keeps year', () => {
  const refs = termRefsFromHubPrefs(PREFS);
  assert.deepEqual(refs.map(r => ({ year: r.year, term: r.term })), [
    { year: 2026, term: 3 },
    { year: 2026, term: 4 }
  ]);
});

test('parseTermQuery reads YYYY-N', () => {
  assert.deepEqual(parseTermQuery('2026-4'), { year: 2026, term: 4 });
  assert.equal(parseTermQuery('bad'), null);
  assert.equal(parseTermQuery(null), null);
});

test('currentTermRef picks the term containing today, else the next one', () => {
  const refs = termRefsFromHubPrefs(PREFS);
  assert.deepEqual(currentTermRef(refs, '2026-08-03'), { year: 2026, term: 3 });
  assert.deepEqual(currentTermRef(refs, '2026-09-30'), { year: 2026, term: 4 });
  assert.deepEqual(currentTermRef(refs, '2027-01-10'), { year: 2026, term: 4 });
});

test('goalMatchesTermFilter keeps the selected term and Ongoing when defaulting', () => {
  const selected = { year: 2026, term: 4 };
  assert.equal(goalMatchesTermFilter({ term: { year: 2026, term: 4 } }, selected, { includeOngoing: true }), true);
  assert.equal(goalMatchesTermFilter({ term: null }, selected, { includeOngoing: true }), true);
  assert.equal(goalMatchesTermFilter({ term: { year: 2026, term: 3 } }, selected, { includeOngoing: true }), false);
  assert.equal(goalMatchesTermFilter({ term: null }, selected, { includeOngoing: false }), false);
});

test('goalsForTermFilter: explicit term excludes Ongoing; default includes it', () => {
  const goals = [
    { id: 'a', status: 'active', term: { year: 2026, term: 4 } },
    { id: 'b', status: 'active', term: null },
    { id: 'c', status: 'active', term: { year: 2026, term: 3 } },
    { id: 'd', status: 'parked', term: { year: 2026, term: 4 } }
  ];
  const refs = termRefsFromHubPrefs(PREFS);
  const explicit = goalsForTermFilter(goals, { termQuery: '2026-4', termRefs: refs, today: '2026-11-04' });
  assert.deepEqual(explicit.map(g => g.id), ['a']);
  const defaults = goalsForTermFilter(goals, { termQuery: null, termRefs: refs, today: '2026-11-04' });
  assert.deepEqual(defaults.map(g => g.id).sort(), ['a', 'b']);
});
