// tests/unit/get-things-done-families.test.js
// Gear Shifter's chart changes (Plan 2): the scales family's min and dated snapshots, the
// ratings family, and the Kanban and 5 Whys variants. Samples come from
// packages/get-things-done/fixtures.mjs (invented content).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { applyScores, isComplete, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { historyOf, scalesTool, valuesOf } from '../../packages/decision-book/families/scales.mjs';
import { sampleNode, sampleRun } from '../../packages/decision-book/fixtures.mjs';
import { GT_SAMPLE_TOOLS, gtRun } from '../../packages/get-things-done/fixtures.mjs';

for (const def of Object.values(GT_SAMPLE_TOOLS)) TOOLS[def.id] = def;
test.after(() => {
  for (const def of Object.values(GT_SAMPLE_TOOLS)) delete TOOLS[def.id];
});

const AT = '2026-10-22T10:00:00.000Z';
const base = { id: 'gt_bad', name: 'Bad', when: 'never', steps: [{ id: 's', title: 's', prompt: 'p' }] };
const axes3 = { mode: 'axes', scales: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] };
const pairs = { mode: 'pairs', scales: [{ id: 'a', low: 'L', high: 'H' }, { id: 'b', low: 'L', high: 'H' }] };

/** Place nodes in the given slots, ids from the slot ('idea:2' → 'idea2'). */
export function fill(run, slots, extra = {}) {
  return slots.reduce((acc, slot) => placeNode(acc, sampleNode(slot.replace(':', ''), slot, `Answer for ${slot}`, extra)), run);
}

test('factories take gt_ ids; other prefixes still fail', () => {
  assert.equal(GT_SAMPLE_TOOLS.needs.id, 'gt_sample_needs');
  assert.equal(GT_SAMPLE_TOOLS.needs.step, 'explore');
  assert.throws(() => scalesTool({ ...base, id: 'xx_bad', chart: axes3 }), /ids start with dm_ or gt_/);
});

test('scales: axes take an optional min of 0; the default stays 1', () => {
  const zero = GT_SAMPLE_TOOLS.needs;
  assert.equal(zero.chart.min, 0);
  assert.equal(zero.validateScores(gtRun('needs'), { series: 'now', values: { order: 0, novelty: 10, thanks: 4 } }), null);
  assert.match(zero.validateScores(gtRun('needs'), { series: 'now', values: { order: -1, novelty: 10, thanks: 4 } }), /from 0 to 10/);
  const one = scalesTool({ ...base, chart: axes3 });
  assert.equal(one.chart.min, undefined);
  assert.match(one.validateScores(sampleRun(one.id), { series: 'now', values: { a: 0, b: 1, c: 1 } }), /from 1 to 10/);
  assert.equal(one.validateScores(sampleRun(one.id), { series: 'now', values: { a: 1, b: 1, c: 10 } }), null);
  assert.throws(() => scalesTool({ ...base, chart: { ...axes3, min: 2 } }), /min is 0 or 1/);
  assert.throws(() => scalesTool({ ...base, chart: { ...pairs, min: 0 } }), /min belongs to axes mode/);
});

test('scales: dated keeps every save, newest first', () => {
  let run = gtRun('needs');
  assert.deepEqual(historyOf(run, 'now'), []);
  run = applyScores(run, { series: 'now', values: { order: 2, novelty: 5, thanks: 7 } }, '2026-10-01T09:00:00.000Z');
  run = applyScores(run, { series: 'now', values: { order: 6, novelty: 5, thanks: 3 } }, '2026-10-08T09:00:00.000Z');
  assert.deepEqual(historyOf(run, 'now').map((s) => s.at.slice(0, 10)), ['2026-10-08', '2026-10-01']);
  assert.deepEqual(historyOf(run, 'now', 1).map((s) => s.values.order), [6]);
  assert.deepEqual(valuesOf(run).now, { order: 6, novelty: 5, thanks: 3 });
  assert.throws(() => scalesTool({ ...base, chart: { ...axes3, dated: true, series: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } }), /dated scales take one series/);
  assert.throws(() => scalesTool({ ...base, chart: { ...pairs, dated: true } }), /dated scales take one series in axes mode/);
});

test('scales: a dated tool completes on its first save and its reflection', () => {
  let run = gtRun('needs');
  assert.match(GT_SAMPLE_TOOLS.needs.awaiting(run), /scores now/);
  run = applyScores(run, { series: 'now', values: { order: 0, novelty: 0, thanks: 0 } }, AT);
  assert.equal(GT_SAMPLE_TOOLS.needs.awaiting(run), null);
  assert.ok(nextSlots(run).includes('reflection'));
  run = fill(run, ['reflection']);
  assert.equal(isComplete(run), true);
});

// ---------------------------------------------------------------- ratings
import { ratingsOf, ratingsTool, sampleSd } from '../../packages/decision-book/families/ratings.mjs';
import { GT_SAMPLE_RUNS, gtRunFor } from '../../packages/get-things-done/fixtures.mjs';

const ratingChart = { idea: 'i', criterion: 'c', rater: 'r' };
const scoresFor = (rater, n) => ({
  rater,
  scores: Object.fromEntries(['idea1', 'idea2', 'idea3'].map((idea) => [idea, { criterion1: n, criterion2: n }])),
  ranking: ['idea1', 'idea2', 'idea3']
});

test('ratings: config bounds', () => {
  assert.throws(() => ratingsTool({ ...base, chart: { ...ratingChart, criteria: [1, 3] } }), /criteria run from 2 to 3/);
  assert.throws(() => ratingsTool({ ...base, chart: { ...ratingChart, criteria: [2, 4] } }), /criteria run from 2 to 3/);
  assert.throws(() => ratingsTool({ ...base, chart: { ...ratingChart, maxIdeas: 8 } }), /at most seven ideas/);
  assert.throws(() => ratingsTool({ ...base, chart: { idea: 'i', criterion: 'c' } }), /needs a rater label/);
  assert.equal(GT_SAMPLE_TOOLS.ratings.family, 'ratings');
});

test('ratings: ideas, criteria and raters first, then scores, then recommendation and owner', () => {
  const def = GT_SAMPLE_TOOLS.ratings;
  let run = gtRun('ratings');
  assert.deepEqual(nextSlots(run), ['idea:1', 'criterion:1', 'rater:1']);
  assert.match(def.validateScores(run, scoresFor('rater1', 5)), /Name at least two ideas, 2 criteria and one rater/);
  run = fill(run, ['idea:1', 'idea:2', 'idea:3', 'criterion:1', 'criterion:2', 'rater:1', 'rater:2']);
  assert.deepEqual(nextSlots(run), ['idea:4', 'criterion:3', 'rater:3']);
  assert.match(def.awaiting(run), /form: Answer for rater, Answer for rater still to score every idea/);
  assert.match(def.validateScores(run, { rater: 'nobody', scores: {}, ranking: [] }), /one of the named raters/);
  assert.match(def.validateScores(run, { rater: 'rater1', scores: {}, ranking: [] }), /every idea on every criterion/);
  assert.match(def.validateScores(run, scoresFor('rater1', 11)), /from 1 to 10/);
  assert.match(def.validateScores(run, scoresFor('rater1', 0)), /from 1 to 10/);
  assert.match(def.validateScores(run, { ...scoresFor('rater1', 5), ranking: ['idea1', 'idea1', 'idea2'] }), /rank every idea once/);
  run = applyScores(run, scoresFor('rater1', 5), AT);
  assert.deepEqual(nextSlots(run), [], 'the shortlist closes once scoring starts; waiting on rater 2');
  assert.equal(isComplete(run), false);
  run = applyScores(run, scoresFor('rater2', 7), AT);
  assert.equal(def.awaiting(run), null);
  assert.deepEqual(nextSlots(run), ['recommendation', 'owner']);
  run = fill(run, ['recommendation']);
  assert.deepEqual(nextSlots(run), ['owner']);
  run = fill(run, ['owner']);
  assert.deepEqual(nextSlots(run), []);
  assert.equal(isComplete(run), true);
});

test('ratings: a rater re-scoring replaces their own snapshot only', () => {
  let run = fill(gtRun('ratings'), ['idea:1', 'idea:2', 'idea:3', 'criterion:1', 'criterion:2', 'rater:1', 'rater:2']);
  run = applyScores(run, scoresFor('rater1', 5), AT);
  run = applyScores(run, scoresFor('rater2', 7), AT);
  run = applyScores(run, scoresFor('rater1', 9), AT);
  const r = ratingsOf(run);
  assert.deepEqual(r.cells.idea1.criterion1, { mean: 8, sd: Math.SQRT2, n: 2 });
  assert.equal(r.raterMeans.rater1, 9);
});

test('ratings: means, sample SD with n, pooled and rater means; no winner', () => {
  const r = ratingsOf(gtRunFor('ratings', 'full'));
  assert.deepEqual(r.cells.idea1.criterion1, { mean: 6, sd: 2, n: 3 });
  assert.equal(sampleSd([4, 6, 8]), 2);
  assert.equal(sampleSd([5]), null, 'one rater has no sample spread');
  assert.deepEqual(Object.keys(r.pooled), ['idea1', 'idea2', 'idea3'], 'ideas keep slot order');
  assert.equal(r.pooled.idea1.n, 3);
  assert.equal(r.pooled.idea1.mean, 6);
  assert.equal(r.raterMeans.rater1, (4 + 6 + 8 + 9 + 3 + 5) / 6);
  assert.deepEqual(r.rankings.rater1, ['idea2', 'idea1', 'idea3']);
  assert.deepEqual(r.rankings.rater3, ['idea1', 'idea3', 'idea2']);
  for (const key of ['winner', 'total', 'ranking', 'weights']) assert.equal(key in r, false, key);
  assert.equal(GT_SAMPLE_RUNS.ratings.full.length, 10);
});

test('ratings: one rater scores alone, with no spread', () => {
  const r = ratingsOf(gtRunFor('ratings', 'partial'));
  assert.deepEqual(r.scored, ['rater1']);
  assert.deepEqual(r.cells.idea2.criterion2, { mean: 9, sd: null, n: 1 });
});
