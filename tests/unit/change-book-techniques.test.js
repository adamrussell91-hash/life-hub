// tests/unit/change-book-techniques.test.js
// The Change Book's tools: registration and integrity, the shelves they may and may not appear
// on, the Rhizome variant on Problem Solver's concept map, Multitasking and (Un)Happiness on the
// shared scales, the merges folded in, the dated-forecast rule, and a driver that works every
// plain model through the real machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { BOOK_STEPS, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { MODEL_IDS } from '../../packages/problem-solver/models.mjs';
import { addEdge, applyScores, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { workThrough } from '../../packages/decision-book/work-through.mjs';
import { sampleNode } from '../../packages/decision-book/fixtures.mjs';
import { CHANGE_TOOLS } from '../../packages/change-book/tools/index.mjs';
import { chCommit } from '../../packages/change-book/tools/commit.mjs';
import { chReview } from '../../packages/change-book/tools/review.mjs';
import { CATALOGUE, entry } from '../../packages/change-book/catalogue.mjs';

const T = CHANGE_TOOLS;
const ids = (list) => list.map((item) => item.id);
const coaching = (def) => [def.when, def.exercise, ...def.failureModes, ...def.steps.flatMap((s) => [s.title, s.prompt])];
const fill = (run, slots) => slots.reduce((acc, slot) => placeNode(acc, sampleNode(slot.replace(':', ''), slot, `Answer for ${slot}`)), run);

test('every catalogue entry has its tool, in catalogue order, registered in the one registry', () => {
  assert.deepEqual(Object.keys(T), ids(CATALOGUE));
  for (const id of Object.keys(T)) assert.equal(TOOLS[id], T[id], id);
  assert.equal(TOOLS.ch_commit, chCommit);
  assert.equal(TOOLS.ch_review, chReview);
});

test('family, tier, step and pairsWell match the catalogue; definitions are frozen', () => {
  for (const def of Object.values(T)) {
    const e = entry(def.id);
    if (e.reuse) assert.equal(def.variantOf, e.reuse, def.id);
    else {
      assert.equal(def.family, e.family, `${def.id} family`);
      assert.equal(def.tier, e.tier, `${def.id} tier`);
      assert.ok(Object.isFrozen(def.chart), def.id);
    }
    assert.deepEqual([...def.pairsWell], [...e.pairsWell], `${def.id} pairsWell`);
    assert.equal(def.step, 'explore', def.id);
    assert.ok(Object.isFrozen(def), def.id);
  }
});

test('every model coaches: a “use it when”, steps ending on seen-or-assumed, two or more watch-fors, an exercise', () => {
  for (const def of Object.values(T)) {
    assert.match(def.when, /^[A-Z].{20,}\.$/, `${def.id} when`);
    assert.doesNotMatch(def.when, /^Use this when/, `${def.id} when`);
    assert.ok(def.steps.length >= 3 && def.steps.every((s) => s.id && s.title && s.prompt), `${def.id} steps`);
    assert.equal(def.steps.at(-1).id, 'evidence', `${def.id} ends on stage three`);
    assert.ok(def.failureModes.length >= 2, `${def.id} watch-fors`);
    assert.ok(typeof def.exercise === 'string' && def.exercise.length > 20, `${def.id} exercise`);
  }
});

test('coaching speaks to the person, not to the builder, and says what they can do', () => {
  const builder = /\b(prose|edition|pack|pdf|from memory|the book does not|the book requires|explicit correction)\b/i;
  const deficit = /\b(without|rather than|never)\b/i;
  for (const def of [...Object.values(T), chCommit, chReview]) {
    for (const text of coaching(def).filter(Boolean)) assert.doesNotMatch(text, builder, `${def.id}: ${text}`);
    for (const text of [def.when, def.exercise, ...def.steps.flatMap((s) => [s.title, s.prompt])].filter(Boolean)) assert.doesNotMatch(text, deficit, `${def.id}: ${text}`);
  }
});

test('every list says what one entry is, in its own words', () => {
  const generic = ['One observation or example', 'One observation or action relevant to this group', 'One specific observation, choice or action', 'One concrete example'];
  for (const def of Object.values(T).filter((d) => d.family === 'list')) {
    const words = def.chart.entry;
    assert.ok(words && !generic.includes(words), `${def.id}: ${words}`);
  }
});

test('models sit on the Change Book’s Explore shelf only', () => {
  for (const model of MODEL_IDS) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('ch_')), `${model} ${step}`);
  for (const { id } of BOOK_STEPS) assert.ok(!toolsForBookStep(id).some((tool) => tool.startsWith('ch_')), id);
  for (const model of ['decision_book', 'gear_shifter', 'rules_book']) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('ch_')), `${model} ${step}`);
  assert.deepEqual(toolsForPlanStep('change_book', 'explore'), ids(CATALOGUE));
  assert.deepEqual(toolsForPlanStep('change_book', 'commit'), ['ch_commit']);
  assert.deepEqual(toolsForPlanStep('change_book', 'review'), ['ch_review']);
});

test('every plain model works through to completion on the real machine', () => {
  for (const id of Object.keys(T).filter((key) => key !== 'ch_rhizome')) assert.equal(isComplete(workThrough(id)), true, id);
});

// ---------------------------------------------------------------- the Rhizome variant

test('Rhizome: Problem Solver’s concept map in the Explore step, sideways links only, you at the centre, a reflection last', () => {
  const def = T.ch_rhizome;
  assert.equal(def.variantOf, 'concept_map');
  assert.equal(def.step, 'explore');
  assert.equal(TOOLS.concept_map.step, 'define', 'Problem Solver’s concept map is unchanged');
  assert.deepEqual([...TOOLS.concept_map.edgeKinds], ['association', 'hierarchical', 'cross']);
  assert.equal(TOOLS.concept_map.variantOf, undefined);
  assert.ok(!('reflection' in TOOLS.concept_map.slots));
  assert.deepEqual([...def.edgeKinds], ['association', 'cross']);
  assert.match(def.slots.theme, /centre/);
  assert.ok(def.failureModes.some((line) => /centre/.test(line)), 'the caveat that the drawing still centres you');
  let run = fill(newRun('ch_rhizome', 'r'), ['theme', 'concept:1', 'concept:2', 'concept:3']);
  assert.ok(!nextSlots(run).includes('reflection'), 'no reflection before the links');
  run = addEdge(run, { id: 'e1', from: 'concept1', to: 'concept2', kind: 'association' });
  run = addEdge(run, { id: 'e2', from: 'concept2', to: 'concept3', kind: 'cross' });
  assert.ok(nextSlots(run).includes('reflection'));
  assert.equal(isComplete(run), false);
  run = fill(run, ['reflection']);
  assert.equal(isComplete(run), true);
  const original = addEdge(addEdge(fill(newRun('concept_map', 'c'), ['theme', 'concept:1', 'concept:2', 'concept:3']), { id: 'e1', from: 'concept1', to: 'concept2', kind: 'hierarchical' }), { id: 'e2', from: 'concept2', to: 'concept3', kind: 'cross' });
  assert.equal(isComplete(original), true, 'Problem Solver’s concept map still completes with no reflection');
});

// ---------------------------------------------------------------- the two scales models

test('Multitasking: four descriptive spokes, time and value, 0 to 10, with no enforced total', () => {
  const def = T.ch_multitasking;
  assert.deepEqual(def.chart.scales.map((s) => s.label), ['Offline communication', 'Cloud communication', 'Focused work', 'Switching between modes']);
  assert.deepEqual(def.chart.series.map((s) => s.id), ['time', 'value']);
  assert.equal(def.chart.mode, 'axes', 'axes, never shares: nothing has to add up to 100');
  assert.equal(def.chart.layout, 'radar');
  let run = fill(newRun('ch_multitasking', 'm'), ['subject']);
  assert.equal(def.validateScores(run, { series: 'time', values: { offline: 2, cloud: 9, focus: 3, switching: 7 } }), null, 'any total is accepted');
  assert.equal(def.validateScores(run, { series: 'time', values: { offline: 0, cloud: 0, focus: 0, switching: 0 } }), null);
  run = applyScores(run, { series: 'time', values: { offline: 2, cloud: 9, focus: 3, switching: 7 } }, '2026-10-27T10:00:00.000Z');
  assert.match(def.awaiting(run), /what it was worth/);
});

test('(Un)Happiness: the forces scored now and in three years; the Dictatorship pressures folded into its steps', () => {
  const def = T.ch_unhappiness;
  assert.deepEqual(def.chart.series.map((s) => s.label), ['Influence now', 'In three years']);
  assert.equal(def.chart.scales.length, 10);
  assert.ok(def.chart.scales.some((s) => s.label === 'Your actions') && def.chart.scales.some((s) => s.label === 'Luck'));
  assert.ok(def.steps.some((s) => s.id === 'pressures' && /headlines|breaking news/.test(s.prompt)));
  assert.match(def.steps.find((s) => s.id === 'present').prompt, /1 to 5/);
  assert.ok(def.failureModes.some((line) => /influence with personal control/.test(line)));
});

// ---------------------------------------------------------------- the merges and the dated examples

test('Innovation carries the napkin sketch; Othering carries where a judgment came from', () => {
  assert.ok(T.ch_innovation.steps.some((s) => s.id === 'sketch'));
  assert.ok(T.ch_othering.steps.some((s) => s.id === 'source' && /search suggestion/.test(s.prompt)));
});

test('Climate Disaster is an ordinary decision under uncertainty; dated forecasts are examples', () => {
  const cells = T.ch_climate_disaster.chart.cells.map((c) => c.label).join(' ');
  assert.doesNotMatch(cells, /climate|catastrophe/i);
  assert.ok(T.ch_climate_disaster.failureModes.some((line) => /dated/.test(line)));
  assert.ok(T.ch_future.failureModes.some((line) => /dated forecast/.test(line)));
});

test('Act is the reversible step: who it affects, a review date, and evidence that could overturn the reading', () => {
  assert.deepEqual(Object.keys(chCommit.slots), ['result', 'rests_on', 'next_action', 'affected', 'check_back', 'change_course']);
  assert.match(chCommit.slots.next_action, /reversible/);
  assert.match(chCommit.slots.rests_on, /as opposed to the interpretation/);
  assert.match(chCommit.validateNode(null, { slot: 'check_back', text: 'soon' }), /a date/);
  assert.equal(chCommit.validateNode(null, { slot: 'check_back', text: '2026-11-05' }), null);
  assert.match(chReview.slots.keep, /still helps/);
});
