import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, judge, prepare } from '../../scripts/problem-solver-eval-cases.mjs';
import { activeRun } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { currentEntry } from '../../packages/problem-solver/lightning.mjs';
import { nextSlots } from '../../packages/problem-solver/machine.mjs';

test('every case builds a session at its step with its tool open and the answer last', () => {
  for (const c of CASES) {
    const s = prepare(c);
    assert.equal(s.turns.at(-1).text, c.answer, c.name);
    if (c.lightning) assert.ok(currentEntry(s.lightning), c.name);
    else assert.ok(nextSlots(activeRun(s)).length > 0, `${c.name}: an open slot`);
  }
  const doc = prepare(CASES.find((c) => c.name.startsWith('Document')));
  assert.deepEqual(nextSlots(activeRun(doc)), ['correspond']);
  const escalate = prepare(CASES.find((c) => c.name.includes('full process')));
  assert.equal(currentEntry(escalate.lightning).node, 'take_break');
});

test('judge: word limits, verdicts, suggestions and the Lightning step', () => {
  const blame = CASES.find((c) => c.name.includes('blaming'));
  const long = 'word '.repeat(20).trim();
  assert.equal(judge(blame, { verdict: 'challenge', message: long }), null);
  assert.match(judge(blame, { verdict: 'accept', message: long }), /verdict accept/);
  assert.match(judge(blame, { verdict: 'challenge', message: 'too short' }), /words/);
  const quick = CASES.find((c) => c.name.includes('stays quick'));
  assert.equal(judge(quick, { verdict: 'clarify', message: long, lightning: { node: 'start', answer: 'yes' } }), null);
  assert.match(judge(quick, { verdict: 'clarify', message: long, lightning: { node: 'start', answer: 'yes' }, suggestion: { kind: 'escalate' } }), /should not suggest/);
});
