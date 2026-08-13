import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays, enumerateDateKeys } from '../../js/core/time.js';
import {
  DOMAIN_PATH,
  WINDOW_DAYS,
  CN_MODEL_WINDOW_DAYS,
  getWindowStart,
  getCnModelWindowStart,
  selectHammondFitnessEntries,
  selectHammondEventEntries,
  summarizeHammondDigest,
  formatCentralNodeModelForPrompt
} from '../../netlify/functions/_shared/hammond-digest.mjs';
import { buildCentralNodeModel } from '../../js/app/central-node-model.js';

const TODAY = '2026-08-11';

function entryFor(domain, date, index) {
  const [year, month] = date.split('-');
  return { path: `data/${domain}/${year}/${month}/${date}-note.md`, type: 'blob', sha: `sha-${domain}-${index}` };
}

function treeFor(domain, dates) {
  return dates.map((date, index) => entryFor(domain, date, index));
}

test('getWindowStart derives from WINDOW_DAYS -- chat.mjs\'s hammondFrom must use this, not a re-derived literal', () => {
  assert.equal(WINDOW_DAYS, 90);
  assert.equal(getWindowStart(TODAY), addCalendarDays(TODAY, -(WINDOW_DAYS - 1)));
  assert.equal(getWindowStart(TODAY), '2026-05-14');
});

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

test('a mind_session file counts as mind-domain presence', () => {
  const tree = [{
    path: 'data/mind/2026/08/2026-08-01-session.md',
    type: 'blob',
    sha: 'sha-session'
  }];
  const summary = summarizeHammondDigest({ tree, fitnessRecords: [], today: TODAY });
  assert.match(summary, /mind: 1\/90 days/);
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
  // The only logged dates are 08-05..08-09, close to the end of the 90-day
  // window -- the gap before the first of them (windowStart 05-14 through
  // 08-04) is far bigger than the 2-day current gap, so it's the one that
  // should win "longest gap", not the trailing/current one.
  assert.match(fitnessLine, /longest gap 83d \(14 May – 4 Aug\)/);
});

test('longest gap picks the head gap (before the first logged date) when it is the biggest hole', () => {
  // Only a short packed run right at the end of the window -- the empty stretch
  // from windowStart to just before that run dwarfs anything else, and dwarfs
  // the (small) trailing current gap too.
  const tree = treeFor('nutrition', ['2026-08-05', '2026-08-06', '2026-08-07']);
  const summary = summarizeHammondDigest({ tree, fitnessRecords: [], today: TODAY });
  const nutritionLine = summary.split('\n').find(line => line.includes('— nutrition:'));
  assert.match(nutritionLine, /3\/90 days/);
  assert.match(nutritionLine, /current gap 4d/);
  assert.match(nutritionLine, /longest gap 83d \(14 May – 4 Aug\)/);
});

test('longest gap picks the trailing/current gap when nothing has been logged since a packed early run', () => {
  // A packed run right at the start of the window (no head gap, no internal
  // gaps) followed by nothing for the rest of the 90 days -- the trailing gap
  // to today is the only hole, and by far the biggest one.
  const windowStart = addCalendarDays(TODAY, -89);
  const earlyRun = enumerateDateKeys(windowStart, addCalendarDays(windowStart, 5));
  const tree = treeFor('body', earlyRun);
  const summary = summarizeHammondDigest({ tree, fitnessRecords: [], today: TODAY });
  const bodyLine = summary.split('\n').find(line => line.includes('— body:'));
  assert.match(bodyLine, /6\/90 days/);
  assert.match(bodyLine, /current gap 84d/);
  assert.match(bodyLine, /longest gap 84d \(20 May – 11 Aug\)/);
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

test('getCnModelWindowStart is a 30-day inclusive window', () => {
  assert.equal(CN_MODEL_WINDOW_DAYS, 30);
  assert.equal(getCnModelWindowStart(TODAY), addCalendarDays(TODAY, -29));
});

test('selectHammondEventEntries includes all five domains inside the window and excludes older paths', () => {
  const inWindow = addCalendarDays(TODAY, -10);
  const outWindow = addCalendarDays(TODAY, -40);
  const tree = [
    ...treeFor('nutrition', [inWindow, outWindow]),
    ...treeFor('fitness', [inWindow]),
    ...treeFor('body', [inWindow]),
    ...treeFor('mind', [inWindow]),
    ...treeFor('skincare', [inWindow]),
    { path: 'central-node.md', type: 'blob', sha: 'cn' }
  ];
  const selected = selectHammondEventEntries(tree, { from: getCnModelWindowStart(TODAY), to: TODAY });
  assert.equal(selected.length, 5);
  assert.ok(selected.every(entry => entry.path.includes(inWindow)));
  assert.ok(selected.every(entry => !entry.path.includes(outWindow)));
});

test('formatCentralNodeModelForPrompt reports rates and rising/falling/flat protein trends', () => {
  const rising = formatCentralNodeModelForPrompt({
    week: [
      { date: '2026-08-05', protein_g: 40 },
      { date: '2026-08-06', protein_g: 45 },
      { date: '2026-08-07', protein_g: 50 },
      { date: '2026-08-08', protein_g: 90 },
      { date: '2026-08-09', protein_g: 95 },
      { date: '2026-08-10', protein_g: 100 },
      { date: '2026-08-11', protein_g: 105 }
    ],
    loggingMonth: Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, complete: i < 15 })),
    exerciseMonth: Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, completed: i < 6 })),
    eatingMonth: Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, hitEatingTargets: i < 10 }))
  });
  assert.match(rising, /Protein \(7d\): rising/);
  assert.match(rising, /Logging completeness \(30d\): 15\/30 days \(50%\)/);
  assert.match(rising, /Exercise completed \(30d\): 6\/30 days \(20%\)/);
  assert.match(rising, /Eating targets met \(30d\): 10\/30 days \(33%\)/);

  const flat = formatCentralNodeModelForPrompt({
    week: Array.from({ length: 7 }, (_, i) => ({ date: `d${i}`, protein_g: 80 })),
    loggingMonth: [],
    exerciseMonth: [],
    eatingMonth: []
  });
  assert.match(flat, /Protein \(7d\): flat/);

  const falling = formatCentralNodeModelForPrompt({
    week: [
      { date: 'a', protein_g: 120 }, { date: 'b', protein_g: 110 }, { date: 'c', protein_g: 100 },
      { date: 'd', protein_g: 40 }, { date: 'e', protein_g: 30 }, { date: 'f', protein_g: 20 }, { date: 'g', protein_g: 10 }
    ],
    loggingMonth: [],
    exerciseMonth: [],
    eatingMonth: []
  });
  assert.match(falling, /Protein \(7d\): falling/);
});

test('formatCentralNodeModelForPrompt works against real buildCentralNodeModel output', () => {
  const events = [
    { record: { type: 'meal', date: TODAY, meal: 'breakfast', calories: 500, protein_g: 40, fat_g: 12, sodium_mg: 400, calcium_mg: 200, polyphenol_score: 2 } }
  ];
  const model = buildCentralNodeModel({
    events,
    targetsConfig: {
      target_sets: [{
        valid_from: '2020-01-01',
        calories: { movement: 1660, workout_30: 1900, workout_45_60: 2200, recovery_bonus: 200 },
        protein: { daily: 120, recovery_daily: 140, breakfast: 30, lunch: 30, dinner: 40, snack: 20, min_per_meal: 25 },
        fat_ceiling_g: 50,
        sodium_ceiling_mg: 2000,
        calcium_target_mg: 1000,
        polyphenol_daily_aim: 10
      }]
    },
    centralNodeMarkdown: '',
    date: TODAY
  });
  const text = formatCentralNodeModelForPrompt(model);
  assert.match(text, /Central Node computed snapshot/);
  assert.match(text, /Logging completeness \(30d\):/);
});
