import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_ENTRY_PATH,
  selectLatestBodyEntries,
  computeShoulderWaistRatio,
  formatBodyStateForPrompt
} from '../../netlify/functions/_shared/body-state.mjs';

test('BODY_ENTRY_PATH matches canonical composition/measurements paths only', () => {
  assert.ok(BODY_ENTRY_PATH.test('data/body/2026/07/2026-07-29-composition.md'));
  assert.ok(BODY_ENTRY_PATH.test('data/body/2026/07/2026-07-29-measurements.md'));
  assert.ok(!BODY_ENTRY_PATH.test('data/body/2026/07/2026-07-29-weight.md'));
  assert.ok(!BODY_ENTRY_PATH.test('data/fitness/2026/07/2026-07-29-composition.md'));
});

test('selectLatestBodyEntries returns only the most recent N per type from the tree, without reading blobs', () => {
  const tree = [
    { path: 'data/body/2026/06/2026-06-01-composition.md', type: 'blob', sha: '1' },
    { path: 'data/body/2026/07/2026-07-15-composition.md', type: 'blob', sha: '2' },
    { path: 'data/body/2026/07/2026-07-29-composition.md', type: 'blob', sha: '3' },
    { path: 'data/body/2026/07/2026-07-29-measurements.md', type: 'blob', sha: '4' },
    { path: 'data/fitness/2026/07/2026-07-29-session.md', type: 'blob', sha: '5' },
    { path: 'data/body', type: 'tree', sha: '6' }
  ];
  const result = selectLatestBodyEntries(tree, { limit: 2 });
  assert.deepEqual(result.composition.map(e => e.path), [
    'data/body/2026/07/2026-07-29-composition.md',
    'data/body/2026/07/2026-07-15-composition.md'
  ]);
  assert.deepEqual(result.measurements.map(e => e.path), [
    'data/body/2026/07/2026-07-29-measurements.md'
  ]);
});

test('selectLatestBodyEntries tolerates a non-array tree', () => {
  assert.deepEqual(selectLatestBodyEntries(undefined), { composition: [], measurements: [] });
});

test('computeShoulderWaistRatio divides shoulders by waist', () => {
  assert.equal(computeShoulderWaistRatio({ shoulders: 112, waist: 80 }), 1.4);
});

test('computeShoulderWaistRatio returns null for missing or zero measurements without crashing', () => {
  assert.equal(computeShoulderWaistRatio({}), null);
  assert.equal(computeShoulderWaistRatio({ shoulders: 112 }), null);
  assert.equal(computeShoulderWaistRatio({ waist: 80 }), null);
  assert.equal(computeShoulderWaistRatio({ shoulders: 112, waist: 0 }), null);
  assert.equal(computeShoulderWaistRatio(null), null);
  assert.equal(computeShoulderWaistRatio(undefined), null);
});

test('formatBodyStateForPrompt returns an empty string when there is no body data', () => {
  assert.equal(formatBodyStateForPrompt({}), '');
  assert.equal(formatBodyStateForPrompt({ compositionRecords: [], measurementRecords: [] }), '');
});

test('formatBodyStateForPrompt reports composition deltas vs the previous reading', () => {
  const text = formatBodyStateForPrompt({
    compositionRecords: [
      { date: '2026-08-05', weight_kg: 85.5, body_fat_pct: 19.0, skeletal_muscle_kg: 40.1 },
      { date: '2026-07-20', weight_kg: 86.3, body_fat_pct: 19.5, skeletal_muscle_kg: 39.9 }
    ],
    measurementRecords: []
  });
  assert.match(text, /85\.5kg/);
  assert.match(text, /-0\.8kg vs last reading/);
  assert.match(text, /19%/);
  assert.match(text, /40\.1kg/);
});

test('formatBodyStateForPrompt reports the shoulder:waist ratio, trend, and gap to target', () => {
  const text = formatBodyStateForPrompt({
    compositionRecords: [],
    measurementRecords: [
      { date: '2026-08-05', shoulders: 114, waist: 80 },
      { date: '2026-07-20', shoulders: 112, waist: 80 }
    ],
    targetRatio: 1.6
  });
  assert.match(text, /1\.43/);
  assert.match(text, /improving/);
  assert.match(text, /target 1\.60/);
});

test('formatBodyStateForPrompt omits the ratio line when shoulders or waist is missing, without crashing', () => {
  const text = formatBodyStateForPrompt({
    measurementRecords: [{ date: '2026-08-05', waist: 80 }]
  });
  assert.doesNotMatch(text, /ratio/i);
  assert.doesNotMatch(text, /NaN/);
});

test('formatBodyStateForPrompt omits gap to target when no target is supplied', () => {
  const text = formatBodyStateForPrompt({
    measurementRecords: [{ date: '2026-08-05', shoulders: 114, waist: 80 }]
  });
  assert.match(text, /1\.43/);
  assert.doesNotMatch(text, /target/i);
});
