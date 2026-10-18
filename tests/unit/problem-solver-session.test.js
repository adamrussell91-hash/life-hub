// tests/unit/problem-solver-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptSuggestion, activeRun, applyCoachTurn, createSession, dismissSuggestion,
  archive, finishDefine, keepAnyway, rescoreRadar, say, summaryRow
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
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'frame', 'id', 'links', 'model', 'phase', 'skills', 'status', 'title', 'tool', 'updatedAt']);
  assert.equal(row.tool, 'five_whys');
  assert.equal(summaryRow(row), row, 'index rows pass through');
});

test('summary rows count answered frame questions and skills seen', () => {
  let s = createSession({ title: 'Late rota', text: 'The rota keeps changing late.' }, deps);
  assert.equal(summaryRow(s).frame, 0);
  assert.deepEqual(summaryRow(s).skills, {});
  s = applyCoachTurn(s, coach({ frame: { goal: 'Rota fixed a week ahead' }, skillsSeen: ['analysis', 'inference'] }), deps);
  s = applyCoachTurn(say(s, 'It changed three weeks out of four.', deps), coach({ frame: { whatIsTrue: 'Changed 3 of 4 weeks' }, skillsSeen: ['analysis'] }), deps);
  const row = summaryRow(s);
  assert.equal(row.frame, 2);
  assert.deepEqual(row.skills, { analysis: 2, inference: 1 });
});

test('limits: text over 12000 chars, title cap, links cap', () => {
  const big = 'x'.repeat(12001);
  assert.throws(() => createSession({ text: big }, deps), (err) => err.status === 413 && err.code === 'limit' && err.message === 'That is too long; keep it under 12,000 characters.');
  const s = createSession({ text: 'ok', links: Array.from({ length: 30 }, (_, i) => ({ kind: 'task', id: `t${i}` })) }, deps);
  assert.equal(s.links.length, 20);
  assert.throws(() => say(s, big, deps), (err) => err.status === 413 && err.code === 'limit');
  assert.equal(createSession({ title: 't'.repeat(300), text: 'ok' }, deps).title.length, 120);
});

test('archive resets the runner', () => {
  const s = createSession({ text: 'ok' }, deps);
  assert.deepEqual(archive(s, deps).runner, { status: 'idle', mode: 'turn', error: null });
});

test('closing mode forces suggestion null', () => {
  const s = { ...createSession({ text: 'ok' }, deps), runner: { status: 'running', mode: 'closing', error: null } };
  const next = applyCoachTurn(s, coach({ suggestion: { kind: 'finish_define', reason: 'r' } }), deps);
  assert.equal(next.suggestion, null);
});

test('keepAnyway with a slot that no longer fits is a 409, not illegal_slot', () => {
  let s = definedFrame();
  s = applyCoachTurn(s, coach({ verdict: 'challenge', message: 'No.', node: { slot: 'problem', text: 'x' } }), deps);
  s = applyCoachTurn(s, coach({ node: { slot: 'problem', text: 'y' } }), deps);
  s = { ...s, pendingKeep: { slot: 'problem', text: 'x', objection: 'o', skills: [], runId: activeRun(s).id } };
  assert.throws(() => keepAnyway(s, deps), (err) => err.status === 409 && err.code === 'action_not_allowed' && err.message === 'That answer no longer fits here.');
});

function radarSession(phase = 'define', status = 'active') {
  const nodes = [1, 2, 3].map((i) => ({ id: `x${i}`, slot: `axis:${i}`, text: `Topic ${i}`, state: 'accepted', skills: [], turnId: 't' }));
  const base = createSession({ title: 'Radar', text: 'Scores to track.' }, deps);
  return { ...base, phase, status: phase === 'defined' ? 'defined' : 'active', runner: { status: 'idle', mode: 'turn', error: null }, define: { runs: [{ id: 'run', tool: 'gap_radar', status, nodes, edges: [], radar: { snapshots: [] } }], finishedEarly: false, exitObjection: null } };
}

test('rescore_radar appends a timestamped snapshot to the active radar run', () => {
  const s = rescoreRadar(radarSession(), { current: [3, 4, 5], objective: [8, 8, 9] }, deps);
  const run = s.define.runs[0];
  assert.deepEqual(run.radar.snapshots, [{ at: '2026-10-16T10:00:00.000Z', current: [3, 4, 5], objective: [8, 8, 9] }]);
  assert.equal(s.runner.status, 'idle', 'rescoring does not call the coach');
  const again = rescoreRadar(s, { current: [4, 5, 6], objective: [8, 8, 9] }, deps);
  assert.equal(again.define.runs[0].radar.snapshots.length, 2);
});

test('rescore_radar still works once the problem is defined (tracking progress)', () => {
  const s = rescoreRadar(radarSession('defined', 'done'), { current: [3, 4, 5], objective: [8, 8, 9] }, deps);
  assert.equal(s.define.runs[0].radar.snapshots.length, 1);
});

test('rescore_radar rejects bad scores with a 400 and the validator message', () => {
  assert.throws(() => rescoreRadar(radarSession(), { current: [3, 4], objective: [8, 8, 9] }, deps), (err) => err.status === 400 && /one score per topic/.test(err.message));
  assert.throws(() => rescoreRadar(radarSession(), { current: [3, 4, 11], objective: [8, 8, 9] }, deps), (err) => err.status === 400 && /1 to 10/.test(err.message));
});

test('rescore_radar needs a radar run and a define phase', () => {
  const none = { ...radarSession(), define: { runs: [], finishedEarly: false, exitObjection: null } };
  assert.throws(() => rescoreRadar(none, { current: [3, 4, 5], objective: [8, 8, 9] }, deps), (err) => err.status === 409);
  assert.throws(() => rescoreRadar(radarSession('frame'), { current: [3, 4, 5], objective: [8, 8, 9] }, deps), (err) => err.status === 409);
});

function treeSession() {
  let s = createSession({ title: 'Evening training', text: 'I keep skipping evening training.' }, deps);
  s = applyCoachTurn(s, coach({ frame: { goal: 'Train three evenings a week', whatIsTrue: 'Trained once in four weeks', whatCanBeDone: 'Change what happens before training' }, model: { id: 'seven_step', reason: 'Default.' }, suggestion: { kind: 'next_tool', tool: 'problem_tree', reason: 'Several causes.' } }), deps);
  s = acceptSuggestion(s, deps);
  for (const [slot, text] of [['trunk', 'Inconsistent eating'], ['effect:1', 'No progress'], ['cause:1', 'Delayed payoff']]) {
    s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  }
  return s;
}

test('a finished tool always leaves a next step, even when the coach offers none', () => {
  let s = treeSession();
  assert.equal(s.suggestion, null, 'one cause is short of the tree minimum');
  s = applyCoachTurn(s, coach({ node: { slot: 'cause:2', text: 'Medication suppresses appetite' } }), deps);
  assert.equal(s.suggestion.kind, 'next_tool');
  assert.equal(s.suggestion.tool, 'problem_statement');
  s = acceptSuggestion(s, deps);
  assert.equal(activeRun(s).tool, 'problem_statement');
});

test('the coach\'s own suggestion wins over the fallback', () => {
  let s = treeSession();
  s = applyCoachTurn(s, coach({ node: { slot: 'cause:2', text: 'Medication suppresses appetite' }, suggestion: { kind: 'switch_tool', tool: 'concept_map', reason: 'Causes interact.' } }), deps);
  assert.equal(s.suggestion.tool, 'concept_map');
});
