import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePeriods } from '../../js/core/trends.js';
import {
  buildNutritionModel,
  PROTEIN_TREND_CONFIG,
  polyphenolVsAim
} from '../../js/app/nutrition-model.js';

const records = [
  { type: 'meal', date: '2026-07-30', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420, calcium_mg: 380, polyphenol_score: 6 },
  { type: 'meal', date: '2026-07-30', meal: 'lunch', calories: 610, protein_g: 42, fat_g: 15, sodium_mg: 680, calcium_mg: 210, polyphenol_score: 3 },
  { type: 'meal', date: '2026-07-24', meal: 'breakfast', calories: 300, protein_g: 140, fat_g: 10, sodium_mg: 100, calcium_mg: 50, polyphenol_score: 1 },
  { type: 'meal', date: '2026-07-27', meal: 'lunch', calories: 400, protein_g: 60, fat_g: 12, sodium_mg: 200, calcium_mg: 80, polyphenol_score: 2 },
  { type: 'meal', date: '2026-07-20', meal: 'lunch', calories: 500, protein_g: 210, fat_g: 20, sodium_mg: 300, calcium_mg: 100, polyphenol_score: 4 }
];
const events = records.map(record => ({ record, body: '', path: '', legacy: false }));

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

test('builds today\'s macros, day type, and full target profile from the existing core primitives', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });

  assert.deepEqual(model.nutrition, {
    calories: 1130,
    protein_g: 80,
    fat_g: 27,
    carbs_g: 0,
    sodium_mg: 1100,
    calcium_mg: 590,
    polyphenol_score: 9,
    omega3: { high: 0, medium: 0, low: 0, none: 0 },
    meals: {
      breakfast: { protein_g: 38 },
      lunch: { protein_g: 42 },
      dinner: { protein_g: 0 },
      snack: { protein_g: 0 }
    }
  });
  assert.equal(model.dayType, 'movement');
  assert.deepEqual(model.targets, {
    calories: 1660,
    protein_g: 120,
    fat_ceiling_g: 50,
    sodium_ceiling_mg: 2000,
    calcium_target_mg: 1000,
    polyphenol_daily_aim: 10,
    meal_protein_g: { breakfast: 30, lunch: 30, dinner: 40, snack: 20, minimum: 25 }
  });
});

test('builds a 7-day series ending on the display date, with each day\'s own protein target and hit/miss', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });

  assert.deepEqual(model.week, [
    { date: '2026-07-24', calories: 300, protein_g: 140, fat_g: 10, carbs_g: 0, proteinTarget: 120, fatCeiling: 50, hitProtein: true, overFatCeiling: false, proteinPct: 117 },
    { date: '2026-07-25', calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, proteinTarget: 120, fatCeiling: 50, hitProtein: false, overFatCeiling: false, proteinPct: 0 },
    { date: '2026-07-26', calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, proteinTarget: 120, fatCeiling: 50, hitProtein: false, overFatCeiling: false, proteinPct: 0 },
    { date: '2026-07-27', calories: 400, protein_g: 60, fat_g: 12, carbs_g: 0, proteinTarget: 120, fatCeiling: 50, hitProtein: false, overFatCeiling: false, proteinPct: 50 },
    { date: '2026-07-28', calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, proteinTarget: 120, fatCeiling: 50, hitProtein: false, overFatCeiling: false, proteinPct: 0 },
    { date: '2026-07-29', calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, proteinTarget: 120, fatCeiling: 50, hitProtein: false, overFatCeiling: false, proteinPct: 0 },
    { date: '2026-07-30', calories: 1130, protein_g: 80, fat_g: 27, carbs_g: 0, proteinTarget: 120, fatCeiling: 50, hitProtein: false, overFatCeiling: false, proteinPct: 67 }
  ]);
});

test('builds a 30-day series ending on the display date, within the same window Home already loads', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });

  assert.equal(model.month.length, 30);
  assert.equal(model.month[0].date, '2026-07-01');
  assert.equal(model.month.at(-1).date, '2026-07-30');
  assert.deepEqual(model.month.find(day => day.date === '2026-07-24'), {
    date: '2026-07-24', calories: 300, protein_g: 140, fat_g: 10, carbs_g: 0, proteinTarget: 120, fatCeiling: 50, hitProtein: true, overFatCeiling: false, proteinPct: 117
  });
});

test('compares this week\'s average protein against the previous week\'s using trends.js, not a reimplementation', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });

  // This week: (140 + 0 + 0 + 60 + 0 + 0 + 80) / 7 = 40. Previous week (07-17..07-23): 210 / 7 = 30.
  assert.deepEqual(model.proteinTrend, comparePeriods(40, 30, PROTEIN_TREND_CONFIG));
});

test('polyphenolVsAim labels score against aim without pretending it is a percent', () => {
  assert.deepEqual(polyphenolVsAim(14, 10), { delta: 4, label: '+4 vs aim', colour: 'green' });
  assert.deepEqual(polyphenolVsAim(8, 10), { delta: -2, label: '−2 vs aim', colour: 'muted' });
  assert.deepEqual(polyphenolVsAim(10, 10), { delta: 0, label: 'at aim', colour: 'green' });
  assert.deepEqual(polyphenolVsAim(3, 0), { delta: 0, label: 'at aim', colour: 'muted' });
});

test('marks week days that exceed the fat ceiling', () => {
  const heavy = [
    ...events,
    {
      record: {
        type: 'meal', date: '2026-07-29', meal: 'dinner',
        calories: 900, protein_g: 40, fat_g: 60,
        sodium_mg: 100, calcium_mg: 50, polyphenol_score: 1
      },
      body: '', path: '', legacy: false
    }
  ];
  const model = buildNutritionModel({ events: heavy, targetsConfig, date: '2026-07-30' });
  const over = model.week.find(day => day.date === '2026-07-29');
  assert.equal(over.fat_g, 60);
  assert.equal(over.overFatCeiling, true);
  assert.equal(model.week.find(day => day.date === '2026-07-30').overFatCeiling, false);
  assert.equal(model.overFatCeiling, false);
});

test('today overFatCeiling is true when fat exceeds ceiling', () => {
  const heavyToday = [{
    record: {
      type: 'meal', date: '2026-07-30', meal: 'dinner',
      calories: 800, protein_g: 40, fat_g: 55,
      sodium_mg: 100, calcium_mg: 50, polyphenol_score: 1
    },
    body: '', path: '', legacy: false
  }];
  const model = buildNutritionModel({ events: heavyToday, targetsConfig, date: '2026-07-30' });
  assert.equal(model.nutrition.fat_g, 55);
  assert.equal(model.overFatCeiling, true);
  assert.equal(model.polyphenolVsAim.label, '−9 vs aim'); // score 1, aim 10
});

test('exposes mealsToday and written macro split for the display date', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });
  assert.equal(model.mealsToday.length, 2);
  assert.equal(model.mealsToday[0].meal, 'breakfast');
  assert.equal(model.macroSplit.protein_g, 80);
  assert.equal(model.macroSplit.proteinTarget, 120);
  assert.equal(model.macroSplit.proteinPct, 67);
});

test('exposes previousWeek series for comparison columns', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });
  assert.equal(model.previousWeek.length, 7);
  assert.equal(typeof model.previousWeek[0].protein_g, 'number');
});

test('rejects a Nutrition model without a display date', () => {
  assert.throws(
    () => buildNutritionModel({ events: [], targetsConfig, date: null }),
    /display date/i
  );
});

test('a repository with no config/targets.yml yet renders zeroed targets and untargeted days instead of crashing', () => {
  const model = buildNutritionModel({ events: [], targetsConfig: null, date: '2026-08-03' });

  assert.deepEqual(model.targets, {
    calories: 0,
    protein_g: 0,
    fat_ceiling_g: 0,
    sodium_ceiling_mg: 0,
    calcium_target_mg: 0,
    polyphenol_daily_aim: 0,
    meal_protein_g: { breakfast: 0, lunch: 0, dinner: 0, snack: 0, minimum: 0 }
  });
  assert.equal(model.week.every(day => day.proteinTarget === 0 && day.hitProtein === false), true);
  assert.equal(model.month.every(day => day.proteinTarget === 0 && day.hitProtein === false), true);
});

test('day-specific day type and recovery bonus resolve per day within the week series, not from the display date', () => {
  const eventsWithWorkout = [
    ...events,
    { record: { type: 'workout', date: '2026-07-25', status: 'completed', day_type: 'workout_45_60', recovery_flag_next_day: true, exercises: [] }, body: '', path: '', legacy: false }
  ];

  const model = buildNutritionModel({ events: eventsWithWorkout, targetsConfig, date: '2026-07-30' });

  const workoutDay = model.week.find(day => day.date === '2026-07-25');
  const recoveryDay = model.week.find(day => day.date === '2026-07-26');
  const laterDay = model.week.find(day => day.date === '2026-07-27');

  // Protein target only changes via the recovery bonus, never day_type directly (targets.js), so
  // the workout day itself (not yet recovery-flagged) keeps the standard target...
  assert.equal(workoutDay.proteinTarget, 120);
  // ...but the day AFTER a recovery-flagged workout gets the higher recovery target...
  assert.equal(recoveryDay.proteinTarget, 140);
  // ...and a day two days out is back to standard -- proving resolution is genuinely per-day,
  // not a single value computed once from the display date (2026-07-30, which has no workout
  // logged and would give every day proteinTarget: 120 if the loop had a copy-paste bug reusing
  // the outer date instead of each day's own).
  assert.equal(laterDay.proteinTarget, 120);
});
