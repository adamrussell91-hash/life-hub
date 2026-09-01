import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCentralNodeModel } from '../../apps/life/js/app/central-node-model.js';

const records = [
  { type: 'meal', date: '2026-07-30', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420, calcium_mg: 380, polyphenol_score: 6 },
  { type: 'meal', date: '2026-07-30', meal: 'lunch', calories: 610, protein_g: 42, fat_g: 15, sodium_mg: 680, calcium_mg: 210, polyphenol_score: 3 },
  { type: 'workout', date: '2026-07-30', status: 'completed', day_type: 'workout_30', recovery_flag_next_day: false },
  { type: 'diary', date: '2026-07-30', mood_score: 7 },
  { type: 'meal', date: '2026-07-24', meal: 'breakfast', calories: 300, protein_g: 140, fat_g: 10, sodium_mg: 100, calcium_mg: 50, polyphenol_score: 1 },
  { type: 'workout', date: '2026-07-24', status: 'completed', day_type: 'movement', recovery_flag_next_day: false },
  { type: 'diary', date: '2026-07-24', mood_score: 8 },
  { type: 'weight', date: '2026-07-24', weight_kg: 80 },
  { type: 'skincare', date: '2026-07-24', routine: 'am' },
  { type: 'workout', date: '2026-07-29', status: 'completed', day_type: 'movement', recovery_flag_next_day: false }
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

const markdown = `# Purpose
Intro text.
---
## 🔴 Current Constraints & Priorities
- Constraint line
---
## ⚡ Today's Status (Thursday 30 July 2026)
**Health:** Stable today.
---
## 📅 This Week (27 Jul – 2 Aug 2026)
**Key Events:**
- Thu 30: Chest and Curls session logged.
---
## 📊 This Month (July 2026)
**Active Goals:**
- Maintain workout streak (High)
---
## 📈 Long-Term Trends & Patterns
**Nutrition:** Protein target consistency improving.
---
## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: 30 Jul session completed.
---
## 📝 Recent Agent Actions
**30 Jul:** Chadwick: Chest and Curls session completed and logged.
`;

test('builds the seven markdown sections from central-node.md via js/core/constraints.js', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.match(model.sections.constraints, /Constraint line/);
  assert.match(model.sections.todaysStatus, /Stable today/);
  assert.match(model.sections.thisWeek, /Chest and Curls session logged/);
  assert.match(model.sections.thisMonth, /Maintain workout streak/);
  assert.match(model.sections.longTermTrends, /Protein target consistency improving/);
  assert.match(model.sections.crossAgentCoordination, /Chadwick→Brisket/);
  assert.match(model.sections.recentAgentActions, /Chest and Curls session completed and logged/);
});

test('Recent Agent Actions display collapses stacked same-action clones', () => {
  const spam = `${markdown}
**29 Aug:** Chadwick Flexington: Logged a 30-min workout_30 session (Biceps and Boobs, 20 mins).
**29 Aug:** Chadwick Flexington: Logged a workout_30 session (Biceps and Boobs, 20 mins).
**29 Aug:** Chadwick Flexington: Logged a workout_30 session (Biceps and Boobs, 20 mins).
`;
  const model = buildCentralNodeModel({
    events,
    targetsConfig,
    centralNodeMarkdown: spam,
    date: '2026-07-30'
  });
  assert.equal(
    model.sections.recentAgentActions.split('\n').filter(line => line.includes('Biceps and Boobs')).length,
    1
  );
});

test('builds today\'s logging completeness the same way Home does', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.deepEqual(model.completeness, {
    nutrition: true,
    fitness: true,
    diary: true,
    body: false,
    skincare: false,
    complete: 3,
    total: 5
  });
});

test('liveStatus exposes checklist flags and macro snapshot from events', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.equal(model.liveStatus.completeness.nutrition, true);
  assert.equal(model.liveStatus.snapshot.protein_g, 80);
  assert.equal(model.liveStatus.snapshot.calories, 1130);
  assert.match(model.sections.todaysStatus, /Stable today/);
});

test('builds a 7-day protein series ending on the display date, for the reused sparkline component', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.deepEqual(model.week, [
    { date: '2026-07-24', protein_g: 140 },
    { date: '2026-07-25', protein_g: 0 },
    { date: '2026-07-26', protein_g: 0 },
    { date: '2026-07-27', protein_g: 0 },
    { date: '2026-07-28', protein_g: 0 },
    { date: '2026-07-29', protein_g: 0 },
    { date: '2026-07-30', protein_g: 80 }
  ]);
});

test('builds a 30-day logging-density series where a day only hits when all 5 categories were logged', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.equal(model.loggingMonth.length, 30);
  assert.equal(model.loggingMonth[0].date, '2026-07-01');
  assert.equal(model.loggingMonth.at(-1).date, '2026-07-30');
  assert.deepEqual(model.loggingMonth.find(day => day.date === '2026-07-24'), { date: '2026-07-24', complete: true });
  assert.deepEqual(model.loggingMonth.find(day => day.date === '2026-07-30'), { date: '2026-07-30', complete: false });
  assert.equal(model.loggingMonth.filter(day => day.complete).length, 1);
});

test('builds a 30-day exercise-consistency series from completed workout records', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.equal(model.exerciseMonth.length, 30);
  const completedDates = model.exerciseMonth.filter(day => day.completed).map(day => day.date);
  assert.deepEqual(completedDates, ['2026-07-24', '2026-07-29', '2026-07-30']);
});

test('builds a 30-day eating-target-consistency series requiring both the protein target and the fat ceiling to be met', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  // 07-24: protein 140 >= 120 (movement target) and fat 10 <= 50 -- a hit.
  // 07-30: protein 80 < 120 (workout_30 target) -- not a hit, despite fat 27 <= 50.
  // 07-29: a completed workout day with no meals logged at all -- not a hit.
  assert.equal(model.eatingMonth.length, 30);
  const hitDates = model.eatingMonth.filter(day => day.hitEatingTargets).map(day => day.date);
  assert.deepEqual(hitDates, ['2026-07-24']);
});

test('eatingMonth applies the higher recovery-day protein target when the prior day had a recovery-flagged workout', () => {
  const recoveryRecords = [
    { type: 'workout', date: '2026-07-29', status: 'completed', day_type: 'movement', recovery_flag_next_day: true },
    { type: 'meal', date: '2026-07-30', meal: 'lunch', calories: 500, protein_g: 130, fat_g: 20, sodium_mg: 300, calcium_mg: 100, polyphenol_score: 2 }
  ];
  const recoveryEvents = recoveryRecords.map(record => ({ record, body: '', path: '', legacy: false }));

  const model = buildCentralNodeModel({
    events: recoveryEvents,
    targetsConfig,
    centralNodeMarkdown: '',
    date: '2026-07-30'
  });

  const day = model.eatingMonth.find(entry => entry.date === '2026-07-30');
  // 130g protein clears the normal 120g target but NOT the 140g recovery target --
  // if this asserted true, it would mean the model ignored the recovery bonus.
  assert.equal(day.hitEatingTargets, false);
});

test('rejects a Central Node model without a display date', () => {
  assert.throws(
    () => buildCentralNodeModel({ events: [], targetsConfig, centralNodeMarkdown: '', date: null }),
    /display date/i
  );
});

test('a repository with no central-node.md or config/targets.yml yet renders empty sections and all-false consistency series instead of crashing', () => {
  const model = buildCentralNodeModel({ events: [], targetsConfig: null, centralNodeMarkdown: null, date: '2026-08-03' });

  assert.deepEqual(model.sections, {
    constraints: '',
    todaysStatus: '',
    thisWeek: '',
    thisMonth: '',
    longTermTrends: '',
    crossAgentCoordination: '',
    recentAgentActions: ''
  });
  assert.equal(model.loggingMonth.every(day => day.complete === false), true);
  assert.equal(model.exerciseMonth.every(day => day.completed === false), true);
  assert.equal(model.eatingMonth.every(day => day.hitEatingTargets === false), true);
});
