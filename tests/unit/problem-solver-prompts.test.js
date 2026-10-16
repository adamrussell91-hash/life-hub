// tests/unit/problem-solver-prompts.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
import { createSession, applyCoachTurn, acceptSuggestion } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-16T10:00:00.000Z', newId: () => `id${(n += 1)}` };

test('rubric names every skill, tool and the voice rule', () => {
  for (const word of ['Metacognition', 'Critical thinking', '5 Whys', 'Problem tree', 'SMART', '25 and 60 words', 'Keep it anyway']) {
    assert.ok(RUBRIC.includes(word), `rubric mentions ${word}`);
  }
});

test('frame prompt asks for the missing frame questions', () => {
  const s = createSession({ text: 'Students hand in work late.' }, deps);
  const prompt = buildCoachPrompt(s);
  assert.equal(prompt.system, RUBRIC);
  assert.match(prompt.user, /PHASE: frame/);
  assert.match(prompt.user, /Missing frame answers: goal, whatIsTrue, whatCanBeDone/);
  assert.match(prompt.user, /Students hand in work late\./);
});

test('define prompt lists the tool steps and open slots', () => {
  let s = createSession({ text: 'Late work.' }, deps);
  s = applyCoachTurn(s, { verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: 'r' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' }, summary: null, exitObjection: null }, deps);
  s = acceptSuggestion(s, deps);
  const prompt = buildCoachPrompt(s);
  assert.match(prompt.user, /ACTIVE TOOL: 5 Whys/);
  assert.match(prompt.user, /Open slots: problem/);
  assert.match(prompt.user, /Ask why\?/);
});
