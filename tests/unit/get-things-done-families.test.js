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
