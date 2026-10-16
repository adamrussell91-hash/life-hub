// tests/unit/problem-solver-coach.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelCoach, fitWords, wordCount } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-16T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const reply = (fields) => JSON.stringify({ verdict: 'clarify', message: 'What is the goal here, in one sentence, as an ideal state rather than a fix?', ...fields });

function inDefine() {
  const s = createSession({ text: 'Late work.' }, deps);
  return acceptSuggestion(applyCoachTurn(s, { verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: 'r' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' }, summary: null, exitObjection: null }, deps), deps);
}

test('fitWords trims to the last full sentence and keeps a final question', () => {
  const long = `${'This is a sentence that runs on. '.repeat(12)}What will you check first?`;
  const out = fitWords(long, 60);
  assert.ok(wordCount(out) <= 60);
  assert.ok(out.endsWith('What will you check first?'));
});

test('valid reply passes straight through', async () => {
  const calls = [];
  const coach = createModelCoach(async (prompt) => { calls.push(prompt); return reply({}); });
  const turn = await coach(createSession({ text: 'Late work.' }, deps));
  assert.equal(turn.verdict, 'clarify');
  assert.equal(calls.length, 1);
});

test('illegal slot triggers one repair', async () => {
  const replies = [reply({ verdict: 'accept', node: { slot: 'why:9', text: 'x' } }), reply({})];
  const coach = createModelCoach(async () => replies.shift());
  const turn = await coach(inDefine());
  assert.equal(turn.verdict, 'clarify');
  assert.equal(replies.length, 0);
});

test('two bad replies throw coach_lost_thread', async () => {
  const coach = createModelCoach(async () => 'not json');
  await assert.rejects(coach(createSession({ text: 'Late work.' }, deps)), (err) => err.code === 'coach_lost_thread');
});

test('over-long message is rewritten once, then trimmed', async () => {
  const long = `${'Words keep coming here. '.repeat(20)}Why?`;
  const replies = [reply({ message: long }), long];
  const coach = createModelCoach(async () => replies.shift());
  const turn = await coach(createSession({ text: 'Late work.' }, deps));
  assert.ok(wordCount(turn.message) <= 60);
});

test('scripted coach: asks the goal, fills the frame, then gatekeeps 5 Whys', async () => {
  let s = createSession({ text: 'The rota keeps changing late.' }, deps);
  s = applyCoachTurn(s, await scriptedCoach(s), deps);
  assert.deepEqual(s.frame, {}, 'the opening problem is not an answer');
  for (const answer of ['Rota fixed a week ahead every week', 'It changed late three of the last four weeks']) {
    s = say(s, answer, deps);
    s = applyCoachTurn(s, await scriptedCoach(s), deps);
    assert.equal(s.phase, 'frame');
  }
  s = say(s, 'We can change the day it is published', deps);
  s = applyCoachTurn(s, await scriptedCoach(s), deps);
  assert.equal(s.phase, 'define');
  assert.equal(s.model.id, 'seven_step');
  assert.equal(s.suggestion.tool, 'five_whys');
  s = acceptSuggestion(s, deps);
  const opening = await scriptedCoach(s);
  assert.equal(opening.verdict, 'clarify', 'no stale answer is placed when a tool opens');
  assert.equal(opening.node, null);
  s = say(applyCoachTurn(s, opening, deps), 'too short', deps);
  const challenged = await scriptedCoach(s);
  assert.equal(challenged.verdict, 'challenge');
  assert.equal(challenged.node.slot, 'problem');
});

test('an edge to an unplaced slot triggers repair instead of failing the turn', async () => {
  const bad = reply({ verdict: 'accept', node: { slot: 'problem', text: 'Rota changes late.' }, edges: [{ from: 'problem', to: 'why:1', kind: 'relates' }] });
  const replies = [bad, reply({ verdict: 'accept', node: { slot: 'problem', text: 'Rota changes late.' } })];
  const coach = createModelCoach(async () => replies.shift());
  const turn = await coach(inDefine());
  assert.equal(replies.length, 0);
  assert.deepEqual(turn.edges, []);
});

test('applyCoachTurn drops an edge that cannot be added', () => {
  const s = applyCoachTurn(inDefine(), { verdict: 'accept', message: 'ok', node: { slot: 'problem', text: 'x' }, edges: [{ from: 'problem', to: 'why:1', kind: 'relates' }], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null }, deps);
  assert.equal(s.define.runs[0].nodes.length, 1);
  assert.equal(s.define.runs[0].edges.length, 0);
});
