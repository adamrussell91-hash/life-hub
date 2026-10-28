// tests/unit/collaboration-book-techniques.test.js
// The Collaboration Book's tools: registration and integrity, the shelves they may and may not
// appear on, the two variants (Postmortem on the after action review, Corporate Culture on the
// Maslow pyramids), the merges folded in, the sensitive-model rules, Agree and Review, and a
// driver that works every model through the real machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { BOOK_STEPS, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { MODEL_IDS } from '../../packages/problem-solver/models.mjs';
import { isComplete } from '../../packages/problem-solver/machine.mjs';
import { workThrough } from '../../packages/decision-book/work-through.mjs';
import { COLLAB_TOOLS } from '../../packages/collaboration-book/tools/index.mjs';
import { cbCommit } from '../../packages/collaboration-book/tools/commit.mjs';
import { cbReview } from '../../packages/collaboration-book/tools/review.mjs';
import { CATALOGUE, entry } from '../../packages/collaboration-book/catalogue.mjs';

const T = COLLAB_TOOLS;
const ids = (list) => list.map((item) => item.id);
const coaching = (def) => [def.when, def.exercise, ...def.failureModes, ...def.steps.flatMap((s) => [s.title, s.prompt])];

test('every catalogue entry has its tool, in catalogue order, registered in the one registry', () => {
  assert.deepEqual(Object.keys(T), ids(CATALOGUE));
  for (const id of Object.keys(T)) assert.equal(TOOLS[id], T[id], id);
  assert.equal(TOOLS.cb_commit, cbCommit);
  assert.equal(TOOLS.cb_review, cbReview);
});

test('family, tier, step and pairsWell match the catalogue; definitions are frozen', () => {
  for (const def of Object.values(T)) {
    const e = entry(def.id);
    assert.equal(def.family, e.family, `${def.id} family`);
    assert.equal(def.tier, e.tier, `${def.id} tier`);
    assert.ok(Object.isFrozen(def.chart), def.id);
    if (e.reuse) assert.equal(def.variantOf, e.reuse, def.id);
    else assert.equal(def.variantOf, undefined, def.id);
    assert.deepEqual([...def.pairsWell], [...e.pairsWell], `${def.id} pairsWell`);
    assert.equal(def.step, 'explore', def.id);
    assert.ok(Object.isFrozen(def), def.id);
  }
});

test('every model coaches: a “use it when”, steps ending on your own part, two or more watch-fors, an exercise', () => {
  for (const def of Object.values(T)) {
    assert.match(def.when, /^[A-Z].{20,}\.$/, `${def.id} when`);
    assert.doesNotMatch(def.when, /^Use this when/, `${def.id} when`);
    assert.ok(def.steps.length >= 3 && def.steps.every((s) => s.id && s.title && s.prompt), `${def.id} steps`);
    assert.equal(new Set(def.steps.map((s) => s.id)).size, def.steps.length, `${def.id} step ids unique`);
    assert.ok(!def.steps.some((s) => s.id === 'choose'), `${def.id}: choose is reserved`);
    assert.equal(def.steps.at(-1).id, 'own_part', `${def.id} ends on stage three`);
    assert.ok(def.failureModes.length >= 2, `${def.id} watch-fors`);
    assert.ok(typeof def.exercise === 'string' && def.exercise.length > 20, `${def.id} exercise`);
  }
});

test('coaching speaks to the person, not to the builder, and says what they can do', () => {
  const builder = /\b(prose|edition|pack|pdf|from memory|the book does not|the book requires|explicit correction)\b/i;
  const deficit = /\b(without|rather than|never)\b/i;
  for (const def of [...Object.values(T), cbCommit, cbReview]) {
    for (const text of coaching(def).filter(Boolean)) assert.doesNotMatch(text, builder, `${def.id}: ${text}`);
    for (const text of [def.when, def.exercise, ...def.steps.flatMap((s) => [s.title, s.prompt])].filter(Boolean)) assert.doesNotMatch(text, deficit, `${def.id}: ${text}`);
  }
});

test('every list says what one entry is, in its own words', () => {
  const generic = ['One concrete observation or action', 'One observation or example', 'One concrete example'];
  for (const def of Object.values(T).filter((d) => d.family === 'list')) {
    const words = def.chart.entry;
    assert.ok(words && !generic.includes(words), `${def.id}: ${words}`);
  }
  for (const def of Object.values(T).filter((d) => d.family === 'quadrant')) assert.notEqual(def.chart.item, 'One situation or example', def.id);
});

test('models sit on the Collaboration Book’s Explore shelf only', () => {
  for (const model of MODEL_IDS) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('cb_')), `${model} ${step}`);
  for (const { id } of BOOK_STEPS) assert.ok(!toolsForBookStep(id).some((tool) => tool.startsWith('cb_')), id);
  for (const model of ['decision_book', 'gear_shifter', 'rules_book', 'change_book']) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('cb_')), `${model} ${step}`);
  assert.deepEqual(toolsForPlanStep('collaboration_book', 'explore'), ids(CATALOGUE));
  assert.deepEqual(toolsForPlanStep('collaboration_book', 'commit'), ['cb_commit']);
  assert.deepEqual(toolsForPlanStep('collaboration_book', 'review'), ['cb_review']);
});

test('every model works through to completion on the real machine', () => {
  for (const id of Object.keys(T)) assert.equal(isComplete(workThrough(id)), true, id);
});

// ---------------------------------------------------------------- the variants

test('Postmortem: the book’s four questions as stages, with no blame, on the after action review', () => {
  const def = T.cb_postmortem;
  assert.equal(def.variantOf, 'after_action_review');
  assert.deepEqual(def.chart.stages.map((s) => s.label), ['What happened', 'Why it happened', 'Lessons', 'Changes for next time']);
  assert.ok(def.steps.some((s) => s.id === 'why' && /not at who to blame/.test(s.prompt)));
  assert.ok(def.failureModes.some((line) => /humiliation/.test(line)));
});

test('Corporate Culture: the conditions at the base of the pyramid, perks on top, no ranking of needs', () => {
  const def = T.cb_corporate_culture;
  assert.equal(def.variantOf, 'dm_maslow');
  assert.equal(def.chart.layout, 'pyramid');
  assert.deepEqual(def.chart.groups.map((g) => g.id), ['conditions', 'perks']);
  assert.ok(def.failureModes.some((line) => /support that genuinely helps/.test(line)));
});

// ---------------------------------------------------------------- the merges and the sensitive models

test('the merged entries live in their parents’ steps and watch-fors', () => {
  assert.ok(T.cb_agility.steps.some((s) => s.id === 'power' && /decisions and resources/.test(s.prompt)));
  assert.ok(T.cb_agility.failureModes.some((line) => /authority or resources/.test(line)));
  assert.ok(T.cb_ladder.steps.some((s) => s.id === 'generous'));
  assert.ok(T.cb_purpose.steps.some((s) => s.id === 'two_levels'));
  assert.ok(T.cb_saying_no.steps.some((s) => s.id === 'answer' && /small yes/.test(s.prompt)));
});

test('Burnout is a reflection on the work, the pizza is a rule of thumb, 4-in-1’s quarters stay a proposal', () => {
  assert.ok(T.cb_burnout.failureModes.some((line) => /diagnosis/.test(line)));
  assert.ok(T.cb_two_pizza.failureModes.some((line) => /precise headcount/.test(line)));
  assert.deepEqual(T.cb_four_in_one.chart.series.map((s) => s.id), ['now', 'wanted']);
  assert.ok(T.cb_four_in_one.steps.some((s) => /proposes equal quarters as one idea/.test(s.prompt)));
});

// ---------------------------------------------------------------- Agree and Review

test('Agree is the team experiment: an owner, a date, and a sign that the conditions need changing', () => {
  assert.deepEqual(Object.keys(cbCommit.slots), ['result', 'rests_on', 'next_action', 'owner', 'check_back', 'change_course']);
  assert.match(cbCommit.slots.next_action, /easy to stop/);
  assert.match(cbCommit.slots.rests_on, /as opposed to what anyone assumed/);
  assert.match(cbCommit.slots.change_course, /conditions/);
  assert.match(cbCommit.validateNode(null, { slot: 'check_back', text: 'soon' }), /a date/);
  assert.equal(cbCommit.validateNode(null, { slot: 'check_back', text: '2026-11-05' }), null);
  assert.deepEqual(Object.keys(cbReview.slots), ['happened', 'conditions', 'keep']);
  assert.match(cbReview.slots.conditions, /only the conversation/);
});
