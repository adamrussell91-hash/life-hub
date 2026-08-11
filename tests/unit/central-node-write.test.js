import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendRecentAction,
  applyLogToCentralNode,
  buildMealFlagsLine,
  buildNutritionStatusLine,
  formatStatusHeadingDate,
  humanizeDayType,
  replaceTodaysStatus,
  trimCrossAgentSection,
  upsertStatusField
} from '../../js/core/central-node-write.js';

const base = [
  '# Purpose',
  'Intro.',
  '---',
  "## ⚡ Today's Status (Friday 19 June 2026)",
  '**Health:** Stable.',
  '**Nutrition:** No data.',
  '---',
  '## 📝 Recent Agent Actions',
  '**30 Jul:** Chadwick: session logged.'
].join('\n');

test('formatStatusHeadingDate uses en-AU long form', () => {
  assert.match(formatStatusHeadingDate('2026-08-01'), /August 2026/);
});

test('appendRecentAction inserts directly under the Recent Agent Actions heading', () => {
  const next = appendRecentAction(base, '\n**1 Aug:** Brisket Lasso: Logged breakfast.');
  assert.match(next, /## 📝 Recent Agent Actions\n\*\*1 Aug:\*\* Brisket Lasso: Logged breakfast\.\n\*\*30 Jul:\*\*/);
});

test('buildNutritionStatusLine formats totals only', () => {
  assert.equal(
    buildNutritionStatusLine({ calories: 1130, protein_g: 80, fat_g: 27, sodium_mg: 1100 }),
    '**Nutrition:** 1,130 kcal, 80g P, 27g F, 1,100mg Na.'
  );
});

test('buildMealFlagsLine compacts notes into a Flags status line', () => {
  assert.equal(
    buildMealFlagsLine('Coles tofu bowl — on track, solid protein'),
    '**Flags:** Coles tofu bowl — on track, solid protein'
  );
  assert.equal(buildMealFlagsLine('  '), null);
});

test('upsertStatusField replaces an existing field line', () => {
  const body = upsertStatusField('**Health:** Stable.\n**Nutrition:** Old.', 'Nutrition', '**Nutrition:** 400 kcal, 21g P.');
  assert.equal(body, '**Health:** Stable.\n**Nutrition:** 400 kcal, 21g P.');
});

test('replaceTodaysStatus rewrites the dated heading and body', () => {
  const next = replaceTodaysStatus(base, {
    dateKey: '2026-08-01',
    body: '**Nutrition:** 520 kcal, 38g P, 12g F.'
  });
  assert.match(next, /## ⚡ Today's Status \([^)]*1 August 2026\)/);
  assert.match(next, /\*\*Nutrition:\*\* 520 kcal, 38g P, 12g F\./);
  assert.doesNotMatch(next, /No data/);
  assert.match(next, /## 📝 Recent Agent Actions/);
});

test('applyLogToCentralNode appends Recent Actions and refreshes Nutrition on meal logs', () => {
  const next = applyLogToCentralNode(base, {
    record: { type: 'meal', date: '2026-08-01', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 },
    actionLine: '\n**1 Aug:** Brisket Lasso: Logged breakfast (520 kcal, 38g protein, 12g fat).',
    nutritionTotals: { calories: 520, protein_g: 38, fat_g: 12 },
    flagNotes: 'Eggs and toast — on track, solid protein'
  });
  assert.match(next, /## ⚡ Today's Status \([^)]*1 August 2026\)/);
  assert.match(next, /\*\*Nutrition:\*\* 520 kcal, 38g P, 12g F\./);
  assert.match(next, /\*\*Flags:\*\* Eggs and toast — on track, solid protein/);
  assert.match(next, /\*\*1 Aug:\*\* Brisket Lasso: Logged breakfast/);
  assert.match(next, /Chest and Curls|session logged/);
});

test('skincare and body logs can land Flags from notes', () => {
  const nextSkin = applyLogToCentralNode(base, {
    record: { type: 'skincare', date: '2026-08-01', routine: 'am', completed: true },
    actionLine: '\n**1 Aug:** Hyaluronica: Logged am skincare.',
    flagNotes: 'AM stack — looking good, mild tightness'
  });
  assert.match(nextSkin, /\*\*Flags:\*\* AM stack — looking good, mild tightness/);

  const nextBody = applyLogToCentralNode(base, {
    record: { type: 'weight', date: '2026-08-01', weight_kg: 88.2 },
    actionLine: '\n**1 Aug:** Sara: Logged weight.',
    flagNotes: '88.2 kg — stable vs last'
  });
  assert.match(nextBody, /\*\*Health:\*\* Weight 88.2 kg\./);
  assert.match(nextBody, /\*\*Flags:\*\* 88.2 kg — stable vs last/);
});

test('same-day meal log preserves other Status fields', () => {
  const sameDayBase = base.replace('Friday 19 June 2026', 'Saturday 1 August 2026');
  const next = applyLogToCentralNode(sameDayBase, {
    record: { type: 'meal', date: '2026-08-01', meal: 'lunch', calories: 400, protein_g: 40, fat_g: 10 },
    actionLine: '\n**1 Aug:** Brisket Lasso: Logged lunch.',
    nutritionTotals: { calories: 920, protein_g: 78, fat_g: 22 }
  });
  assert.match(next, /\*\*Health:\*\* Stable\./);
  assert.match(next, /\*\*Nutrition:\*\* 920 kcal, 78g P, 22g F\./);
});

test('humanizeDayType matches Home labels', () => {
  assert.equal(humanizeDayType('workout_30'), '30-min Workout');
  assert.equal(humanizeDayType('workout_45_60'), '45–60 min Workout');
  assert.equal(humanizeDayType('movement'), 'Movement day');
});

test('trimCrossAgentSection keeps the newest directives and drops the tail', () => {
  const directives = Array.from({ length: 15 }, (_, index) => `- Directive ${index + 1}.`);
  const base = [
    '## 🤝 Cross-Agent Coordination',
    '*One-line directives only.*',
    ...directives,
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');

  const next = trimCrossAgentSection(base, { maxLines: 12 });
  assert.match(next, /- Directive 1\./);
  assert.match(next, /- Directive 12\./);
  assert.doesNotMatch(next, /- Directive 13\./);
  assert.doesNotMatch(next, /- Directive 15\./);
  // Non-directive content and later sections survive the trim.
  assert.match(next, /\*One-line directives only\.\*/);
  assert.match(next, /## 📝 Recent Agent Actions/);
});

test('trimCrossAgentSection leaves a short section untouched', () => {
  const base = [
    '## 🤝 Cross-Agent Coordination',
    '- Keep me.',
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');
  assert.equal(trimCrossAgentSection(base), base);
});

test('applyLogToCentralNode no longer writes a Day Type directive for completed workouts', () => {
  const base = [
    '# Purpose',
    '---',
    "## ⚡ Today's Status (Wednesday 30 July 2026)",
    '**Exercise:** prior.',
    '---',
    '## 🤝 Cross-Agent Coordination',
    '- Keep me.',
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');
  const record = {
    type: 'workout',
    date: '2026-07-30',
    status: 'completed',
    title: 'Chest and Curls',
    day_type: 'workout_30',
    duration_min: 26
  };
  const next = applyLogToCentralNode(base, {
    record,
    actionLine: '\n**30 Jul:** Chadwick Flexington: Logged a session.'
  });
  // Day Type reaches Brisket via resolveDayType/getDayTargets, not a directive he cannot action.
  assert.doesNotMatch(next, /Set Day Type to/);
  assert.match(next, /- Keep me\./);
  // The honest signal -- what was actually done -- still lands in Status and Recent Actions.
  assert.match(next, /\*\*Exercise:\*\* Chest and Curls · 26 min · completed\./);
  assert.match(next, /\*\*30 Jul:\*\* Chadwick Flexington/);
});
