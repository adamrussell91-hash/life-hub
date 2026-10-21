// tests/unit/decision-book-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoachTurn, createSession, frameKeysOf, summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, ...fields });

test('a decision session starts in frame with the decision keys', () => {
  const s = createSession({ text: 'Should I take the Sydney job?', kind: 'decision' }, deps);
  assert.equal(s.kind, 'decision');
  assert.equal(s.phase, 'frame');
  assert.equal(s.model, null);
  assert.deepEqual(frameKeysOf(s), ['decision', 'compass', 'known']);
});

test('an unknown kind is refused', () => {
  assert.throws(() => createSession({ text: 'x', kind: 'mystery' }, deps), /kind/);
});

test('three accepted answers open Explore on the fixed model; compass is normalised', () => {
  let s = createSession({ text: 'Should I take the Sydney job?', kind: 'decision' }, deps);
  s = applyCoachTurn(s, turn({ frame: { decision: 'Take the Sydney job or stay.' } }), deps);
  s = applyCoachTurn(s, turn({ frame: { compass: 'self_understand and others_improve', goal: 'ignored' } }), deps);
  assert.equal(s.frame.compass, 'self_understand+others_improve');
  assert.equal(s.frame.goal, undefined);
  assert.equal(s.phase, 'frame');
  s = applyCoachTurn(s, turn({ frame: { known: 'Offer by Friday; partner keen; rent doubles.' } }), deps);
  assert.equal(s.phase, 'explore');
  assert.equal(s.model.id, 'decision_book');
  assert.deepEqual(Object.keys(s.steps), ['explore']);
});

test('a compass answer with no quadrant id is not recorded', () => {
  let s = createSession({ text: 'Should I?', kind: 'decision' }, deps);
  s = applyCoachTurn(s, turn({ frame: { compass: 'not sure' } }), deps);
  assert.equal(s.frame.compass, undefined);
});

test('a full session still needs the coach to choose a model', () => {
  let s = createSession({ text: 'Late rota.' }, deps);
  assert.equal(s.kind, 'full');
  s = applyCoachTurn(s, turn({ frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' } }), deps);
  assert.equal(s.phase, 'frame');
  s = applyCoachTurn(s, turn({ frame: null, model: { id: 'seven_step', reason: 'r' } }), deps);
  assert.equal(s.phase, 'define');
});

test('summary rows count frame answers by kind', () => {
  let s = createSession({ text: 'Should I?', kind: 'decision' }, deps);
  s = applyCoachTurn(s, turn({ frame: { decision: 'd' } }), deps);
  const row = summaryRow(s);
  assert.equal(row.kind, 'decision');
  assert.equal(row.frame, 1);
});

test('the coach schema accepts the decision frame keys', () => {
  const result = validateCoachTurn({ verdict: 'accept', message: 'Clear. Who is it about?', frame: { decision: 'd', compass: 'self_improve', known: 'k' } });
  assert.ok(result.ok);
  assert.deepEqual(result.value.frame, { decision: 'd', compass: 'self_improve', known: 'k' });
});
