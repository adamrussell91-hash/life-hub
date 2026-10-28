// tests/unit/communication-book-techniques.test.js
// The Communication Book's tools: registration and integrity, the shelves they may and may not
// appear on, the variant (Second-Order Observation on the perspective shift), the merges folded
// in, the sensitive-model rules, Commit and Review, and a driver that works every model through
// the real machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { BOOK_STEPS, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { MODEL_IDS } from '../../packages/problem-solver/models.mjs';
import { isComplete } from '../../packages/problem-solver/machine.mjs';
import { workThrough } from '../../packages/decision-book/work-through.mjs';
import { COMM_TOOLS } from '../../packages/communication-book/tools/index.mjs';
import { cmCommit } from '../../packages/communication-book/tools/commit.mjs';
import { cmReview } from '../../packages/communication-book/tools/review.mjs';
import { CATALOGUE, entry } from '../../packages/communication-book/catalogue.mjs';

const T = COMM_TOOLS;
const ids = (list) => list.map((item) => item.id);
const coaching = (def) => [def.when, def.exercise, ...def.failureModes, ...def.steps.flatMap((s) => [s.title, s.prompt])];

test('every catalogue entry has its tool, in catalogue order, registered in the one registry', () => {
  assert.deepEqual(Object.keys(T), ids(CATALOGUE));
  for (const id of Object.keys(T)) assert.equal(TOOLS[id], T[id], id);
  assert.equal(TOOLS.cm_commit, cmCommit);
  assert.equal(TOOLS.cm_review, cmReview);
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
    assert.ok(!def.steps.some((s) => /^Examine /.test(s.title) || /illustrates/.test(s.prompt)), `${def.id}: the pack's placeholder steps are rewritten`);
    assert.equal(def.steps.at(-1).id, 'own_part', `${def.id} ends on stage three`);
    assert.ok(def.failureModes.length >= 2, `${def.id} watch-fors`);
    for (const line of def.failureModes) assert.match(line, /^[A-Z].*\.$/, `${def.id}: ${line}`);
    assert.ok(typeof def.exercise === 'string' && def.exercise.length > 20, `${def.id} exercise`);
  }
});

test('coaching speaks to the person, not to the builder, and says what they can do', () => {
  const builder = /\b(prose|edition|pack|pdf|from memory|the book does not|the book requires|explicit correction)\b/i;
  const deficit = /\b(without|rather than|never)\b/i;
  for (const def of [...Object.values(T), cmCommit, cmReview]) {
    for (const text of coaching(def).filter(Boolean)) assert.doesNotMatch(text, builder, `${def.id}: ${text}`);
    for (const text of [def.when, def.exercise, ...def.steps.flatMap((s) => [s.title, s.prompt])].filter(Boolean)) assert.doesNotMatch(text, deficit, `${def.id}: ${text}`);
  }
});

test('every list says what one entry is, in its own words; no chart carries a source figure', () => {
  const generic = ['One concrete observation or action', 'One observation or example', 'One concrete example', 'A concrete example from this conversation'];
  for (const def of Object.values(T).filter((d) => d.family === 'list')) {
    const words = def.chart.entry;
    assert.ok(words && !generic.includes(words), `${def.id}: ${words}`);
    assert.ok(def.chart.minEntries >= 2, `${def.id}: at least two entries`);
  }
  for (const def of Object.values(T).filter((d) => d.family === 'quadrant')) assert.ok(!['One situation or example', 'A specific exchange or response'].includes(def.chart.item), def.id);
  for (const def of Object.values(T)) assert.equal(def.chart.sourceFigure, undefined, def.id);
});

test('models sit on the Communication Book’s Explore shelf only', () => {
  for (const model of MODEL_IDS) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('cm_')), `${model} ${step}`);
  for (const { id } of BOOK_STEPS) assert.ok(!toolsForBookStep(id).some((tool) => tool.startsWith('cm_')), id);
  for (const model of ['decision_book', 'gear_shifter', 'rules_book', 'change_book', 'collaboration_book']) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('cm_')), `${model} ${step}`);
  assert.deepEqual(toolsForPlanStep('communication_book', 'explore'), ids(CATALOGUE));
  assert.deepEqual(toolsForPlanStep('communication_book', 'commit'), ['cm_commit']);
  assert.deepEqual(toolsForPlanStep('communication_book', 'review'), ['cm_review']);
});

test('every model works through to completion on the real machine', () => {
  for (const id of Object.keys(T)) assert.equal(isComplete(workThrough(id)), true, id);
});

// ---------------------------------------------------------------- the variant

test('Second-Order Observation: how each person is looking and the blind spot, on the perspective shift', () => {
  const def = T.cm_second_order;
  assert.equal(def.variantOf, 'perspective_shift');
  assert.deepEqual(def.chart.groups.map((g) => g.id), ['first_order', 'second_order', 'blind_spot']);
  assert.ok(def.steps.some((s) => s.id === 'blind' && /neither of you/.test(s.prompt)));
  assert.ok(def.failureModes.some((line) => /free of assumptions/.test(line)));
});

// ---------------------------------------------------------------- the merges and the sensitive models

test('the merged entries live in their parents’ steps and watch-fors', () => {
  assert.ok(T.cm_groupthink.steps.some((s) => s.id === 'silence' && /stand alone/.test(s.prompt)), 'Spiral of Silence');
  assert.ok(T.cm_groupthink.steps.some((s) => s.id === 'echo' && /repeated/.test(s.prompt)), 'Cultivation Theory');
  assert.ok(T.cm_listening.steps.some((s) => s.id === 'opening' && /small talk/.test(s.prompt)), 'Small Talk');
  assert.ok(T.cm_cooperative.steps.some((s) => s.id === 'honest' && /shade the truth/.test(s.prompt)), 'White Lies');
  assert.ok(T.cm_four_layers.steps.some((s) => s.id === 'cycle'), 'Watzlawick');
  assert.ok(T.cm_four_layers.failureModes.some((line) => /silence/.test(line)), 'Watzlawick');
  assert.ok(T.cm_framing.steps.some((s) => s.id === 'plain' && /softening or sharpening/.test(s.prompt)), 'Euphemisms');
  assert.ok(T.cm_uses.steps.some((s) => s.id === 'loop' && /better or worse/.test(s.prompt)), 'FoMO');
});

test('the Sorry Matrix leaves forgiveness to the other person; Intercultural asks, it never predicts; Self-Talk is no therapy', () => {
  assert.ok(T.cm_apology.failureModes.some((line) => /other person’s choice/.test(line)));
  assert.ok(T.cm_apology.steps.some((s) => s.id === 'where' && /theirs alone to decide/.test(s.prompt)));
  assert.ok(T.cm_intercultural.failureModes.some((line) => /nationality/.test(line)));
  assert.ok(T.cm_intercultural.steps.some((s) => s.id === 'theirs' && /ask them/.test(s.prompt)));
  assert.ok(T.cm_self_talk.failureModes.some((line) => /professional/.test(line)));
  assert.ok(T.cm_peak_end.failureModes.some((line) => /repair a real harm/.test(line)));
  assert.ok(T.cm_game_theory.chart.groups.every((g) => !/prison|sentence/i.test(g.label)));
});

// ---------------------------------------------------------------- Commit and Review

test('Commit is the next conversation: first words, who takes it, a date, and a sign it is not landing', () => {
  assert.deepEqual(Object.keys(cmCommit.slots), ['result', 'rests_on', 'next_action', 'owner', 'check_back', 'change_course']);
  assert.match(cmCommit.slots.next_action, /first words/);
  assert.match(cmCommit.slots.rests_on, /as opposed to what anyone assumed/);
  assert.match(cmCommit.slots.owner, /whose reply/);
  assert.match(cmCommit.validateNode(null, { slot: 'check_back', text: 'soon' }), /a date/);
  assert.equal(cmCommit.validateNode(null, { slot: 'check_back', text: '2026-11-05' }), null);
  assert.deepEqual(Object.keys(cmReview.slots), ['happened', 'landed', 'keep']);
  assert.match(cmReview.slots.landed, /other person/);
});
