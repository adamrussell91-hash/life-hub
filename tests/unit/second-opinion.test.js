import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSecondOpinionChoice } from '../../netlify/functions/_shared/second-opinion.mjs';

test('buildSecondOpinionChoice is null without a decision title', () => {
  assert.equal(buildSecondOpinionChoice({}), null);
  assert.equal(buildSecondOpinionChoice({ title: '   ' }), null);
});

test('buildSecondOpinionChoice offers Sara, Chadwick, Clare, and Ann', () => {
  const choice = buildSecondOpinionChoice({ title: 'MEd load', decisionId: 'med-load' });
  assert.equal(choice.type, 'choice');
  assert.match(choice.title, /second/i);
  assert.match(choice.hint, /MEd load/);
  assert.equal(choice.multi, false);
  const labels = choice.choices.map(item => item.label).join(' ');
  assert.match(labels, /Sara/);
  assert.match(labels, /Chadwick/);
  assert.match(labels, /Clare/);
  assert.match(labels, /Ann/);
  assert.ok(choice.choices.every(item => /MEd load/.test(item.label)));
});
