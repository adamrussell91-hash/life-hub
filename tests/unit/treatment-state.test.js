import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProcedureBody,
  formatTreatmentStateForPrompt,
  formatNutritionSkinWeekForPrompt,
  selectRecentSkincareEntries,
  selectRecentNutritionEntries
} from '../../netlify/functions/_shared/treatment-state.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import {
  constraintsNeedClinicalContext,
  formatSaraClinicalContextForPrompt
} from '../../netlify/functions/_shared/sara-clinical-context.mjs';

test('isProcedureBody only matches Procedure: prefix', () => {
  assert.equal(isProcedureBody('Procedure: Laser'), true);
  assert.equal(isProcedureBody('AM stack — looking good'), false);
  assert.equal(isProcedureBody('Other: serum'), false);
});

test('formatTreatmentStateForPrompt names a recent Procedure: log', () => {
  const text = formatTreatmentStateForPrompt({
    procedureEvents: [
      {
        body: 'Procedure: Laser resurfacing\nNotes',
        record: { date: '2026-09-02' },
        path: 'data/skincare/2026/09/2026-09-02-laser.md'
      }
    ],
    constraintsText: '',
    today: '2026-09-05'
  });
  assert.match(text, /Laser resurfacing/);
  assert.match(text, /14-day/);
});

test('ordinary non-Procedure skincare does not trigger treatment window', () => {
  const text = formatTreatmentStateForPrompt({
    procedureEvents: [
      {
        body: 'AM routine with SPF',
        record: { date: '2026-09-03' },
        path: 'data/skincare/2026/09/2026-09-03-am.md'
      }
    ],
    constraintsText: '',
    today: '2026-09-05'
  });
  assert.match(text, /no active treatment window/i);
});

test('nutrition skin week summarises bounded meals', () => {
  const text = formatNutritionSkinWeekForPrompt({
    mealRecords: [
      { type: 'meal', date: '2026-09-04', calcium_mg: 200, protein_g: 80, fat_g: 40, omega3: 'low' },
      { type: 'meal', date: '2026-09-03', calcium_mg: 100, protein_g: 60, fat_g: 30, omega3: 'none' }
    ],
    today: '2026-09-05'
  });
  assert.match(text, /calcium/i);
  assert.match(text, /protein/i);
});

test('selectors only return dated paths inside the lookback window', () => {
  const tree = [
    { type: 'blob', path: 'data/skincare/2026/09/2026-09-04-am.md', sha: 'a' },
    { type: 'blob', path: 'data/skincare/2026/08/2026-08-01-old.md', sha: 'b' },
    { type: 'blob', path: 'data/nutrition/2026/09/2026-09-04-lunch.md', sha: 'c' },
    { type: 'blob', path: 'readme.md', sha: 'd' }
  ];
  const skin = selectRecentSkincareEntries(tree, { today: '2026-09-05' });
  const food = selectRecentNutritionEntries(tree, { today: '2026-09-05' });
  assert.deepEqual(
    skin.map((e) => e.path),
    ['data/skincare/2026/09/2026-09-04-am.md']
  );
  assert.deepEqual(
    food.map((e) => e.path),
    ['data/nutrition/2026/09/2026-09-04-lunch.md']
  );
});

test('hyaluronica prompt receives treatment + nutrition blocks; chadwick does not', () => {
  const hyal = buildSystemPrompt({
    slug: 'hyaluronica',
    treatmentState: 'TREATMENT_STATE_MARKER',
    nutritionSkinWeek: 'NUTRITION_SKIN_MARKER'
  });
  assert.match(hyal, /TREATMENT_STATE_MARKER/);
  assert.match(hyal, /NUTRITION_SKIN_MARKER/);
  const chadwick = buildSystemPrompt({
    slug: 'chadwick',
    treatmentState: 'TREATMENT_STATE_MARKER',
    nutritionSkinWeek: 'NUTRITION_SKIN_MARKER'
  });
  assert.doesNotMatch(chadwick, /TREATMENT_STATE_MARKER/);
  assert.doesNotMatch(chadwick, /NUTRITION_SKIN_MARKER/);
});

test('sara clinical context is Constraints-gated', () => {
  assert.equal(constraintsNeedClinicalContext('osteopenia on DEXA'), true);
  assert.equal(constraintsNeedClinicalContext('sleep hygiene'), false);
  const empty = formatSaraClinicalContextForPrompt({
    constraintsText: 'sleep hygiene',
    mealRecords: [{ type: 'meal', date: '2026-09-04', calcium_mg: 200, protein_g: 90 }],
    workoutRecords: [{ date: '2026-09-03', title: 'Lower' }],
    today: '2026-09-05'
  });
  assert.equal(empty, '');
  const live = formatSaraClinicalContextForPrompt({
    constraintsText: 'Iron infusion follow-up pending',
    mealRecords: [{ type: 'meal', date: '2026-09-04', calcium_mg: 200, protein_g: 90 }],
    workoutRecords: [{ date: '2026-09-03', title: 'Lower' }],
    today: '2026-09-05'
  });
  assert.match(live, /iron/i);
  assert.match(live, /calcium/);
  assert.doesNotMatch(live, /2026-03-06/);
});

test('sara prompt injects body state + clinical context', () => {
  const prompt = buildSystemPrompt({
    slug: 'sara',
    bodyState: 'BODY_STATE_MARKER',
    saraClinicalContext: 'CLINICAL_MARKER'
  });
  assert.match(prompt, /BODY_STATE_MARKER/);
  assert.match(prompt, /CLINICAL_MARKER/);
});
