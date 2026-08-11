import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays, enumerateDateKeys } from '../../js/core/time.js';
import {
  DOMAIN_PATH,
  selectHammondFitnessEntries,
  summarizeHammondDigest
} from '../../netlify/functions/_shared/hammond-digest.mjs';

const TODAY = '2026-08-11';

function entryFor(domain, date, index) {
  const [year, month] = date.split('-');
  return { path: `data/${domain}/${year}/${month}/${date}-note.md`, type: 'blob', sha: `sha-${domain}-${index}` };
}

function treeFor(domain, dates) {
  return dates.map((date, index) => entryFor(domain, date, index));
}

test('DOMAIN_PATH matches only the 5 recognised Life Hub domains', () => {
  assert.ok(DOMAIN_PATH.test('data/nutrition/2026/08/2026-08-01-breakfast.md'));
  assert.ok(DOMAIN_PATH.test('data/fitness/2026/08/2026-08-01-session.md'));
  assert.ok(DOMAIN_PATH.test('data/body/2026/08/2026-08-01-composition.md'));
  assert.ok(DOMAIN_PATH.test('data/mind/2026/08/2026-08-01-diary.md'));
  assert.ok(DOMAIN_PATH.test('data/skincare/2026/08/2026-08-01-am.md'));
  assert.ok(!DOMAIN_PATH.test('data/sleep/2026/08/2026-08-01-note.md'));
  assert.ok(!DOMAIN_PATH.test('data/heart/2026/08/2026-08-01-note.md'));
});

test('summarizes a 90-day gap and a current gap for a domain (happy path / domain detail)', () => {
  const windowStart = addCalendarDays(TODAY, -89);
  const all = enumerateDateKeys(windowStart, TODAY);
  const gapDates = new Set(enumerateDateKeys('2026-06-14', '2026-06-22')); // 9-day gap
  const trailingGapDates = new Set(['2026-08-10', '2026-08-11']); // 2-day current gap
  const nutritionDates = all.filter(date => !gapDates.has(date) && !trailingGapDates.has(date));

  const tree = treeFor('nutrition', nutritionDates);
  const summary = summarizeHammondDigest({ tree, fitnessRecords: [], today: TODAY });

  assert.match(
    summary,
    /Logging last 90 days — nutrition: 79\/90 days, current gap 2d, longest gap 9d \(14–22 Jun\)\./
  );
});

test('domain with no entries in the window reports zero without a gap range', () => {
  const summary = summarizeHammondDigest({ tree: [], fitnessRecords: [], today: TODAY });
  assert.match(summary, /Logging last 90 days — mind: 0\/90 days, no entries in this window\./);
  assert.match(summary, /Logging last 90 days — skincare: 0\/90 days, no entries in this window\./);
});

test('a fully logged domain reports a zero gap and omits the date range (format edge)', () => {
  const windowStart = addCalendarDays(TODAY, -89);
  const allDates = enumerateDateKeys(windowStart, TODAY);
  const tree = treeFor('body', allDates);
  const summary = summarizeHammondDigest({ tree, fitnessRecords: [], today: TODAY });
  assert.match(summary, /Logging last 90 days — body: 90\/90 days, current gap 0d, longest gap 0d\./);
  // No trailing "(…)" range should be appended when there is no gap at all.
  const bodyLine = summary.split('\n').find(line => line.includes('— body:'));
  assert.equal(bodyLine.includes('('), false);
});

test('empty tree produces a valid empty-ish output for every domain, no crash', () => {
  const summary = summarizeHammondDigest({ tree: [], fitnessRecords: [], today: TODAY });
  const lines = summary.split('\n');
  assert.equal(lines.length, 5);
  for (const domain of ['nutrition', 'fitness', 'body', 'mind', 'skincare']) {
    assert.ok(lines.some(line => line.includes(`— ${domain}:`)), `missing ${domain} line`);
  }
  assert.match(lines.find(line => line.includes('fitness')), /0\/90 days, no entries in this window, current streak 0d, 0 completed\./);
});

test('boundary: an entry exactly 90 days back is included in the window', () => {
  const windowStart = addCalendarDays(TODAY, -89); // "90 days back" inclusive of today
  const tree = treeFor('mind', [windowStart]);
  const summary = summarizeHammondDigest({ tree, fitnessRecords: [], today: TODAY });
  assert.match(summary, /Logging last 90 days — mind: 1\/90 days/);
});

test('boundary: an entry 91 days back is excluded from the window', () => {
  const outOfWindow = addCalendarDays(TODAY, -90); // one day earlier than the 90-day cutoff
  const tree = treeFor('mind', [outOfWindow]);
  const summary = summarizeHammondDigest({ tree, fitnessRecords: [], today: TODAY });
  assert.match(summary, /Logging last 90 days — mind: 0\/90 days, no entries in this window\./);
});

test('computes fitness streak and completed count from completed/planned/skipped classification', () => {
  const tree = treeFor('fitness', ['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09']);
  const fitnessRecords = [
    { type: 'workout', date: '2026-08-05', status: 'completed' },
    { type: 'workout', date: '2026-08-06', status: 'completed' },
    { type: 'workout', date: '2026-08-07', status: 'completed' },
    { type: 'workout', date: '2026-08-08', status: 'planned' },
    { type: 'workout', date: '2026-08-09', status: 'skipped' }
  ];
  const summary = summarizeHammondDigest({ tree, fitnessRecords, today: TODAY });
  const fitnessLine = summary.split('\n').find(line => line.includes('— fitness:'));
  assert.match(fitnessLine, /5\/90 days/);
  assert.match(fitnessLine, /current streak 3d/);
  assert.match(fitnessLine, /3 completed/);
  assert.match(fitnessLine, /current gap 2d/);
});

test('a planned/skipped-only fitness window reports a zero streak without crashing', () => {
  const tree = treeFor('fitness', ['2026-08-09']);
  const fitnessRecords = [{ type: 'workout', date: '2026-08-09', status: 'skipped' }];
  const summary = summarizeHammondDigest({ tree, fitnessRecords, today: TODAY });
  const fitnessLine = summary.split('\n').find(line => line.includes('— fitness:'));
  assert.match(fitnessLine, /current streak 0d/);
  assert.match(fitnessLine, /0 completed/);
});

test('malformed tree entries and fitness records are skipped without throwing', () => {
  const tree = [
    null,
    undefined,
    { path: 'data/fitness/2026/08/2026-08-01-session.md' }, // missing type
    { type: 'blob', path: 42 }, // non-string path
    { type: 'tree', path: 'data/fitness/2026/08' }, // a directory, not a blob
    { type: 'blob', path: 'data/notarealdomain/2026/08/2026-08-01-note.md' }, // unrecognised domain
    { type: 'blob', path: 'not-even-a-data-path.md' },
    { type: 'blob', path: 'data/fitness/2026/08/2026-08-05-session.md', sha: 'ok' }
  ];
  const fitnessRecords = [
    null,
    'not-an-object',
    { type: 'meal', date: '2026-08-05', status: 'completed' }, // wrong type, not fitness
    { type: 'workout', status: 'completed' }, // missing date
    { type: 'workout', date: '2026-08-05', status: 'completed' }
  ];
  assert.doesNotThrow(() => {
    const summary = summarizeHammondDigest({ tree, fitnessRecords, today: TODAY });
    assert.match(summary, /Logging last 90 days — fitness: 1\/90 days/);
    assert.match(summary, /current streak 1d/);
    assert.match(summary, /1 completed/);
  });
});

test('summarizeHammondDigest tolerates a non-array tree and undefined fitnessRecords', () => {
  assert.doesNotThrow(() => {
    const summary = summarizeHammondDigest({ tree: undefined, today: TODAY });
    assert.equal(summary.split('\n').length, 5);
  });
});

test('selectHammondFitnessEntries returns only in-range fitness entries, sorted by path', () => {
  const tree = [
    { path: 'data/fitness/2026/08/2026-08-09-session.md', type: 'blob', sha: 'a' },
    { path: 'data/fitness/2026/05/2026-05-01-session.md', type: 'blob', sha: 'b' }, // out of range
    { path: 'data/fitness/2026/08/2026-08-05-session.md', type: 'blob', sha: 'c' },
    { path: 'data/nutrition/2026/08/2026-08-05-breakfast.md', type: 'blob', sha: 'd' }, // wrong domain
    { path: 'data/fitness/2026', type: 'tree', sha: 'e' } // not a blob
  ];
  const entries = selectHammondFitnessEntries(tree, { from: '2026-08-01', to: '2026-08-11' });
  assert.deepEqual(entries.map(entry => entry.path), [
    'data/fitness/2026/08/2026-08-05-session.md',
    'data/fitness/2026/08/2026-08-09-session.md'
  ]);
});

test('selectHammondFitnessEntries tolerates a non-array tree', () => {
  assert.deepEqual(selectHammondFitnessEntries(undefined, { from: '2026-08-01', to: '2026-08-11' }), []);
});
