import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
import { buildHomeModel } from '../../js/app/home-model.js';
import {
  MAX_LOOKBACK_DAYS,
  loadLiveEvents as loadLiveEventsRaw,
  planBackfillWindows
} from '../../js/app/load-live-events.js';

function loadLiveEvents(opts) {
  return loadLiveEventsRaw({ maxLookbackDays: 40, ...opts });
}
import { addCalendarDays, daysBetween } from '../../js/core/time.js';

const SHA = 'a'.repeat(40);
const raw = (path, content) => ({ path, sha: SHA, content });

function workout(date) {
  return raw(`data/fitness/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}-workout.md`, `---
type: workout
date: '${date}'
title: Daily Workout
session_kind: strength
status: completed
day_type: workout_30
exercises:
  - name: Walk
    sets:
      - { reps: 1, weight_kg: 0, cable_type: none }
---
Workout`);
}

function bodyWeight(date, kg = 80) {
  return raw(`data/body/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}-weight.md`, `---
type: weight
date: '${date}'
weight_kg: ${kg}
---
Weight`);
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
  const date = '2026-07-30';
  const sync = async options => {
    calls.push(options);
    for (const candidate of files) assert.deepEqual(options.validateFile(candidate), { valid: true });
    return {
      files: options.to === date ? files : [],
      warnings: [],
      commitSha: 'c'.repeat(40),
      manifestId: 'range',
      changed: true,
      freshness: 'confirmed'
    };
  };

  const result = await loadLiveEvents({ sync, loadYaml: load, date });
  const model = buildHomeModel({ ...result, date: '2026-07-30' });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].from, '2026-07-24');
  assert.equal(calls[0].to, '2026-07-30');
  assert.equal(calls[1].from, '2026-06-24');
  assert.equal(calls[1].to, '2026-07-23');
  // The last window is clamped to the 40-day cap rather than skipped.
  assert.equal(calls[2].from, '2026-06-21');
  assert.equal(calls[2].to, '2026-06-23');
  assert.equal(result.events.length, 4);
  assert.equal(result.commitSha, 'c'.repeat(40));
  assert.equal(result.changed, true);
  assert.equal(result.freshness, 'confirmed');
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
    raw('data/fitness/2026/07/2026-07-30-workout.md', 'not frontmatter'),
    raw('config/agents.yml', 'agents: [invalid')
  ];
  let calls = 0;
  const sync = async ({ validateFile }) => {
    calls += 1;
    if (calls > 1) {
      return {
        files: [],
        warnings: [],
        commitSha: 'c'.repeat(40),
        changed: false,
        freshness: 'fallback'
      };
    }
    assert.equal(validateFile(files[0]).valid, false);
    assert.equal(validateFile(files[1]).valid, false);
    assert.deepEqual(validateFile(files[2]), { valid: false, code: 'invalid_agents' });
    return {
      files,
      warnings: [{ code: 'github_unavailable' }],
      commitSha: 'c'.repeat(40),
      changed: false,
      freshness: 'fallback'
    };
  };

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-07-30' });

  assert.deepEqual(result.events, []);
  assert.equal(result.targetsConfig, null);
  assert.equal(result.changed, false);
  assert.equal(result.freshness, 'fallback');
  assert.deepEqual(result.warnings, [
    { code: 'github_unavailable' },
    { path: 'config/targets.yml', code: 'invalid_targets' },
    { path: 'data/fitness/2026/07/2026-07-30-workout.md', code: 'invalid_event' },
    { path: 'config/agents.yml', code: 'invalid_agents' }
  ]);
});

test('first sync is seven inclusive days and the next slice does not overlap', async () => {
  const calls = [];
  const date = '2026-08-01';
  const weekFiles = [bodyWeight('2026-07-28', 80), bodyWeight(date, 79)];
  const olderFiles = [bodyWeight('2026-07-01', 83)];
  const sync = async options => {
    calls.push({ from: options.from, to: options.to });
    const files = options.to === date ? weekFiles
      : calls.length === 2 ? olderFiles
      : [];
    return {
      files, warnings: [], commitSha: 'c'.repeat(40),
      manifestId: `range-${calls.length}`, changed: true, freshness: 'confirmed'
    };
  };
  const partials = [];
  const result = await loadLiveEvents({
    sync, loadYaml: load, date, maxLookbackDays: 70, onPartial: snapshot => partials.push(snapshot)
  });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], { from: '2026-07-26', to: '2026-08-01' });
  assert.deepEqual(calls[1], { from: '2026-06-26', to: '2026-07-25' });
  assert.ok(calls.every(call => call.to < calls[0].from || call === calls[0] || call.to === date));
  assert.equal(calls[1].to, '2026-07-25');
  assert.ok(partials.length >= 1);
  assert.equal(partials[0].events.every(event => event.record.date >= '2026-07-26'), true);
  assert.ok(result.events.some(event => event.record.date === '2026-07-01'));
});

test('onPartial fires after the first window before older files exist', async () => {
  const date = '2026-08-01';
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let olderCalls = 0;
  const sync = async ({ from, to }) => {
    if (to !== date) {
      olderCalls += 1;
      if (olderCalls === 1) await gate;
      if (olderCalls > 1) {
        return {
          files: [], warnings: [], commitSha: 'c'.repeat(40), manifestId: `${from}`,
          changed: true, freshness: 'confirmed'
        };
      }
    }
    return {
      files: [bodyWeight(to === date ? date : '2026-07-01', 80)],
      warnings: [], commitSha: 'c'.repeat(40), manifestId: `${from}`,
      changed: true, freshness: 'confirmed'
    };
  };
  const partials = [];
  const done = loadLiveEvents({
    sync, loadYaml: load, date, maxLookbackDays: 70,
    onPartial: snapshot => partials.push(snapshot.events.map(event => event.record.date))
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(partials[0], [date]);
  release();
  await done;
  assert.equal(olderCalls, 2);
});

test('a config-only older slice still extends until the lookback cap', async () => {
  const date = '2026-08-01';
  const calls = [];
  const sync = async options => {
    calls.push(options);
    const files = options.to === date
      ? [bodyWeight(date, 80)]
      : [raw('config/targets.yml', 'target_sets: []\n')];
    return {
      files, warnings: [], commitSha: 'c'.repeat(40),
      manifestId: `r-${calls.length}`, changed: true, freshness: 'confirmed'
    };
  };
  await loadLiveEvents({ sync, loadYaml: load, date });
  assert.equal(calls.length, 3);
  assert.deepEqual(
    { from: calls[1].from, to: calls[1].to },
    { from: '2026-06-26', to: '2026-07-25' }
  );
  assert.equal(calls.at(-1).from, addCalendarDays(date, -39));
});

test('repeated boundary expansion never sends an individual range over 366 days', async () => {
  const calls = [];
  const sync = async ({ from, to }) => {
    calls.push({ from, to });
    const files = [];
    for (let key = from; key <= to; key = addCalendarDays(key, 1)) files.push(workout(key));
    return {
      files,
      warnings: [],
      commitSha: 'c'.repeat(40),
      manifestId: `range-${calls.length}`,
      changed: true,
      freshness: 'confirmed'
    };
  };

  await loadLiveEvents({ sync, loadYaml: load, date: '2026-08-01', maxLookbackDays: 160 });

  assert.ok(calls.every(call => daysBetween(call.from, call.to) < 366));
  assert.deepEqual(calls[0], { from: '2026-07-26', to: '2026-08-01' });
  assert.deepEqual(calls[1], { from: '2026-06-26', to: '2026-07-25' });
  // Windows widen as they go back, and the oldest one lands exactly on the cap.
  assert.ok(daysBetween(calls[2].from, calls[2].to) > daysBetween(calls[1].from, calls[1].to));
  assert.equal(calls.at(-1).from, addCalendarDays('2026-08-01', -159));
  for (let index = 1; index < calls.length; index += 1) {
    assert.equal(calls[index].to, addCalendarDays(calls[index - 1].from, -1));
  }
});

test('backfill windows widen, stay contiguous, and cover the whole lookback without a request per month', () => {
  const date = '2026-08-01';
  const start = addCalendarDays(date, -6);
  const windows = planBackfillWindows(date, start, MAX_LOOKBACK_DAYS);

  assert.ok(windows.length < 20, `expected a handful of windows, planned ${windows.length}`);
  assert.equal(windows[0].to, addCalendarDays(start, -1));
  assert.equal(windows.at(-1).from, addCalendarDays(date, -(MAX_LOOKBACK_DAYS - 1)));
  for (let index = 1; index < windows.length; index += 1) {
    assert.equal(windows[index].to, addCalendarDays(windows[index - 1].from, -1));
  }
  // The manifest endpoint rejects spans of 366 days or more.
  assert.ok(windows.every(window => daysBetween(window.from, window.to) < 366));
});

test('older windows are fetched concurrently but ingested oldest-last', async () => {
  const date = '2026-08-01';
  const started = [];
  const finish = new Map();
  let peak = 0;
  let live = 0;
  const sync = async ({ from, to }) => {
    started.push(from);
    live += 1;
    peak = Math.max(peak, live);
    if (to !== date) await new Promise(resolve => finish.set(from, resolve));
    live -= 1;
    return {
      files: [bodyWeight(to, 80)], warnings: [], commitSha: 'c'.repeat(40),
      manifestId: from, changed: true, freshness: 'confirmed'
    };
  };

  const partials = [];
  const done = loadLiveEvents({
    sync, loadYaml: load, date, maxLookbackDays: 400,
    onPartial: snapshot => partials.push(snapshot.events.at(-1).record.date)
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.ok(peak > 1, 'older windows should overlap in flight');
  // Resolve out of order: the newest window finishes last.
  for (const from of [...finish.keys()].reverse()) finish.get(from)();
  await new Promise(resolve => setImmediate(resolve));
  for (const resolve of finish.values()) resolve();
  await done;

  const ingested = partials.slice(1);
  assert.deepEqual(ingested, [...ingested].sort().reverse());
});

test('a failing window waits for its concurrent siblings before rejecting', async () => {
  const date = '2026-08-01';
  const release = [];
  let settled = 0;
  const sync = async ({ to }) => {
    if (to === date) {
      return {
        files: [bodyWeight(date, 80)], warnings: [], commitSha: 'c'.repeat(40),
        manifestId: to, changed: true, freshness: 'confirmed'
      };
    }
    await new Promise(resolve => release.push(resolve));
    settled += 1;
    throw new Error('aborted');
  };

  const done = loadLiveEvents({ sync, loadYaml: load, date, maxLookbackDays: 400 })
    .then(() => 'resolved', () => 'rejected');
  await new Promise(resolve => setImmediate(resolve));

  const inFlight = release.length;
  assert.ok(inFlight > 1, 'several windows should be in flight');
  for (const resolve of release) resolve();

  assert.equal(await done, 'rejected');
  assert.equal(settled, inFlight, 'every sibling settles before the load unwinds');
});

test('a window that adds nothing does not trigger another parse and repaint', async () => {
  const date = '2026-08-01';
  let parses = 0;
  const loadYaml = content => {
    parses += 1;
    return load(content);
  };
  const sync = async ({ to }) => ({
    files: to === date ? [bodyWeight(date, 80)] : [],
    warnings: [], commitSha: 'c'.repeat(40), manifestId: to, changed: false, freshness: 'confirmed'
  });

  const partials = [];
  await loadLiveEvents({
    sync, loadYaml, date, maxLookbackDays: 400, onPartial: () => partials.push(true)
  });
  const afterEmptyWindows = parses;

  assert.equal(partials.length, 1);
  // The single event is parsed once for the partial and reused for the result.
  assert.equal(afterEmptyWindows, 1);
});

test('exact range snapshots restore a long streak offline across the disjoint-range boundary', async () => {
  const date = '2026-08-01';
  const streakStart = '2025-06-30';
  const snapshots = new Map();
  let online = true;
  let remoteCalls = 0;
  const sync = async ({ from, to }) => {
    const key = `${from}\0${to}`;
    if (!online) {
      const cached = snapshots.get(key);
      if (!cached) throw new Error(`missing exact range ${from}..${to}`);
      return { ...cached, changed: false, freshness: 'fallback' };
    }

    remoteCalls += 1;
    const files = [];
    const first = from < streakStart ? streakStart : from;
    const last = to > date ? date : to;
    for (let keyDate = first; keyDate <= last; keyDate = addCalendarDays(keyDate, 1)) {
      files.push(workout(keyDate));
    }
    const result = {
      files,
      warnings: [],
      commitSha: 'c'.repeat(40),
      manifestId: `range-${remoteCalls}`,
      changed: true,
      freshness: 'confirmed'
    };
    snapshots.set(key, result);
    return result;
  };

  const live = await loadLiveEvents({ sync, loadYaml: load, date, maxLookbackDays: 500 });
  const callsAfterOnline = remoteCalls;
  online = false;
  const cached = await loadLiveEvents({ sync, loadYaml: load, date, maxLookbackDays: 500 });

  assert.ok(callsAfterOnline >= 5, 'streak must cross into a disjoint range request');
  assert.equal(remoteCalls, callsAfterOnline);
  assert.equal(live.events.length, daysBetween(streakStart, date) + 1);
  assert.deepEqual(cached.events.map(event => event.record.date), live.events.map(event => event.record.date));
  assert.equal(cached.freshness, 'fallback');
  assert.equal(cached.changed, false);
});

test('backfill: false syncs only the first seven-day window', async () => {
  const calls = [];
  const date = '2026-08-01';
  const sync = async options => {
    calls.push({ from: options.from, to: options.to });
    return {
      files: [bodyWeight(date, 80)],
      warnings: [],
      commitSha: 'c'.repeat(40),
      manifestId: `range-${calls.length}`,
      changed: true,
      freshness: 'confirmed'
    };
  };

  await loadLiveEvents({ sync, loadYaml: load, date, backfill: false });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { from: '2026-07-26', to: '2026-08-01' });
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

test('exposes parsed config/agents.yml and raw central-node.md content when both are present', async () => {
  const agentsYaml = await readFile(new URL('../../config/agents.yml', import.meta.url), 'utf8');
  const centralNodeMarkdown = '# Purpose\n---\n## ⚡ Today\'s Status\nAll clear.\n';
  const files = [
    raw('config/agents.yml', agentsYaml),
    raw('central-node.md', centralNodeMarkdown)
  ];
  const sync = async () => ({
    files, warnings: [], commitSha: 'c'.repeat(40), manifestId: 'range',
    changed: true, freshness: 'confirmed'
  });

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-08-01' });

  assert.equal(result.agentsConfig.agents.find(agent => agent.slug === 'brisket').colour, '#EEB046');
  assert.equal(result.centralNodeMarkdown, centralNodeMarkdown);
});

test('an unparseable config/agents.yml produces a warning instead of throwing, and central-node.md needs no parsing to fail', async () => {
  const files = [
    raw('config/agents.yml', 'agents: [invalid'),
    raw('central-node.md', 'anything at all is valid markdown here')
  ];
  const sync = async () => ({
    files, warnings: [], commitSha: 'c'.repeat(40), manifestId: 'range',
    changed: true, freshness: 'confirmed'
  });

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-08-01' });

  assert.equal(result.agentsConfig, null);
  assert.equal(result.centralNodeMarkdown, 'anything at all is valid markdown here');
  assert.deepEqual(
    result.warnings.filter(warning => warning.path === 'config/agents.yml'),
    [{ path: 'config/agents.yml', code: 'invalid_agents' }]
  );
});

test('agentsConfig and centralNodeMarkdown default to null when neither file is present', async () => {
  const sync = async () => ({
    files: [], warnings: [], commitSha: 'c'.repeat(40), manifestId: 'range',
    changed: true, freshness: 'confirmed'
  });

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-08-01' });

  assert.equal(result.agentsConfig, null);
  assert.equal(result.centralNodeMarkdown, null);
  assert.equal(result.governanceLogMarkdown, null);
});

test('exposes raw governance-log.md content when present in the sync batch', async () => {
  const governanceLogMarkdown = "# Governance Log\n\n## 2026-08-09 — Drift Detection\n**Status:** Still Active\n\nOpen loop.\n";
  const files = [raw('data/governance/governance-log.md', governanceLogMarkdown)];
  const sync = async () => ({
    files, warnings: [], commitSha: 'c'.repeat(40), manifestId: 'range',
    changed: true, freshness: 'confirmed'
  });

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-08-01' });

  assert.equal(result.governanceLogMarkdown, governanceLogMarkdown);
});

test('backfill walks through empty months so older bloods still load', async () => {
  const date = '2026-08-15';
  const bloods = raw('data/body/2023/03/2023-03-21-bloods.md', `---
schema_version: 1
id: notion-bloods-2023-03-21
type: bloods
date: '2023-03-21'
time: '12:00'
created_at: '2023-03-21T12:00:00+11:00'
updated_at: '2023-03-21T12:00:00+11:00'
source: notion_import
markers:
  - { key: alt, label: ALT, category: Liver Function, value: 40, unit: U/L }
---
Labs`);
  const sync = async ({ from, to }) => {
    const files = [];
    if (from <= date && to >= date) files.push(bodyWeight(date, 80));
    if (from <= '2023-03-21' && to >= '2023-03-21') files.push(bloods);
    return {
      files, warnings: [], commitSha: 'c'.repeat(40),
      manifestId: `${from}`, changed: true, freshness: 'confirmed'
    };
  };
  const result = await loadLiveEvents({
    sync, loadYaml: load, date, maxLookbackDays: 1300
  });
  assert.ok(result.events.some(event => (
    event.record.type === 'bloods' && event.record.date === '2023-03-21'
  )));
});
