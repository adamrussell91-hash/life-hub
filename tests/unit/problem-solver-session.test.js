// tests/unit/problem-solver-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptSuggestion, activeRun, applyCoachTurn, createSession, dismissSuggestion,
  finishDefine, keepAnyway, say, summaryRow
} from '../../netlify/functions/_shared/problem-solver/session.mjs';

let counter = 0;
const deps = { now: () => '2026-10-16T10:00:00.000Z', newId: () => `id${(counter += 1)}` };
const coach = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, ...fields });

function definedFrame() {
  let s = createSession({ title: 'Late rota', text: 'The rota keeps changing late.' }, deps);
  s = applyCoachTurn(s, coach({ frame: { goal: 'Rota fixed a week ahead', whatIsTrue: 'Changed 3 of 4 weeks', whatCanBeDone: 'Change publish day' }, model: { id: 'seven_step', reason: 'Default.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom.' } }), deps);
  return acceptSuggestion(s, deps);
}

test('create queues the first coach turn', () => {
  const s = createSession({ title: '', text: 'The rota keeps changing late.', links: [{ kind: 'task', id: 't1' }] }, deps);
  assert.equal(s.phase, 'frame');
  assert.equal(s.title, 'The rota keeps changing late.');
  assert.equal(s.runner.status, 'queued');
  assert.equal(s.turns[0].role, 'user');
  assert.deepEqual(s.links, [{ kind: 'task', id: 't1' }]);
});

test('frame completes and the model moves the session to define', () => {
  const s = definedFrame();
  assert.equal(s.phase, 'define');
  assert.equal(s.model.id, 'seven_step');
  assert.equal(activeRun(s).tool, 'five_whys');
  assert.equal(s.suggestion, null);
  assert.equal(s.runner.status, 'queued', 'coach opens the tool');
});

test('accepted node is placed; challenged node waits for keep anyway', () => {
  let s = definedFrame();
  s = applyCoachTurn(s, coach({ node: { slot: 'problem', text: 'Rota changes late.' }, skillsSeen: ['analysis'] }), deps);
  assert.equal(activeRun(s).nodes.length, 1);
  assert.deepEqual(activeRun(s).nodes[0].skills, ['analysis']);
  s = applyCoachTurn(s, coach({ verdict: 'challenge', message: 'That is a person, not a process.', node: { slot: 'why:1', text: 'Sam is disorganised.' } }), deps);
  assert.equal(activeRun(s).nodes.length, 1);
  assert.equal(s.pendingKeep.slot, 'why:1');
  s = keepAnyway(s, deps);
  const kept = activeRun(s).nodes[1];
  assert.equal(kept.state, 'contested');
  assert.equal(kept.objection, 'That is a person, not a process.');
  assert.equal(s.pendingKeep, null);
  assert.equal(s.runner.status, 'idle', 'keeping does not call the coach');
});

test('illegal slot from the coach throws for repair', () => {
  const s = definedFrame();
  assert.throws(() => applyCoachTurn(s, coach({ node: { slot: 'why:3', text: 'x' } }), deps), (err) => err.code === 'illegal_slot');
});

test('switching keeps the abandoned run with its reason', () => {
  let s = definedFrame();
  s = applyCoachTurn(s, coach({ verdict: 'clarify', suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'Causes branch.' } }), deps);
  s = acceptSuggestion(s, deps);
  assert.equal(s.define.runs.length, 2);
  assert.equal(s.define.runs[0].status, 'switched');
  assert.equal(s.define.runs[0].switchReason, 'Causes branch.');
  assert.equal(activeRun(s).tool, 'problem_tree');
});

test('dismissing a suggestion clears it', () => {
  let s = definedFrame();
  s = applyCoachTurn(s, coach({ suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'r' } }), deps);
  assert.equal(dismissSuggestion(s, deps).suggestion, null);
});

test('finish define early queues a closing turn and records the objection', () => {
  let s = finishDefine(definedFrame(), deps);
  assert.equal(s.phase, 'defined');
  assert.equal(s.status, 'defined');
  assert.equal(s.define.finishedEarly, true);
  assert.equal(s.runner.status, 'queued');
  assert.equal(s.runner.mode, 'closing');
  s = applyCoachTurn(s, coach({ message: 'Fair enough. Note the root is still open.', exitObjection: 'Root cause not reached.' }), deps);
  assert.equal(s.define.exitObjection, 'Root cause not reached.');
  assert.equal(activeRun(s), null);
});

test('say appends a user turn and queues; summary rows are small', () => {
  const s = say(definedFrame(), 'Because the roster is drafted on Friday.', deps);
  assert.equal(s.turns.at(-1).role, 'user');
  assert.equal(s.runner.status, 'queued');
  const row = summaryRow(s);
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'id', 'links', 'model', 'phase', 'status', 'title', 'tool', 'updatedAt']);
  assert.equal(row.tool, 'five_whys');
  assert.equal(summaryRow(row), row, 'index rows pass through');
});
