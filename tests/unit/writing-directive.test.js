import test from 'node:test';
import assert from 'node:assert/strict';
import { codeStep, writingDirective } from '../../netlify/functions/_shared/next-steps.mjs';

const ladder = (tag) => [0, 1, 2, 3, 4].map((i) => `${tag} step ${i}.`);
const codes = new Map([
  ['as', { id: 'as', code: 'AS', colour: 'peach', skill: 'analysis.effect', ladder: ladder('AS'), descriptor: 'Say what it does.' }],
  ['ts', { id: 'ts', code: 'TS', colour: 'blue', skill: 'writing.thesis', ladder: ladder('TS'), descriptor: 'Make a claim.' }],
  ['ev', { id: 'ev', code: 'EV', colour: 'odd', descriptor: 'Pick a sharp quote.' }]
]);
const piece = (id, tags, kind = 'written') => ({ id, kind, tags: tags.map(([code_id, positive = false]) => ({ code_id, positive })) });

test('the code flagged in the latest piece and most of the last four leads, at the student’s rung', () => {
  const pieces = [
    piece('w0', [['ev']]),
    piece('w1', [['as'], ['ts']]),
    piece('v1', [['ts']], 'viva'),
    piece('w2', [['as'], ['ts']]),
    piece('w3', [['as']]),
    piece('w4', [['as'], ['ev'], ['ev']])
  ];
  const d = writingDirective(pieces, codes, { 'analysis.effect': 'skilled' });
  assert.deepEqual(d, { kind: 'do', code_id: 'as', code: 'AS', colour: 'peach', line: 'AS step 2.', hits: 4, of: 4, item: 'w4' });
});

test('a code with no ladder uses its own wording; a strange colour falls back; a tie goes to the most tags', () => {
  const d = writingDirective([piece('w1', [['as'], ['ev'], ['ev']])], codes);
  assert.equal(d.code_id, 'ev');
  assert.equal(d.line, 'Pick a sharp quote.');
  assert.equal(d.colour, 'peach');
  assert.equal(codeStep(codes.get('ts'), {}), 'TS step 1.', 'no rung yet: the Capable line');
});

test('nothing flagged last time, and a code gone from the last two: keep doing it', () => {
  const d = writingDirective([piece('w1', [['ts']]), piece('w2', [['ts'], ['as']]), piece('w3', [['as', true]]), piece('w4', [])], codes);
  assert.equal(d.kind, 'keep');
  assert.equal(d.code_id, 'ts');
  assert.equal(d.item, 'w2');
});

test('nothing to say: no writing back, too few pieces for keep, strengths only, vivas only', () => {
  assert.equal(writingDirective([], codes), null);
  assert.equal(writingDirective([piece('w1', [['ts']]), piece('w2', [])], codes), null);
  assert.equal(writingDirective([piece('w1', [['as', true]])], codes), null);
  assert.equal(writingDirective([piece('v1', [['as']], 'viva')], codes), null);
});
