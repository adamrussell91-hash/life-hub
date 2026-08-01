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
    sodium_mg: 1100,
    calcium_mg: 590,
    polyphenol_score: 9,
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
});

test('rejects a Home model without a display date', () => {
  assert.throws(
    () => buildHomeModel({ events: [], targetsConfig, date: null }),
    /display date/i
  );
});
