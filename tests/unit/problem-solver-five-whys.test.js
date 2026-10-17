// tests/unit/problem-solver-five-whys.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSlot } from '../../packages/problem-solver/slots.mjs';
import { fiveWhys, MIN_WHYS, MAX_WHYS } from '../../packages/problem-solver/tools/five-whys.mjs';

const run = (...slots) => ({ id: 'r', tool: 'five_whys', status: 'active', edges: [], nodes: slots.map((slot, i) => ({ id: `n${i}`, slot, text: slot })) });

test('parseSlot', () => {
  assert.deepEqual(parseSlot('why:3'), { name: 'why', index: 3 });
  assert.deepEqual(parseSlot('root'), { name: 'root', index: null });
  assert.equal(parseSlot('Why 3'), null);
});

test('problem first, then whys in order', () => {
  assert.deepEqual(fiveWhys.nextSlots(run()), ['problem']);
  assert.deepEqual(fiveWhys.nextSlots(run('problem')), ['why:1']);
  assert.deepEqual(fiveWhys.nextSlots(run('problem', 'why:1')), ['why:2']);
});

test('root opens after the minimum whys and closes the chain', () => {
  const whys = Array.from({ length: MIN_WHYS }, (_, i) => `why:${i + 1}`);
  assert.deepEqual(fiveWhys.nextSlots(run('problem', ...whys)), [`why:${MIN_WHYS + 1}`, 'root']);
  assert.ok(!fiveWhys.complete(run('problem', ...whys)));
  assert.deepEqual(fiveWhys.nextSlots(run('problem', ...whys, 'root')), []);
  assert.ok(fiveWhys.complete(run('problem', ...whys, 'root')));
});

test('at most eight whys', () => {
  const whys = Array.from({ length: MAX_WHYS }, (_, i) => `why:${i + 1}`);
  assert.deepEqual(fiveWhys.nextSlots(run('problem', ...whys)), ['root']);
});
