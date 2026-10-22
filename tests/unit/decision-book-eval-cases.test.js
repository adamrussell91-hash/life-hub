// tests/unit/decision-book-eval-cases.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, judge, prepare } from '../../scripts/decision-book-eval-cases.mjs';
import { activeRun } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { currentEntry } from '../../packages/decision-book/quick.mjs';
import { nextSlots } from '../../packages/problem-solver/machine.mjs';

const find = (words) => CASES.find((c) => c.name.includes(words));

test('every case builds its session with the answer last: framing, the record in Decide, or a quick run', () => {
  for (const c of CASES) {
    const s = prepare(c);
    assert.equal(s.turns.at(-1).text, c.answer, c.name);
    if (c.quick) assert.ok(currentEntry(s.quick), c.name);
    else assert.equal(s.kind, 'decision', c.name);
  }
  const discern = prepare(find('understand yourself'));
  assert.equal(discern.phase, 'frame');
  assert.deepEqual(Object.keys(discern.frame), ['decision', 'compass']);
  const trigger = prepare(find('trigger'));
  assert.equal(trigger.phase, 'decide');
  assert.equal(activeRun(trigger).tool, 'dm_record');
  assert.deepEqual(nextSlots(activeRun(trigger)), ['reason:2', 'trigger']);
  assert.doesNotMatch(buildDecisionPrompt(trigger).user, /AWAITING LEARNING/);
  assert.equal(currentEntry(prepare(find('go deeper')).quick).node, 'test_one');
  assert.ok(CASES.filter((c) => c.name.startsWith('Discern')).length === 4, 'one discernment case per section');
});

test('judge: word limits, verdicts, flattery, a model with a sibling, and the quick step', () => {
  const long = 'word '.repeat(20).trim();
  const strong = find('without flattery');
  assert.equal(judge(strong, { verdict: 'accept', message: long }), null);
  assert.match(judge(strong, { verdict: 'accept', message: `${long} That is a great frame.` }), /flatters/);
  assert.match(judge(strong, { verdict: 'accept', message: 'too short' }), /words/);
  const discern = find('understand yourself');
  const named = 'The rubber band model fits a pull between two places; I passed over the consequences model because the stakes here are about what you want.';
  assert.equal(judge(discern, { verdict: 'accept', message: named, suggestion: { kind: 'next_tool', tool: 'dm_rubber_band' } }), null);
  assert.match(judge(discern, { verdict: 'accept', message: named.replace('the consequences model', 'another one'), suggestion: { kind: 'next_tool', tool: 'dm_rubber_band' } }), /no sibling/);
  assert.match(judge(discern, { verdict: 'accept', message: named, suggestion: { kind: 'next_tool', tool: 'five_whys' } }), /Decision Book model/);
  const quick = find('stays quick');
  assert.equal(judge(quick, { verdict: 'accept', message: long, quick: { node: 'tests', tests: ['a?', 'b?', 'c?'] } }), null);
  assert.match(judge(quick, { verdict: 'accept', message: long, quick: { node: 'tests', tests: ['a?'] } }), /three tests/);
  assert.match(judge(find('cannot be answered'), { verdict: 'accept', message: long, quick: { node: 'tests', tests: ['a?', 'b?', 'c?'] } }), /should not settle/);
});
