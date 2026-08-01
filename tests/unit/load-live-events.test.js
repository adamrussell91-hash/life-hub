import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
import { buildHomeModel } from '../../js/app/home-model.js';
import { loadLiveEvents } from '../../js/app/load-live-events.js';
import { addCalendarDays, daysBetween } from '../../js/core/time.js';

const SHA = 'a'.repeat(40);
const raw = (path, content) => ({ path, sha: SHA, content });

function workout(date) {
  return raw(`data/fitness/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}-workout.md`, `---
type: workout
date: '${date}'
status: completed
day_type: workout_30
exercises:
  - name: Walk
    sets:
      - { reps: 1, weight_kg: 0 }
---
Workout`);
}

test('loads the current Sydney date window through existing parsers and exact Home modules', async () => {
  const fixtureManifest = JSON.parse(await readFile(
    new URL('../../fixtures/manifest.json', import.meta.url),
    'utf8'
  ));
  const files = await Promise.all(fixtureManifest.files.map(async entry => raw(
    entry.path,
    await readFile(new URL(`../..${entry.url}`, import.meta.url), 'utf8')
  )));
  files.push(raw(
    'config/targets.yml',
    await readFile(new URL('../../config/targets.yml', import.meta.url), 'utf8')
  ));
  const calls = [];
  const sync = async options => {
    calls.push(options);
    for (const candidate of files) assert.deepEqual(options.validateFile(candidate), { valid: true });
    return { files, warnings: [], commitSha: 'c'.repeat(40), manifestId: 'range', changed: true };
  };

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-07-30' });
  const model = buildHomeModel({ ...result, date: '2026-07-30' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].from, '2026-06-30');
  assert.equal(calls[0].to, '2026-07-30');
  assert.equal(result.events.length, 4);
  assert.equal(result.commitSha, 'c'.repeat(40));
  assert.deepEqual(result.warnings, []);
  assert.equal(model.nutrition.calories, 1130);
  assert.equal(model.nutrition.protein_g, 80);
  assert.equal(model.nutrition.fat_g, 27);
  assert.equal(model.dayType, 'workout_30');
  assert.equal(model.workoutStreak, 1);
  assert.equal(model.completeness.complete, 3);
});

test('returns stable warnings for invalid Markdown and target configuration', async () => {
  const files = [
    raw('config/targets.yml', 'target_sets: [invalid'),
    raw('data/fitness/2026/07/2026-07-30-workout.md', 'not frontmatter')
  ];
  const sync = async ({ validateFile }) => {
    assert.equal(validateFile(files[0]).valid, false);
    assert.equal(validateFile(files[1]).valid, false);
    return { files, warnings: [{ code: 'github_unavailable' }], commitSha: 'c'.repeat(40) };
  };

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-07-30' });

  assert.deepEqual(result.events, []);
  assert.equal(result.targetsConfig, null);
  assert.deepEqual(result.warnings, [
    { code: 'github_unavailable' },
    { path: 'config/targets.yml', code: 'invalid_targets' },
    { path: 'data/fitness/2026/07/2026-07-30-workout.md', code: 'invalid_event' }
  ]);
});

test('widens a boundary-reaching workout streak by ninety days within the bounded range', async () => {
  const calls = [];
  const initialFrom = '2026-07-02';
  const date = '2026-08-01';
  const initialFiles = [];
  for (let key = initialFrom; key <= date; key = addCalendarDays(key, 1)) {
    initialFiles.push(workout(key));
  }
  const olderFiles = [workout('2026-07-01')];
  const sync = async options => {
    calls.push(options);
    return {
      files: calls.length === 1 ? initialFiles : olderFiles,
      warnings: [],
      commitSha: 'c'.repeat(40),
      manifestId: `range-${calls.length}`,
      changed: true
    };
  };

  const result = await loadLiveEvents({ sync, loadYaml: load, date });

  assert.deepEqual(calls.map(({ from, to }) => ({ from, to })), [
    { from: '2026-07-02', to: '2026-08-01' },
    { from: '2026-04-03', to: '2026-08-01' }
  ]);
  assert.ok(calls.every(call => daysBetween(call.from, call.to) < 366));
  assert.equal(result.events.length, 32);
});

test('repeated boundary expansion never sends an individual range over 366 days', async () => {
  const calls = [];
  const sync = async ({ from, to }) => {
    calls.push({ from, to });
    if (calls.length === 6) {
      return { files: [], warnings: [], commitSha: 'c'.repeat(40), manifestId: 'empty', changed: true };
    }
    const files = [];
    for (let key = from; key <= to; key = addCalendarDays(key, 1)) files.push(workout(key));
    return {
      files,
      warnings: [],
      commitSha: 'c'.repeat(40),
      manifestId: `range-${calls.length}`,
      changed: true
    };
  };

  await loadLiveEvents({ sync, loadYaml: load, date: '2026-08-01' });

  assert.equal(calls.length, 6);
  assert.ok(calls.every(call => daysBetween(call.from, call.to) < 366));
  assert.deepEqual(calls[1], { from: '2026-04-03', to: '2026-08-01' });
  assert.deepEqual(calls[4], { from: '2025-07-07', to: '2025-10-04' });
  assert.deepEqual(calls[5], { from: '2025-04-08', to: '2025-10-04' });
});

test('rejects invalid dates before starting repository sync', async () => {
  let called = false;
  await assert.rejects(
    loadLiveEvents({
      sync: async () => { called = true; },
      loadYaml: load,
      date: '2026-02-30'
    }),
    /calendar date/i
  );
  assert.equal(called, false);
});
