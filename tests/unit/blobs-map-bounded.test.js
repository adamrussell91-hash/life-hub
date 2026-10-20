import test from 'node:test';
import assert from 'node:assert/strict';
import { mapBounded } from '../../netlify/functions/_shared/blobs-list.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('mapBounded keeps input order and never exceeds the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapBounded([5, 1, 4, 2, 3, 0], 2, async (n, index) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await wait(n * 3);
    inFlight--;
    return `${index}:${n}`;
  });
  assert.deepEqual(out, ['0:5', '1:1', '2:4', '3:2', '4:3', '5:0']);
  assert.equal(peak, 2);
});

test('mapBounded: one slow item does not hold up the rest of the pool', async () => {
  const finished = [];
  await mapBounded(['slow', 'a', 'b', 'c'], 2, async item => {
    await wait(item === 'slow' ? 60 : 5);
    finished.push(item);
  });
  assert.deepEqual(finished, ['a', 'b', 'c', 'slow']);
});

test('mapBounded handles an empty list and rejects on the first failure', async () => {
  assert.deepEqual(await mapBounded([], 10, async () => 1), []);
  await assert.rejects(
    mapBounded([1, 2, 3], 2, async n => {
      if (n === 2) throw new Error('boom');
      return n;
    }),
    /boom/
  );
});
