import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { loadEventManifest } from '../../js/app/load-events.js';
import { buildHomeModel, selectDisplayDate } from '../../js/app/home-model.js';

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

  assert.deepEqual(model.nutrition, {
    calories: 1130,
    protein_g: 80,
    fat_g: 27,
    carbs_g: 100,
    sodium_mg: 1100,
    calcium_mg: 590,
    polyphenol_score: 9,
    omega3: { high: 0, medium: 1, low: 1, none: 0 },
    meals: {
      breakfast: { protein_g: 38 },
      lunch: { protein_g: 42 },
      dinner: { protein_g: 0 },
      snack: { protein_g: 0 }
    }
  });
  assert.equal(model.targets.calories, 1900);
  assert.equal(model.dayType, 'workout_30');
  assert.equal(model.workoutStreak, 1);
  assert.deepEqual(model.progress, {
    calories: 59,
    protein: 67,
    fat: 54,
    logging: 60
  });
  assert.equal(model.weekDays.length, 7);
  assert.equal(model.weekDays.at(-1).date, '2026-07-30');
  assert.equal(model.weekDays.at(-1).isToday, true);
  assert.match(model.weekSummary.headline, /logged this week|quiet start/i);
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
    meal_protein_g: { breakfast: 0, lunch: 0, dinner: 0, snack: 0, minimum: 0 }
  });
  assert.deepEqual(model.progress, { calories: 0, protein: 0, fat: 0, logging: 0 });
  assert.equal(model.overFatCeiling, false);
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
