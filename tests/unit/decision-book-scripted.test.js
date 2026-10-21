// tests/unit/decision-book-scripted.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { applyCoachTurn, createSession, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const step = async (s, text) => {
  const next = text ? say(s, text, deps) : s;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
};

test('the scripted coach frames a decision and suggests the first Explore model', async () => {
  let s = await step(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
  assert.equal(s.frame.decision, 'Should I take the Sydney job offer?');
  assert.match(s.turns.at(-1).text, /who is this about/i);
  s = await step(s, 'It is about me and I want to understand what I really want.');
  assert.equal(s.frame.compass, 'self_understand');
  s = await step(s, 'The offer closes Friday and the rent there is double.');
  assert.equal(s.phase, 'explore');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'swot', reason: 'A first model with clear sides to weigh.' });
});

test('talk of a team or other people lands on the others side of the compass', async () => {
  let s = await step(createSession({ text: 'Who should lead the new project?', kind: 'decision' }, deps));
  s = await step(s, 'It is about my team and I want to improve how they work together.');
  assert.equal(s.frame.compass, 'others_improve');
});
