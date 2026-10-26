// tests/unit/rules-book-techniques.test.js
// The Rules Book's tools: registration and integrity, the exact numbers the source gives
// (333, three finished versions, ten minutes/months/years), the two variants, the shelves they
// may and may not appear on, and a driver that works every plain tool through the real machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { BOOK_STEPS, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { MODEL_IDS } from '../../packages/problem-solver/models.mjs';
import { applyScores, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { paretoRows } from '../../packages/problem-solver/tools/pareto.mjs';
import { workThrough } from '../../packages/decision-book/work-through.mjs';
import { sampleNode } from '../../packages/decision-book/fixtures.mjs';
import { RULE_TOOLS } from '../../packages/rules-book/tools/index.mjs';
import { rbCommit } from '../../packages/rules-book/tools/commit.mjs';
import { rbReview } from '../../packages/rules-book/tools/review.mjs';
import { CATALOGUE, entry } from '../../packages/rules-book/catalogue.mjs';

const T = RULE_TOOLS;
const ids = (list) => list.map((item) => item.id);
const labels = (list) => list.map((item) => item.label);
const coaching = (def) => [def.when, def.exercise, ...def.failureModes, ...def.steps.flatMap((s) => [s.title, s.prompt])];
const fill = (run, slots, extra = {}) => slots.reduce((acc, slot) => placeNode(acc, sampleNode(slot.replace(':', ''), slot, `Answer for ${slot}`, extra)), run);

test('every catalogue entry has its tool, in catalogue order, registered in the one registry', () => {
  assert.deepEqual(Object.keys(T), ids(CATALOGUE));
  for (const id of Object.keys(T)) assert.equal(TOOLS[id], T[id], id);
  assert.equal(TOOLS.rb_commit, rbCommit);
  assert.equal(TOOLS.rb_review, rbReview);
});

test('family, tier, step and pairsWell match the catalogue; definitions are frozen', () => {
  for (const def of Object.values(T)) {
    const e = entry(def.id);
    if (e.reuse) assert.equal(def.variantOf, e.reuse, def.id);
    else {
      assert.equal(def.family, e.family, `${def.id} family`);
      assert.equal(def.tier, e.tier, `${def.id} tier`);
      assert.deepEqual([...def.pairsWell], [...e.pairsWell], `${def.id} pairsWell`);
      assert.ok(Object.isFrozen(def.chart), def.id);
    }
    assert.equal(def.step, 'explore', def.id);
    assert.ok(Object.isFrozen(def), def.id);
  }
});

test('every rule coaches: a “use it when”, steps, two or more watch-fors, an exercise', () => {
  for (const def of Object.values(T)) {
    assert.match(def.when, /^[A-Z].{20,}\.$/, `${def.id} when`);
    assert.ok(def.steps.length >= 2 && def.steps.every((s) => s.id && s.title && s.prompt), `${def.id} steps`);
    assert.ok(def.failureModes.length >= 2, `${def.id} watch-fors`);
    assert.ok(typeof def.exercise === 'string' && def.exercise.length > 20, `${def.id} exercise`);
  }
});

test('coaching speaks to the person, not to the builder', () => {
  const builder = /\b(prose|edition|pack|pdf|from memory|the book does not|the book requires|explicit correction)\b/i;
  for (const def of [...Object.values(T), rbCommit, rbReview]) for (const text of coaching(def).filter(Boolean)) assert.doesNotMatch(text, builder, `${def.id}: ${text}`);
});

test('every list says what one entry is, in its own words', () => {
  const generic = ['One observation or action relevant to this group', 'One specific observation, choice or action', 'One concrete example'];
  for (const def of Object.values(T).filter((d) => d.family === 'list')) {
    const words = def.chart.entry;
    assert.ok(words && !generic.includes(words), `${def.id}: ${words}`);
  }
});

test('rules sit on the Rules Book’s Explore shelf only', () => {
  for (const model of MODEL_IDS) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('rb_')), `${model} ${step}`);
  for (const { id } of BOOK_STEPS) assert.ok(!toolsForBookStep(id).some((tool) => tool.startsWith('rb_')), id);
  for (const model of ['decision_book', 'gear_shifter']) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('rb_')), `${model} ${step}`);
  assert.deepEqual(toolsForPlanStep('rules_book', 'explore'), ids(CATALOGUE));
});

test('every plain rule works through to completion on the real machine', () => {
  for (const id of Object.keys(T).filter((key) => key !== 'rb_pareto')) assert.equal(isComplete(workThrough(id)), true, id);
});

// ---------------------------------------------------------------- the numbers the source gives

test('333: one project in the three-hour group, three items in each supporting group, seven entries to open the reflection', () => {
  const { chart } = T.rb_three_three_three;
  assert.deepEqual(labels(chart.groups), ['Three hours: one priority project', 'Three maintenance tasks', 'Three personal-care tasks']);
  assert.deepEqual([chart.perGroup, chart.minEntries, chart.minGroups], [3, 7, 3]);
  assert.equal(chart.groups[0].max, 1);
  let run = newRun('rb_three_three_three', 'r');
  run = placeNode(run, sampleNode('e1', 'entry:1', 'Write the report', { tag: 'group_a' }));
  assert.match(checkNode(run, { slot: 'entry:2', text: 'A second project', tag: 'group_a' }, []) ?? '', /already has 1/);
  for (const [i, tag] of ['group_b', 'group_b', 'group_b'].entries()) run = placeNode(run, sampleNode(`m${i}`, `entry:${i + 2}`, `Upkeep ${i}`, { tag }));
  assert.match(checkNode(run, { slot: 'entry:5', text: 'A fourth task', tag: 'group_b' }, []) ?? '', /already has 3/);
  assert.match(T.rb_three_three_three.steps.find((s) => s.id === 'project').prompt, /three hours/);
  assert.match(T.rb_three_three_three.steps.find((s) => s.id === 'project').prompt, /no timer/);
  assert.match(T.rb_three_three_three.steps.find((s) => s.id === 'maintenance').prompt, /under three minutes/);
  assert.doesNotMatch(Object.keys(chart).join(' '), /timer|duration|seconds/);
});

test('Parkinson: three finished versions, two intermediate and the final', () => {
  assert.deepEqual(labels(T.rb_parkinson.chart.stages), ['First complete version', 'Second complete version', 'Final complete version']);
});

test('10-10-10: exactly ten minutes, ten months and ten years', () => {
  assert.deepEqual(labels(T.rb_ten_ten_ten.chart.stages), ['Ten minutes', 'Ten months', 'Ten years']);
});

test('Plotz carries Canada and Agnes Allen; KISS carries Gall; Chesterton carries Lindy; Strummer carries Sutton and Write It Down; Unintended carries Two Sides', () => {
  const stepIds = (id) => T[id].steps.map((s) => s.id);
  assert.ok(['upkeep', 'exit'].every((s) => stepIds('rb_plotz').includes(s)));
  assert.ok(stepIds('rb_kiss').includes('grow'));
  assert.ok(stepIds('rb_chesterton').includes('keep'));
  assert.ok(['credit', 'write'].every((s) => stepIds('rb_strummer').includes(s)));
  assert.ok(stepIds('rb_unintended').includes('later'));
});

test('the model check lives in Korzybski’s steps and in Act and Review', () => {
  const korz = T.rb_korzybski.steps;
  assert.ok(['truth', 'tool', 'useful'].every((s) => korz.some((x) => x.id === s)));
  assert.match(korz.find((s) => s.id === 'truth').prompt, /observe directly/);
  assert.match(korz.find((s) => s.id === 'useful').prompt, /still useful/);
  assert.match(rbCommit.slots.rests_on, /not the interpretation/);
  assert.match(rbCommit.slots.change_course, /overturn your reading/);
  assert.match(rbReview.slots.held, /reading held/);
  assert.match(rbReview.slots.keep, /still useful/);
});

test('Jaspers keeps its attribution caveat and a qualitative gap', () => {
  assert.ok(T.rb_jaspers.failureModes.some((f) => /unverified/.test(f)));
  assert.equal(T.rb_jaspers.chart.variant, 'gap');
});

// ---------------------------------------------------------------- the two variants

test('Pareto: Problem Solver’s figures and ranking, the Explore step, a reflection and no chosen option', () => {
  const def = T.rb_pareto;
  assert.equal(def.variantOf, 'pareto');
  assert.equal(def.step, 'explore');
  assert.equal(TOOLS.pareto.step, 'decide', 'Problem Solver’s Pareto is unchanged');
  assert.ok('choice' in TOOLS.pareto.slots && !('choice' in def.slots));
  assert.ok('reflection' in def.slots);
  let run = fill(newRun('rb_pareto', 'r'), ['target', 'item:1', 'item:2', 'item:3']);
  assert.match(def.awaiting(run), /figure for each item/);
  run = applyScores(run, { counts: [60, 30, 10] }, '2026-10-27T10:00:00.000Z');
  assert.deepEqual(paretoRows(run).map((row) => row.count), [60, 30, 10]);
  assert.deepEqual(nextSlots(run), ['item:4', 'reflection']);
  assert.equal(isComplete(run), false);
  run = fill(run, ['reflection']);
  assert.equal(isComplete(run), true);
  const original = applyScores(fill(newRun('pareto', 'p'), ['target', 'item:1', 'item:2', 'item:3']), { counts: [60, 30, 10] }, '2026-10-27T10:00:00.000Z');
  assert.deepEqual(nextSlots(original), ['item:4', 'choice'], 'Problem Solver’s Pareto still ends with the chosen option');
});

test('One-Step-Closer: each side’s step and the shared possibility they open are all required', () => {
  const def = T.rb_one_step;
  assert.equal(def.variantOf, 'dm_conflict');
  assert.equal(def.family, 'list');
  assert.deepEqual(def.chart.groups.map((g) => g.id), ['mine', 'theirs', 'shared']);
  assert.equal(def.chart.minGroups, 3, 'a chart without the joint contribution is not done');
  assert.ok(def.pairsWell.includes('dm_conflict'));
  const entries = (...tags) => tags.reduce((run, tag, i) => placeNode(run, sampleNode(`n${i}`, `entry:${i + 1}`, `Step ${i}`, { tag })), newRun('rb_one_step', 'r'));
  assert.equal(nextSlots(entries('mine', 'theirs', 'mine')).includes('reflection'), false, 'no shared possibility yet');
  assert.equal(nextSlots(entries('mine', 'theirs', 'shared')).includes('reflection'), true);
  assert.equal(TOOLS.dm_conflict.chart.groups.length, 6, 'the Decision Book’s six responses are unchanged');
});
