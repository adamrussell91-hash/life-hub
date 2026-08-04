import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendRecentAction,
  applyLogToCentralNode,
  buildNutritionStatusLine,
  formatStatusHeadingDate,
  replaceTodaysStatus,
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
    nutritionTotals: { calories: 520, protein_g: 38, fat_g: 12 }
  });
  assert.match(next, /## ⚡ Today's Status \([^)]*1 August 2026\)/);
  assert.match(next, /\*\*Nutrition:\*\* 520 kcal, 38g P, 12g F\./);
  assert.match(next, /\*\*1 Aug:\*\* Brisket Lasso: Logged breakfast/);
  assert.match(next, /Chest and Curls|session logged/);
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
