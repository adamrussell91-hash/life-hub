import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { loadEventManifest } from '../../apps/life/js/app/load-events.js';
import { buildHomeModel, selectDisplayDate } from '../../apps/life/js/app/home-model.js';
import { buildHomeForecastCards } from '../../apps/life/js/app/home-forecast.js';
import { TARGETS_CONFIG } from '../../netlify/functions/_shared/targets-config.mjs';

const manifest = JSON.parse(await readFile(new URL('../../fixtures/manifest.json', import.meta.url)));
const targetsConfig = load(await readFile(new URL('../../config/targets.yml', import.meta.url), 'utf8'));
const fetchImpl = async url => {
  if (url === '/fixtures/manifest.json') {
    return { ok: true, json: async () => manifest };
  }
  const entry = manifest.files.find(file => file.url === url);
  if (!entry) return { ok: false, status: 404 };
  return {
    ok: true,
    text: async () => readFile(new URL(`../..${url}`, import.meta.url), 'utf8')
  };
};

test('selects the greatest fixture event date', async () => {
  const { events } = await loadEventManifest({ fetchImpl, loadYaml: load });

  assert.equal(selectDisplayDate(events), '2026-07-30');
  assert.equal(selectDisplayDate([]), null);
});

test('builds the approved Home fixture model through core modules', async () => {
  const { events } = await loadEventManifest({ fetchImpl, loadYaml: load });
  const model = buildHomeModel({
    events,
    targetsConfig,
    date: selectDisplayDate(events)
  });

  assert.equal(model.nutrition.calories, 1130);
  assert.equal(model.nutrition.protein_g, 80);
  assert.equal(model.nutrition.fat_g, 27);
  assert.equal(model.nutrition.carbs_g, 100);
  assert.equal(model.nutrition.sodium_mg, 1100);
  assert.equal(model.nutrition.calcium_mg, 590);
  assert.equal(model.nutrition.polyphenol_score, 9);
  assert.deepEqual(model.nutrition.omega3, { high: 0, medium: 1, low: 1, none: 0 });
  assert.deepEqual(model.nutrition.meals, {
    breakfast: { protein_g: 38 },
    lunch: { protein_g: 42 },
    dinner: { protein_g: 0 },
    snack: { protein_g: 0 },
    dessert: { protein_g: 0 }
  });
  assert.equal(model.targets.calories, 1900);
  assert.equal(model.dayType, 'workout_30');
  assert.deepEqual(model.progress, {
    calories: 59,
    protein: 67,
    fat: 54
  });
  assert.ok(model.forecastCards?.paths);
  assert.ok(model.forecastCards?.stimulus);
  assert.ok(model.forecastCards?.scale);
  assert.match(model.forecastCards.paths.asLogged.status, /locked|dated|will_not_arrive|complete/);
  assert.match(model.forecastCards.stimulus.rate, /loaded|No loaded/i);
});

test('rejects a Home model without a display date', () => {
  assert.throws(
    () => buildHomeModel({ events: [], targetsConfig, date: null }),
    /display date/i
  );
});

test('a repository with no config/targets.yml yet renders zeroed targets instead of crashing', () => {
  const model = buildHomeModel({ events: [], targetsConfig: null, date: '2026-08-03' });

  assert.deepEqual(model.targets, {
    calories: 0,
    protein_g: 0,
    fat_ceiling_g: 0,
    sodium_ceiling_mg: 0,
    calcium_target_mg: 0,
    polyphenol_daily_aim: 0,
    meal_protein_g: { breakfast: 0, lunch: 0, dinner: 0, snack: 0, dessert: 0, minimum: 0 }
  });
  assert.deepEqual(model.progress, { calories: 0, protein: 0, fat: 0 });
  assert.equal(model.overFatCeiling, false);
  assert.equal(model.forecastCards.paths.asLogged.status, 'locked');
});

test('overFatCeiling is true on Home when fat exceeds the daily ceiling', () => {
  const heavyToday = [{
    record: {
      type: 'meal', date: '2026-07-30', meal: 'dinner',
      calories: 800, protein_g: 40, fat_g: 55,
      sodium_mg: 100, calcium_mg: 50, polyphenol_score: 1
    },
    body: '', path: '', legacy: false
  }];
  const model = buildHomeModel({ events: heavyToday, targetsConfig, date: '2026-07-30' });
  assert.equal(model.nutrition.fat_g, 55);
  assert.equal(model.targets.fat_ceiling_g, 50);
  assert.equal(model.overFatCeiling, true);
});

test('overFatCeiling is false on Home when fat is within the ceiling', async () => {
  const { events } = await loadEventManifest({ fetchImpl, loadYaml: load });
  const model = buildHomeModel({
    events,
    targetsConfig,
    date: selectDisplayDate(events)
  });
  assert.equal(model.nutrition.fat_g, 27);
  assert.equal(model.overFatCeiling, false);
});

test('hammondLine surfaces the latest Hammond review note', () => {
  const log = [
    '# Governance Log',
    '',
    '## 2026-03-10 — Mind Insight',
    '**Title:** Mar 2026 — Pattern Review: First Year',
    '',
    'Historical synthesis.',
    '',
    '## 2026-08-09 — Weekly Review',
    '**Title:** Lock is marking',
    '',
    'Protein held; one lock.',
    ''
  ].join('\n');
  const model = buildHomeModel({
    events: [],
    targetsConfig,
    date: '2026-08-11',
    governanceLogMarkdown: log
  });
  assert.equal(model.hammondLine, 'Hammond: Lock is marking');
});

test('hammondLine is null when there is no recent Hammond review', () => {
  const model = buildHomeModel({
    events: [],
    targetsConfig,
    date: '2026-08-11',
    governanceLogMarkdown: '# Governance Log\n'
  });
  assert.equal(model.hammondLine, null);
});

test('hammondLine ignores a rotting Pattern Review and a stale review', () => {
  const log = [
    '# Governance Log',
    '',
    '## 2026-03-10 — Mind Insight',
    '**Title:** Mar 2026 — Pattern Review: First Year',
    '',
    'Historical synthesis.',
    '',
    '## 2026-05-24 — Drift Detection',
    '**Title:** MEd Sem 2',
    '**Status:** Still Active',
    '',
    'Unactioned.',
    '',
    '## 2026-07-01 — Weekly Review',
    '**Title:** Old week',
    '',
    'Too old to show on Home.',
    ''
  ].join('\n');
  const model = buildHomeModel({
    events: [],
    targetsConfig,
    date: '2026-08-11',
    governanceLogMarkdown: log
  });
  assert.equal(model.hammondLine, null);
});

function meal(date, calories = 1700, protein_g = 145) {
  return { type: 'meal', date, meal: 'dinner', calories, protein_g };
}

function datePlus(start, days) {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test('home forecast cards surface dated paths from a covered history and never invent zero intake', () => {
  const records = [];
  for (let i = 0; i < 28; i++) records.push(meal(datePlus('2026-08-25', i)));
  const weightDates = [0, 4, 8, 12, 16, 20, 24, 27];
  weightDates.forEach((offset, i) => {
    records.push({
      type: i === weightDates.length - 1 ? 'composition' : 'weight',
      date: datePlus('2026-08-25', offset),
      weight_kg: 90 - i * 0.4,
      ...(i === weightDates.length - 1 ? { body_fat_pct: 20 } : {})
    });
  });
  for (const offset of [1, 4, 8, 11, 15, 18, 22, 25]) {
    records.push({
      type: 'workout',
      date: datePlus('2026-08-25', offset),
      status: 'completed',
      session_kind: 'strength',
      day_type: 'workout_30',
      focus: ['chest'],
      exercises: [{
        name: 'Bar Press',
        sets: Array.from({ length: 5 }, (_, i) => ({
          weight_kg: 40 + i,
          reps: 10,
          cable_type: 'constant_force'
        }))
      }]
    });
  }

  const cards = buildHomeForecastCards({
    events: records,
    date: '2026-09-21',
    targetsConfig: TARGETS_CONFIG
  });
  assert.notEqual(cards.paths.asLogged.status, 'locked');
  assert.notEqual(cards.paths.onPlan.status, 'locked');
  assert.match(cards.stimulus.rate, /\/week loaded/);
  assert.equal(cards.stimulus.leanPreservationSupported, true);
  assert.match(cards.scale.headline, /kg/);
});

test('empty window keeps paths locked and does not treat silence as zero kcal', () => {
  const cards = buildHomeForecastCards({
    events: [],
    date: '2026-09-21',
    targetsConfig: TARGETS_CONFIG
  });
  assert.equal(cards.paths.asLogged.status, 'locked');
  assert.equal(cards.paths.onPlan.status, 'locked');
  assert.doesNotMatch(cards.paths.detail, /\b0\s*kcal\b/i);
  assert.match(cards.stimulus.rate, /No loaded sessions/i);
  assert.match(cards.scale.headline, /No usable scale/i);
});
