import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeTitle, tidyTitle, titleFromText } from '../../packages/problem-solver/titles.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';

test('tidyTitle keeps at most three words and drops trailing punctuation', () => {
  assert.equal(tidyTitle('friday approval batch review.'), 'Friday approval batch');
  assert.equal(tidyTitle('   '), null);
});

test('titleFromText skips filler words', () => {
  assert.equal(titleFromText('The rota is finalised on Friday afternoon.'), 'Rota finalised Friday');
});

test('nodeTitle prefers the coach title', () => {
  assert.equal(nodeTitle({ title: 'Friday sign-off', text: 'Anything' }), 'Friday sign-off');
  assert.equal(nodeTitle({ text: 'There is no shared calendar.' }), 'No shared calendar');
});

test('coach schema carries a tidied node title', () => {
  const out = validateCoachTurn({ verdict: 'accept', message: 'Good.', node: { slot: 'why:1', text: 'The rota is finalised on Friday.', title: 'late friday rota sign-off' } });
  assert.equal(out.value.node.title, 'Late friday rota');
  const fallback = validateCoachTurn({ verdict: 'accept', message: 'Good.', node: { slot: 'why:1', text: 'The rota is finalised on Friday.' } });
  assert.equal(fallback.value.node.title, 'Rota finalised Friday');
});
