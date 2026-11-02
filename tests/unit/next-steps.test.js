import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNG_ORDER, rungIndex, checkWording, bankSource, stepsBySkill } from '../../netlify/functions/_shared/next-steps.mjs';
import { DEFAULT_FEEDBACK_CODES, cleanFeedbackCodes } from '../../netlify/functions/_shared/feedback-codes.mjs';

test('rungIndex: each rung in order, no rung means Capable', () => {
  RUNG_ORDER.forEach((r, i) => assert.equal(rungIndex(r), i));
  assert.equal(rungIndex(null), 1);
  assert.equal(rungIndex(undefined), 1);
  assert.equal(rungIndex('secure'), 1);
});

test('checkWording passes positive lines and flags deficit wording', () => {
  assert.deepEqual(checkWording('Open with a claim a reader could argue with.'), []);
  assert.deepEqual(checkWording('Do not retell the plot.'), ['word:not']);
  assert.deepEqual(checkWording('Use a quote instead of a summary.'), ['word:instead of']);
  assert.deepEqual(checkWording('Don’t list techniques.'), ["word:don't"]);
  assert.deepEqual(checkWording('This is retelling the text.'), ['word:this is']);
  assert.deepEqual(checkWording('This idea grows.'), []);
  assert.deepEqual(checkWording('Notice the verbs.'), []);
  assert.deepEqual(checkWording(''), ['empty']);
  assert.ok(checkWording('a'.repeat(161)).includes('too_long'));
  assert.deepEqual(checkWording('a'.repeat(160)), []);
});

test('bankSource changes with any input and ignores skill order', () => {
  const ladder = ['a', 'b', 'c', 'd', 'e'];
  const base = bankSource('Why does the town change?', ['arguing.thesis', 'reading.inference'], ladder);
  assert.equal(bankSource('Why does the town change?  ', ['reading.inference', 'arguing.thesis'], ladder), base);
  assert.notEqual(bankSource('Why does the river change?', ['arguing.thesis', 'reading.inference'], ladder), base);
  assert.notEqual(bankSource('Why does the town change?', ['arguing.thesis'], ladder), base);
  assert.notEqual(bankSource('Why does the town change?', ['arguing.thesis', 'reading.inference'], ['a', 'b', 'c', 'd', 'f']), base);
});

test('stepsBySkill: each skill lists its codes, top ranked first; codes without a skill are ignored', () => {
  const codes = new Map([
    ['ts', { id: 'ts', code: 'TS', colour: 'lilac', skill: 'arguing.thesis' }],
    ['ar', { id: 'ar', code: 'AR', colour: 'lilac', skill: 'arguing.thesis' }],
    ['l', { id: 'l', code: 'L', colour: 'gold' }]
  ]);
  const ranked = [{ code_id: 'l', hit: 4 }, { code_id: 'ar', hit: 3 }, { code_id: 'ts', hit: 2 }];
  const out = stepsBySkill(ranked, codes, { 'arguing.thesis': 'skilled', 'reading.inference': 'capable' });
  assert.deepEqual(out, {
    'arguing.thesis': { rung: 'skilled', codes: [{ id: 'ar', code: 'AR', colour: 'lilac', hits: 3 }, { id: 'ts', code: 'TS', colour: 'lilac', hits: 2 }] },
    'reading.inference': { rung: 'capable', codes: [] }
  });
  assert.deepEqual(stepsBySkill([{ code_id: 'ts', hit: 2 }], codes, {}), {
    'arguing.thesis': { rung: null, codes: [{ id: 'ts', code: 'TS', colour: 'lilac', hits: 2 }] }
  });
});

test('every default code is worded positively, ladders included', () => {
  for (const c of DEFAULT_FEEDBACK_CODES) {
    assert.deepEqual(checkWording(c.descriptor, 600), [], `${c.code} descriptor`);
    if (c.strength_descriptor) assert.deepEqual(checkWording(c.strength_descriptor, 600), [], `${c.code} strength`);
    if (c.ladder) {
      assert.equal(c.ladder.length, 5);
      c.ladder.forEach((line, i) => assert.deepEqual(checkWording(line), [], `${c.code} ladder ${i}`));
    }
  }
  assert.ok(DEFAULT_FEEDBACK_CODES.some((c) => c.skill && c.ladder));
});

test('the library keeps a good skill and ladder and drops malformed ones', () => {
  const ladder = ['One.', 'Two.', 'Three.', 'Four.', 'Five.'];
  const [good, badSkill, short, long] = cleanFeedbackCodes({
    codes: [
      { code: 'TS', label: 'Topic', skill: 'arguing.thesis', ladder: ladder.map((l) => ` ${l} `) },
      { code: 'E', label: 'Evidence', skill: 'Arguing', ladder },
      { code: 'T', label: 'Techniques', skill: 'reading.inference', ladder: ladder.slice(0, 4) },
      { code: 'S', label: 'Structure', ladder: [...ladder.slice(0, 4), 'x'.repeat(161)] }
    ]
  });
  assert.equal(good.skill, 'arguing.thesis');
  assert.deepEqual(good.ladder, ladder);
  assert.equal(badSkill.skill, undefined);
  assert.deepEqual(badSkill.ladder, ladder);
  assert.equal(short.skill, 'reading.inference');
  assert.equal(short.ladder, undefined);
  assert.equal(long.ladder, undefined);
});

test('a saved Accuracy code picks up the evidence link and ladder; a code with its own ladder keeps it', async () => {
  const { readFeedbackCodes } = await import('../../netlify/functions/_shared/feedback-codes.mjs');
  const own = ['a', 'b', 'c', 'd', 'e'];
  const store = { get: async () => ({ codes: [
    { id: 'viva_x', code: 'X', group: 'viva' },
    { id: 'comp_e', code: 'E', group: 'composition' },
    { id: 'speak_fw', code: 'FW', group: 'speaking', ladder: own }
  ] }) };
  const [x, e, fw] = await readFeedbackCodes(store);
  assert.equal(x.skill, 'arguing.evidence');
  assert.equal(x.ladder.length, 5);
  assert.equal(e.skill, undefined, 'a composition code stays as saved');
  assert.deepEqual(fw.ladder, own);
});
