import test from 'node:test';
import assert from 'node:assert/strict';
import { computeScale, gamePool, POOL_TEXT_MAX } from '../../netlify/functions/_shared/cj-scale.mjs';
import * as cj from '../../netlify/functions/_shared/comparative-judgement.mjs';

// Invented answers about an invented novella ("The Lantern House"); owners are synthetic seat ids.
const ANSWERS = [
  { id: 'g1', text: 'The simile turns the windows into patient eyes, so the threat waits.', ref: 'o_AA' },
  { id: 'g2', text: 'Personification makes the house listen, so danger feels hidden.', ref: 'o_BB' },
  { id: 'g3', text: 'The house is scary because it is dark.', ref: 'o_CC' },
  { id: 'g4', text: '   ', ref: 'o_DD' },
  { id: 'g5', text: 'It is old.', ref: 'o_EE' }
];

test('gamePool keeps written answers as student items and drops blanks', () => {
  const pool = gamePool(ANSWERS);
  assert.deepEqual(Object.keys(pool), ['g1', 'g2', 'g3', 'g5']);
  assert.deepEqual(pool.g3, { text: 'The house is scary because it is dark.', kind: 'student', ref: 'o_CC' });
  assert.equal(gamePool([{ id: 'x', text: 'a'.repeat(POOL_TEXT_MAX + 50), ref: 'o' }]).x.text.length, POOL_TEXT_MAX);
  assert.deepEqual(gamePool(null), {});
  assert.deepEqual(gamePool([{ id: 'g1', text: 'first', ref: 'a' }, { id: 'g1', text: 'second', ref: 'b' }]).g1.text, 'first');
});

test('the CJ module re-exports the same computeScale (one engine)', () => {
  assert.equal(cj.computeScale, computeScale);
});

test('computeScale on a game pool orders answers by the class’s judgements', () => {
  const pool = gamePool(ANSWERS);
  const truth = { g1: 4, g2: 3, g3: 2, g5: 1 };
  const judges = new Map();
  const ids = Object.keys(pool);
  for (let j = 0; j < 8; j++) {
    const judgements = [];
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const [left, right] = (a + b + j) % 2 ? [ids[a], ids[b]] : [ids[b], ids[a]];
        judgements.push({ left, right, winner: truth[left] > truth[right] ? left : right, chips: { left: [], right: [] } });
      }
    }
    judges.set(`o_${j}`, { judgements });
  }
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const scale = computeScale({ pool }, { teacher_weight: 2, downweight_misfits: true }, judges, rng);
  assert.deepEqual(scale.studentOrder, ['g1', 'g2', 'g3', 'g5']);
  assert.equal(scale.comparisons.length, 8 * 6);
  assert.ok(['keep', 'feedback', 'marks'].includes(scale.reliability.level));
});
