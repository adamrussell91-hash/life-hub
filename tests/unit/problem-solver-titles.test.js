import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeTitle, tidyTitle, titleFromText } from '../../packages/problem-solver/titles.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';

test('tidyTitle keeps a short title whole and drops trailing punctuation', () => {
  assert.equal(tidyTitle('friday approval batch review.'), 'Friday approval batch review');
  assert.equal(tidyTitle('Draw the stall map'), 'Draw the stall map');
  assert.equal(tidyTitle('Ask the head of year for cover'), 'Ask the head of year');
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
  assert.equal(out.value.node.title, 'Late friday rota sign-off');
  const fallback = validateCoachTurn({ verdict: 'accept', message: 'Good.', node: { slot: 'why:1', text: 'The rota is finalised on Friday.' } });
  assert.equal(fallback.value.node.title, 'Rota finalised Friday');
});

test('a cut never ends on a joining word', () => {
  assert.equal(tidyTitle('Inconsistent eating and training'), 'Inconsistent eating and training');
  assert.equal(tidyTitle('Inconsistent eating and exercise routines'), 'Inconsistent eating and exercise');
  assert.equal(tidyTitle('Unpredictable sleeping and exercising'), 'Unpredictable sleeping');
  assert.equal(tidyTitle('Rota changes late'), 'Rota changes late');
});

test('nodeTitle finishes a title saved with a dangling joining word', () => {
  assert.equal(nodeTitle({ title: 'Inconsistent eating and', text: 'Inconsistent eating and training' }), 'Inconsistent eating and training');
  assert.equal(nodeTitle({ title: 'Inconsistent eating and', text: 'Something else' }), 'Inconsistent eating');
});
