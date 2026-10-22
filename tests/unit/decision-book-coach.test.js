// tests/unit/decision-book-coach.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { applyCoachTurn, createSession } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const base = { verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null };

/** A decision session with the decision and compass answered: the next answer completes the frame. */
function twoAnswered() {
  let s = createSession({ text: 'Should I take the Sydney job?', kind: 'decision' }, deps);
  s = applyCoachTurn(s, { ...base, frame: { decision: 'Take the Sydney job or stay.' } }, deps);
  return applyCoachTurn(s, { ...base, frame: { compass: 'self_understand' } }, deps);
}

const reply = (fields) => JSON.stringify({ verdict: 'accept', message: 'That frames it well. I suggest a SWOT analysis first, because the job has clear pros and cons. Shall we start?', ...fields });

test('the frame-completing reply keeps a suggestion for an Explore model', async () => {
  const coach = createModelCoach(async () => reply({ frame: { known: 'Offer by Friday.' }, suggestion: { kind: 'next_tool', tool: 'swot', reason: 'Clear pros and cons.' } }));
  const turn = await coach(twoAnswered());
  assert.deepEqual(turn.suggestion, { kind: 'next_tool', tool: 'swot', reason: 'Clear pros and cons.' });
});

test('a suggestion before the frame is complete is dropped', async () => {
  const s = createSession({ text: 'Should I?', kind: 'decision' }, deps);
  const coach = createModelCoach(async () => reply({ frame: { decision: 'd' }, suggestion: { kind: 'next_tool', tool: 'swot', reason: 'r' } }));
  assert.equal((await coach(s)).suggestion, null);
});

test('a Problem Solver tool outside Explore is refused, then the coach loses the thread', async () => {
  const coach = createModelCoach(async () => reply({ frame: { known: 'k' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }));
  await assert.rejects(coach(twoAnswered()), /lost the thread/);
});
