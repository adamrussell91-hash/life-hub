// tests/unit/problem-solver-scripted.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';

/** Run `fn` with the Analyse tools moved to a step that does not exist, so Analyse offers no tool. */
async function withoutAnalyseTools(fn) {
  const saved = Object.entries(TOOLS).filter(([, def]) => def.step === 'analyse');
  try {
    for (const [id, def] of saved) TOOLS[id] = { ...def, step: '__none__' };
    return await fn();
  } finally {
    for (const [id, def] of saved) TOOLS[id] = def;
  }
}

let n = 0;
const deps = { now: () => '2026-10-19T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const step = async (s) => applyCoachTurn(s, await scriptedCoach(s), deps);

async function intoDefine() {
  let s = await step(createSession({ text: 'Late rota.' }, deps));
  for (const text of ['Rota fixed a week ahead.', 'Changed three weeks out of four, by the logs.', 'Move the publish day earlier.']) s = await step(say(s, text, deps));
  return acceptSuggestion(s, deps);
}

test('boundary asks what was learned, then records it', async () => {
  await withoutAnalyseTools(async () => {
  let s = await step(moveOn(await intoDefine(), deps));
  assert.equal(s.pendingLearning, 'define');
  assert.match(s.turns.at(-1).text, /learn/);
  s = await step(say(s, 'I blame people when I am tired.', deps));
  assert.deepEqual(s.learnings.map((l) => l.step), ['define']);
  assert.match(s.turns.at(-1).text, /no tool for this step yet/);
  assert.equal(s.suggestion, null);
  });
});

test('when the next step has a tool, the learning turn suggests it', async () => {
  let s = createSession({ text: 'Late rota.' }, deps);
  s = applyCoachTurn(s, { ...(await scriptedCoach(s)), verdict: 'accept', frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'triz', reason: 'r' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }, deps);
  s = await step(moveOn(acceptSuggestion(s, deps), deps));
  s = await step(say(s, 'I rush.', deps));
  assert.equal(s.suggestion?.tool, 'contradiction');
});

test('finished sessions get a closing line', async () => {
  let s = await intoDefine();
  for (const _ of [1, 2, 3, 4, 5, 6, 7]) s = await step(moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps));
  assert.equal(s.phase, 'finished');
  assert.match(s.turns.at(-1).text, /learn/);
});
