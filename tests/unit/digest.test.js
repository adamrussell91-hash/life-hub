import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRecentHistory } from '../../netlify/functions/_shared/digest.mjs';

const targetsConfig = {
  target_sets: [{
    valid_from: '2020-01-01',
    calories: { movement: 1660, workout_30: 1900, workout_45_60: 2200, recovery_bonus: 200 },
    protein: { daily: 120, recovery_daily: 140, breakfast: 30, lunch: 30, dinner: 40, snack: 20, min_per_meal: 25 },
    fat_ceiling_g: 50,
    sodium_ceiling_mg: 2000,
    calcium_target_mg: 1000,
    polyphenol_daily_aim: 10
  }]
};

const meal = `---
schema_version: 1
id: meal-1
type: meal
date: 2026-08-01
time: "07:45"
created_at: 2026-08-01T07:45:00+10:00
updated_at: 2026-08-01T07:45:00+10:00
source: test
meal: breakfast
calories: 520
protein_g: 38
fat_g: 12
---
`;

const fullMeal = `---
schema_version: 1
id: meal-2
type: meal
date: 2026-08-01
time: "18:30"
created_at: 2026-08-01T18:30:00+10:00
updated_at: 2026-08-01T18:30:00+10:00
source: test
meal: dinner
calories: 700
protein_g: 45
fat_g: 20
sodium_mg: 900
calcium_mg: 300
polyphenol_score: 7
omega3: high
---
`;

test("summarizes today's totals, streak, and logging coverage", () => {
  const summary = summarizeRecentHistory(
    [{ path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', content: meal }],
    targetsConfig,
    '2026-08-01'
  );
  assert.match(summary, /520 of 1660 kcal/);
  assert.match(summary, /Logged today: nutrition/);
  assert.match(summary, /Nothing was logged yesterday/);
});

// Brisket is required to fill sodium, calcium, polyphenol_score and omega3 on every meal.
// Before 2026-08-11 none of them came back to him, so protocol rules keyed off day totals
// (the polyphenol bands, the omega-3 check) could only ever be answered by confabulation.
test('surfaces the micronutrient day totals Brisket is required to log', () => {
  const summary = summarizeRecentHistory(
    [{ path: 'data/nutrition/2026/08/2026-08-01-dinner.md', content: fullMeal }],
    targetsConfig,
    '2026-08-01'
  );
  assert.match(summary, /900 of 2000 mg sodium ceiling/);
  assert.match(summary, /300 of 1000 mg calcium target/);
  assert.match(summary, /polyphenol score 7 against a daily aim of 10/);
  assert.match(summary, /Omega-3 across today's meals: 1 high/);
});

test('reports protein by meal slot so empty slots are visible', () => {
  const summary = summarizeRecentHistory(
    [{ path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', content: meal }],
    targetsConfig,
    '2026-08-01'
  );
  assert.match(summary, /breakfast 38 g/);
  assert.match(summary, /lunch not logged \(guide 30 g\)/);
  assert.match(summary, /dinner not logged \(guide 40 g\)/);
});

test('reports no omega-3 tally when nothing is logged yet', () => {
  const summary = summarizeRecentHistory([], targetsConfig, '2026-08-01');
  assert.match(summary, /Omega-3 across today's meals: no meals logged yet/);
});

test('skips a file that fails validation instead of throwing', () => {
  const summary = summarizeRecentHistory(
    [{ path: 'data/nutrition/2026/08/2026-08-01-broken.md', content: '---\ntype: meal\n---' }],
    targetsConfig,
    '2026-08-01'
  );
  assert.match(summary, /0 of 1660 kcal/);
});
