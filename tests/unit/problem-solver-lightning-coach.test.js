import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { buildLightningPrompt, checkLightningTurn, LIGHTNING_INTENTS, LIGHTNING_RUBRIC } from '../../netlify/functions/_shared/problem-solver/lightning-prompts.mjs';
import { createLightningSession, applyLightningTurn } from '../../netlify/functions/_shared/problem-solver/lightning-session.mjs';
import { LIGHTNING_NODE_IDS } from '../../packages/problem-solver/lightning.mjs';

let n = 0;
const deps = { now: () => '2026-10-20T09:00:00.000Z', newId: () => `id${(n += 1)}` };
const run = () => ({ ...createLightningSession({ text: 'The printer jams every Monday.' }, deps), runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });

test('schema: a lightning step and an escalate suggestion', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'Could you live with it?', lightning: { node: 'start', answer: 'no', note: 'It wastes an hour' }, suggestion: { kind: 'escalate', reason: 'It recurs.' } });
  assert.deepEqual(ok.value.lightning, { node: 'start', answer: 'no', note: 'It wastes an hour' });
  assert.deepEqual(ok.value.suggestion, { kind: 'escalate', reason: 'It recurs.' });
  assert.match(validateCoachTurn({ verdict: 'clarify', message: 'm', lightning: { node: 'nowhere' } }).error, /Unknown Lightning box/);
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'm' }).value.lightning, null);
});

test('every box has an intent, and the rubric names the escalation reasons', () => {
  for (const id of LIGHTNING_NODE_IDS) assert.ok(LIGHTNING_INTENTS[id], id);
  for (const word of ['escalate', 'stakeholders', 'three or more strategies', 'Can I fix this?']) assert.ok(LIGHTNING_RUBRIC.includes(word), word);
});

test('the prompt names the current box and both ways on', () => {
  const { system, user } = buildLightningPrompt(run());
  assert.equal(system.length, 1);
  assert.match(user, /CURRENT BOX: start \(check\)/);
  assert.match(user, /NEXT: yes -> relax .*; no -> goal/);
});

test('after a strategy, the prompt carries what was tried; a second round says so', () => {
  let s = run();
  for (const step of [{ node: 'start', answer: 'no' }, { node: 'goal', note: 'Print the rota on Monday' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' }, { node: 'diagram', note: 'Sketched the paper path', answer: 'no' }]) s = { ...applyLightningTurn(s, turn({ lightning: step }), deps), runner: { status: 'idle', mode: 'turn', error: null } };
  const { user } = buildLightningPrompt(s);
  assert.match(user, /CURRENT BOX: work_backwards/);
  assert.match(user, /TRIED SO FAR: Draw a diagram \(Sketched the paper path\): not solved/);
  assert.match(user, /GOAL: Print the rota on Monday/);
  assert.match(buildLightningPrompt({ ...s, lightning: { ...s.lightning, rounds: 2 } }).user, /it came back/);
});

test('the parser check: the current box only, yes/no where asked; escalate kept until escalated', () => {
  const s = run();
  assert.equal(checkLightningTurn(s, turn({ lightning: { node: 'start', answer: 'no' } })).ok, true);
  assert.match(checkLightningTurn(s, turn({ lightning: { node: 'goal' } })).error, /current box \(start\)/);
  assert.match(checkLightningTurn(s, turn({ lightning: { node: 'start' } })).error, /yes or no/);
  const kept = checkLightningTurn(s, turn({ suggestion: { kind: 'escalate', reason: 'r' } }));
  assert.equal(kept.value.suggestion.kind, 'escalate');
  const gone = checkLightningTurn({ ...s, lightning: { ...s.lightning, escalatedTo: 'x' } }, turn({ suggestion: { kind: 'escalate', reason: 'r' } }));
  assert.equal(gone.value.suggestion, null);
  assert.equal(checkLightningTurn(s, turn({ suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } })).value.suggestion, null);
});
