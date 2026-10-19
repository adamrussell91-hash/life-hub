// tests/unit/problem-solver-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptSuggestion, activeRun, applyCoachTurn, createSession, dismissSuggestion,
  archive, moveOn, keepAnyway, score, rescoreRadar, say, summaryRow, followOn
} from '../../netlify/functions/_shared/problem-solver/session.mjs';

let counter = 0;
const deps = { now: () => '2026-10-19T10:00:00.000Z', newId: () => `id${(counter += 1)}` };
const coach = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, ...fields });

function framed(model = 'seven_step', tool = 'five_whys') {
  let s = createSession({ title: 'Late rota', text: 'The rota keeps changing late.' }, deps);
  s = applyCoachTurn(s, coach({ frame: { goal: 'Rota fixed a week ahead', whatIsTrue: 'Changed 3 of 4 weeks', whatCanBeDone: 'Change publish day' }, model: { id: model, reason: 'Default.' }, suggestion: { kind: 'next_tool', tool, reason: 'One symptom.' } }), deps);
  return acceptSuggestion(s, deps);
}

test('create starts a full session in frame with no steps', () => {
  const s = createSession({ title: '', text: 'The rota keeps changing late.', links: [{ kind: 'task', id: 't1' }] }, deps);
  assert.equal(s.kind, 'full');
  assert.equal(s.phase, 'frame');
  assert.deepEqual(s.steps, {});
  assert.deepEqual(s.learnings, []);
  assert.equal(s.pendingLearning, null);
  assert.equal(s.runner.status, 'queued');
  assert.deepEqual(s.links, [{ kind: 'task', id: 't1' }]);
});

test('the model opens its first plan step with the suggested tool', () => {
  const s = framed();
  assert.equal(s.phase, 'define');
  assert.equal(s.steps.define.status, 'open');
  assert.equal(activeRun(s).tool, 'five_whys');
  assert.equal(s.runner.status, 'queued');
  assert.equal(framed('polya').phase, 'identify');
  assert.equal(activeRun(framed('triz')).tool, 'five_whys');
});

test('accepted node is placed; challenged node waits for keep anyway', () => {
  let s = framed();
  s = applyCoachTurn(s, coach({ node: { slot: 'problem', text: 'Rota changes late.' }, skillsSeen: ['analysis'] }), deps);
  assert.equal(activeRun(s).nodes.length, 1);
  s = applyCoachTurn(s, coach({ verdict: 'challenge', message: 'That is a person, not a process.', node: { slot: 'why:1', text: 'Sam is disorganised.' } }), deps);
  assert.equal(s.pendingKeep.slot, 'why:1');
  s = keepAnyway(s, deps);
  assert.equal(activeRun(s).nodes[1].state, 'contested');
  assert.equal(s.runner.status, 'idle');
});

test('illegal slot from the coach throws for repair', () => {
  assert.throws(() => applyCoachTurn(framed(), coach({ node: { slot: 'why:3', text: 'x' } }), deps), (err) => err.code === 'illegal_slot');
});

test('switching keeps the abandoned run in the same step', () => {
  let s = framed();
  s = applyCoachTurn(s, coach({ verdict: 'clarify', suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'Causes branch.' } }), deps);
  s = acceptSuggestion(s, deps);
  assert.deepEqual(s.steps.define.runs.map((r) => [r.tool, r.status, r.switchReason]), [['five_whys', 'switched', 'Causes branch.'], ['problem_tree', 'active', undefined]]);
});

test('dismissing a suggestion clears it', () => {
  let s = applyCoachTurn(framed(), coach({ suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'r' } }), deps);
  assert.equal(dismissSuggestion(s, deps).suggestion, null);
});

test('moving on with an unfinished tool skips the step, opens the next and queues a boundary turn', () => {
  let s = moveOn(framed(), deps);
  assert.equal(s.steps.define.status, 'skipped');
  assert.equal(s.steps.define.runs[0].status, 'done');
  assert.equal(s.phase, 'analyse');
  assert.deepEqual(s.steps.analyse, { runs: [], status: 'open', objection: null });
  assert.deepEqual(s.runner, { status: 'queued', mode: 'boundary', error: null, leaving: 'define' });
  assert.equal(s.turns.at(-1).text, 'Move on.');
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'Fair. The root is still open. What did you learn about how you work through problems?', exitObjection: 'Root cause not reached.' }), deps);
  assert.equal(s.steps.define.objection, 'Root cause not reached.');
  assert.equal(s.pendingLearning, 'define');
  assert.equal(s.runner.mode, 'turn');
});

test('the answer after a boundary is recorded as a learning against the step left', () => {
  let s = applyCoachTurn(moveOn(framed(), deps), coach({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  s = say(s, 'I jump to blame when I am tired.', deps);
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'Noted.', learning: 'Jumps to blame when tired.' }), deps);
  assert.deepEqual(s.learnings, [{ step: 'define', text: 'Jumps to blame when tired.', at: '2026-10-19T10:00:00.000Z' }]);
  assert.equal(s.pendingLearning, null);
});

test('moving on from a step with a complete run marks it done', () => {
  let s = framed('seven_step', 'contradiction');
  for (const [slot, text] of [['improving', 'Speed'], ['worsening', 'Care'], ['statement', 'Speed costs care.']]) s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  assert.equal(moveOn(s, deps).steps.define.status, 'done');
});

test('moving on from the last step finishes the session', () => {
  let s = framed('polya');
  for (const _ of [1, 2, 3, 4]) s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.equal(s.phase, 'document');
  s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.equal(s.phase, 'finished');
  assert.equal(s.status, 'finished');
  assert.equal(s.runner.leaving, 'document');
  assert.equal(s.turns.at(-1).text, 'That is everything.');
});

test('move on before a model exists is refused', () => {
  assert.throws(() => moveOn(createSession({ text: 'ok' }, deps), deps), (err) => err.status === 409);
});

test('a next_step suggestion is accepted as move on', () => {
  let s = framed();
  s = { ...s, suggestion: { kind: 'next_step', reason: 'Ready.' } };
  s = acceptSuggestion(s, deps);
  assert.equal(s.phase, 'analyse');
  assert.equal(s.suggestion, null);
});

test('after the learning is recorded, a step with no tool falls back to its default tool', () => {
  let s = framed('triz');
  s = moveOn(s, deps);
  assert.equal(s.phase, 'general_problem');
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'What did you learn?', suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'ignored at a boundary' } }), deps);
  assert.equal(s.suggestion, null, 'the boundary turn asks the learning question first');
  s = applyCoachTurn(say(s, 'I rush.', deps), coach({ verdict: 'clarify', message: 'Noted.', learning: 'Rushes.' }), deps);
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'contradiction', reason: 'A good first tool for General problem.' });
});

function treeSession() {
  let s = framed('seven_step', 'problem_tree');
  for (const [slot, text] of [['trunk', 'Inconsistent eating'], ['effect:1', 'No progress'], ['cause:1', 'Delayed payoff']]) s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  return s;
}

test('Define keeps its chain: diagnostic, then statement, then SMART, then next step', () => {
  let s = treeSession();
  assert.equal(s.suggestion, null);
  s = applyCoachTurn(s, coach({ node: { slot: 'cause:2', text: 'Medication suppresses appetite' } }), deps);
  assert.deepEqual([s.suggestion.kind, s.suggestion.tool], ['next_tool', 'problem_statement']);
  s = acceptSuggestion(s, deps);
  for (const [slot, text] of [['problem', 'p'], ['impact', 'i'], ['benefit', 'b'], ['statement', 'st']]) s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  assert.equal(s.suggestion.tool, 'smart');
  s = acceptSuggestion(s, deps);
  assert.deepEqual(s.steps.define.runs.map((r) => r.status), ['done', 'done', 'active']);
});

test('outside Define a complete tool suggests the next step', () => {
  const s = { ...framed(), phase: 'analyse', steps: { define: { runs: [], status: 'done', objection: null }, analyse: { runs: [{ id: 'c', tool: 'contradiction', status: 'active', nodes: ['improving', 'worsening', 'statement'].map((slot, i) => ({ id: `n${i}`, slot, text: slot, state: 'accepted', skills: [], turnId: 't' })), edges: [] }], status: 'open', objection: null } } };
  assert.equal(followOn(s).kind, 'next_step');
});

test('the coach\'s own suggestion wins over the fallback', () => {
  const s = applyCoachTurn(treeSession(), coach({ node: { slot: 'cause:2', text: 'Medication' }, suggestion: { kind: 'switch_tool', tool: 'concept_map', reason: 'Causes interact.' } }), deps);
  assert.equal(s.suggestion.tool, 'concept_map');
});

function radarSession(phase = 'define', status = 'active') {
  const nodes = ['current', 'objective', 'axis:1', 'axis:2', 'axis:3'].map((slot, i) => ({ id: `x${i}`, slot, text: slot, state: 'accepted', skills: [], turnId: 't' }));
  const base = createSession({ title: 'Radar', text: 'Scores to track.' }, deps);
  return { ...base, model: { id: 'seven_step', reason: '' }, phase, runner: { status: 'idle', mode: 'turn', error: null }, steps: { define: { runs: [{ id: 'run', tool: 'gap_radar', status, nodes, edges: [], radar: { snapshots: [] } }], status: phase === 'define' ? 'open' : 'done', objection: null } } };
}

test('score appends a snapshot to the named run, or the active scorable run', () => {
  const s = score(radarSession(), { runId: 'run', current: [3, 4, 5], objective: [8, 8, 9] }, deps);
  assert.deepEqual(s.steps.define.runs[0].radar.snapshots, [{ at: '2026-10-19T10:00:00.000Z', current: [3, 4, 5], objective: [8, 8, 9] }]);
  assert.equal(score(radarSession(), { current: [3, 4, 5], objective: [8, 8, 9] }, deps).steps.define.runs[0].radar.snapshots.length, 1);
  assert.equal(s.runner.status, 'idle');
});

test('score works in later steps and once finished (tracking progress)', () => {
  assert.equal(score(radarSession('analyse', 'done'), { runId: 'run', current: [3, 4, 5], objective: [8, 8, 9] }, deps).steps.define.runs[0].radar.snapshots.length, 1);
  assert.equal(score(radarSession('finished', 'done'), { runId: 'run', current: [3, 4, 5], objective: [8, 8, 9] }, deps).steps.define.runs[0].radar.snapshots.length, 1);
});

test('score rejects bad scores with a 400 and the tool message; frame and missing runs are 409', () => {
  assert.throws(() => score(radarSession(), { runId: 'run', current: [3, 4], objective: [8, 8, 9] }, deps), (err) => err.status === 400 && /one score per topic/.test(err.message));
  assert.throws(() => score(radarSession('frame'), { runId: 'run', current: [3, 4, 5], objective: [8, 8, 9] }, deps), (err) => err.status === 409);
  assert.throws(() => score(radarSession(), { runId: 'nope', current: [3, 4, 5], objective: [8, 8, 9] }, deps), (err) => err.status === 409);
});

test('rescoreRadar is an alias for scoring the latest radar run', () => {
  assert.equal(rescoreRadar(radarSession(), { current: [3, 4, 5], objective: [8, 8, 9] }, deps).steps.define.runs[0].radar.snapshots.length, 1);
});

test('say appends a user turn and queues; summary rows are small', () => {
  const s = say(framed(), 'Because the roster is drafted on Friday.', deps);
  assert.equal(s.runner.status, 'queued');
  const row = summaryRow(s);
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'frame', 'id', 'kind', 'links', 'model', 'phase', 'skills', 'status', 'title', 'tool', 'updatedAt']);
  assert.equal(row.tool, 'five_whys');
  assert.equal(summaryRow(row), row);
});

test('summary rows count answered frame questions and skills seen', () => {
  let s = createSession({ title: 'Late rota', text: 'x' }, deps);
  s = applyCoachTurn(s, coach({ frame: { goal: 'g' }, skillsSeen: ['analysis', 'inference'] }), deps);
  assert.equal(summaryRow(s).frame, 1);
  assert.deepEqual(summaryRow(s).skills, { analysis: 1, inference: 1 });
});

test('limits: text over 12000 chars, title cap, links cap', () => {
  const big = 'x'.repeat(12001);
  assert.throws(() => createSession({ text: big }, deps), (err) => err.status === 413 && err.code === 'limit');
  const s = createSession({ text: 'ok', links: Array.from({ length: 30 }, (_, i) => ({ kind: 'task', id: `t${i}` })) }, deps);
  assert.equal(s.links.length, 20);
  assert.equal(createSession({ title: 't'.repeat(300), text: 'ok' }, deps).title.length, 120);
});

test('archive resets the runner', () => {
  assert.deepEqual(archive(createSession({ text: 'ok' }, deps), deps).runner, { status: 'idle', mode: 'turn', error: null });
});

test('keepAnyway with a slot that no longer fits is a 409', () => {
  let s = framed();
  s = applyCoachTurn(s, coach({ node: { slot: 'problem', text: 'y' } }), deps);
  s = { ...s, pendingKeep: { slot: 'problem', text: 'x', objection: 'o', skills: [], runId: activeRun(s).id } };
  assert.throws(() => keepAnyway(s, deps), (err) => err.status === 409 && err.message === 'That answer no longer fits here.');
});

test('the last step\'s learning is recorded once the session is finished', () => {
  let s = framed('polya');
  for (const _ of [1, 2, 3, 4, 5]) s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.equal(s.phase, 'finished');
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  s = applyCoachTurn(say(s, 'I rush.', deps), coach({ verdict: 'clarify', message: 'Noted.', learning: 'Rushes.' }), deps);
  assert.deepEqual(s.learnings, [{ step: 'document', text: 'Rushes.', at: '2026-10-19T10:00:00.000Z' }]);
  assert.equal(s.pendingLearning, null);
});

test('the learning question is one-shot: pendingLearning clears even with no learning', () => {
  let s = applyCoachTurn(moveOn(framed(), deps), coach({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  s = applyCoachTurn(say(s, 'Not sure.', deps), coach({ verdict: 'clarify', message: 'Fine.' }), deps);
  assert.equal(s.pendingLearning, null);
  assert.deepEqual(s.learnings, []);
  assert.equal(s.suggestion, null);
  let t = applyCoachTurn(moveOn(framed('triz'), deps), coach({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  t = applyCoachTurn(say(t, 'Not sure.', deps), coach({ verdict: 'clarify', message: 'Fine.' }), deps);
  assert.equal(t.pendingLearning, null);
  assert.equal(t.suggestion.tool, 'contradiction');
});

test('moving on from an archived session is refused', () => {
  const s = archive(framed(), deps);
  assert.throws(() => moveOn(s, deps), (err) => err.status === 409 && err.code === 'action_not_allowed' && err.message === 'This problem is archived.');
});
