// tests/unit/problem-solver-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptSuggestion, activeRun, applyCoachTurn, createSession, dismissSuggestion,
  archive, moveOn, keepAnyway, score, rescoreRadar, say, summaryRow, followOn,
  confirmTask, dismissTask, setReviewTask, dismissReview,
  startReview, taskStatus, reopenProblem, waitingForReview, linkCaseFile, dismissCaseFile
} from '../../netlify/functions/_shared/problem-solver/session.mjs';

import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { newRun } from '../../packages/problem-solver/machine.mjs';
import { nextPhase } from '../../packages/problem-solver/steps.mjs';

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

test('a boundary after skipping a step with no runs sets no pending learning', () => {
  let s = applyCoachTurn(moveOn(framed(), deps), coach({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  assert.equal(s.pendingLearning, 'define');
  s = applyCoachTurn(say(s, 'I rush.', deps), coach({ verdict: 'clarify', message: 'Noted.', learning: 'Rushes.' }), deps);
  s = moveOn(s, deps);
  assert.equal(s.steps.analyse.status, 'skipped');
  assert.equal(s.steps.analyse.runs.length, 0);
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'Skipped. What do you want from Devise?' }), deps);
  assert.equal(s.pendingLearning, null);
});

test('a dismissed opening suggestion stays dismissed until the step changes', () => {
  let s = moveOn(framed('triz'), deps);
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  s = applyCoachTurn(say(s, 'I rush.', deps), coach({ verdict: 'clarify', message: 'Noted.', learning: 'Rushes.' }), deps);
  assert.equal(s.suggestion.tool, 'contradiction');
  s = dismissSuggestion(s, deps);
  assert.equal(s.dismissedOpening, 'general_problem');
  s = applyCoachTurn(say(s, 'Let me think.', deps), coach({ verdict: 'clarify', message: 'Go on.' }), deps);
  assert.equal(s.suggestion, null, 'the opening suggestion does not come back');
  s = applyCoachTurn(moveOn(s, deps), coach({ verdict: 'clarify', message: 'Skipped.' }), deps);
  assert.notEqual(s.phase, 'general_problem');
  assert.equal(s.suggestion, null);
  s = applyCoachTurn(say(s, 'Ok.', deps), coach({ verdict: 'clarify', message: 'Go on.' }), deps);
  assert.ok(s.suggestion === null || s.suggestion.kind === 'next_tool', 'a new step can open with a suggestion again');
});

test('dismissing a mid-run suggestion does not mark the opening dismissed', () => {
  let s = applyCoachTurn(framed(), coach({ suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'r' } }), deps);
  assert.equal(dismissSuggestion(s, deps).dismissedOpening ?? null, null);
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
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'escalatedTo', 'frame', 'id', 'kind', 'links', 'model', 'phase', 'reviewDue', 'reviewTaskId', 'skills', 'status', 'taskIds', 'title', 'tool', 'updatedAt']);
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
  for (const _ of [1, 2, 3, 4]) s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  // The last step was worked in (a run), so there is something to have learned from it.
  s = { ...s, steps: { ...s.steps, document: { ...s.steps.document, runs: [{ id: 'doc', tool: 'five_whys', status: 'active', nodes: [], edges: [] }] } } };
  s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.equal(s.phase, 'finished');
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  s = applyCoachTurn(say(s, 'I rush.', deps), coach({ verdict: 'clarify', message: 'Noted.', learning: 'Rushes.' }), deps);
  assert.deepEqual(s.learnings, [{ step: 'document', text: 'Rushes.', at: '2026-10-19T10:00:00.000Z' }]);
  assert.equal(s.pendingLearning, null);
});

test('the learning question is one-shot: pendingLearning clears even with no learning', async () => {
  await withoutAnalyseTools(() => {
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
});

test('moving on from an archived session is refused', () => {
  const s = archive(framed(), deps);
  assert.throws(() => moveOn(s, deps), (err) => err.status === 409 && err.code === 'action_not_allowed' && err.message === 'This problem is archived.');
});

test('a placed node keeps its tag, and so does a kept challenged node', () => {
  let s = framed('seven_step', 'problem_tree');
  s = applyCoachTurn(s, coach({ node: { slot: 'trunk', text: 'Late deliveries', tag: 'x' } }), deps);
  assert.equal(activeRun(s).nodes[0].tag, 'x');
  s = applyCoachTurn(s, coach({ verdict: 'challenge', message: 'Symptom.', node: { slot: 'cause:1', text: 'Busy', tag: 'y' } }), deps);
  s = keepAnyway(s, deps);
  assert.equal(activeRun(s).nodes[1].tag, 'y');
});

test('keep anyway also places the links proposed with a challenged answer', () => {
  let s = framed('seven_step', 'problem_tree');
  for (const [slot, text] of [['trunk', 'Inconsistent eating'], ['cause:1', 'Delayed payoff']]) s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  s = applyCoachTurn(s, coach({ verdict: 'challenge', message: 'Symptom.', node: { slot: 'effect:1', text: 'No progress' }, edges: [{ from: 'cause:1', to: 'effect:1', kind: 'relates' }] }), deps);
  assert.equal(s.pendingKeep.edges.length, 1);
  s = keepAnyway(s, deps);
  const run = activeRun(s);
  const id = (slot) => run.nodes.find((n) => n.slot === slot).id;
  assert.deepEqual(run.edges, [{ from: id('cause:1'), to: id('effect:1'), kind: 'relates' }]);
});

test('an accepted turn with links and no node adds the links to the active run', () => {
  let s = framed('seven_step', 'problem_tree');
  for (const [slot, text] of [['trunk', 't'], ['cause:1', 'c'], ['effect:1', 'e']]) s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  s = applyCoachTurn(s, coach({ node: null, edges: [{ from: 'cause:1', to: 'effect:1', kind: 'relates' }] }), deps);
  assert.equal(activeRun(s).edges.length, 1);
});

function inStep(step, tool) {
  const s = framed('seven_step', 'five_whys');
  return { ...s, phase: step, runner: { status: 'idle', mode: 'turn', error: null }, steps: { ...s.steps, [step]: { runs: [newRun(tool, `run-${step}`)], status: 'open', objection: null } } };
}
const card = (i, tag = 'todo') => ({ slot: `card:${i}`, text: `Draft rota task number ${i} for the team`, tag });

test('a new session starts with no proposals and no review', () => {
  const s = createSession({ text: 'Late rota.' }, deps);
  assert.deepEqual(s.proposedTasks, []);
  assert.equal(s.reviewProposal, null);
  assert.equal(s.reviewTaskId, null);
});

test('an accepted card proposed as a task becomes one proposal tied to its node; repeats, done cards and unknown slots are dropped', () => {
  let s = inStep('implement', 'kanban');
  s = applyCoachTurn(s, coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft the rota template', due: '2026-10-24' }] }), deps);
  assert.equal(s.proposedTasks.length, 1);
  const [p] = s.proposedTasks;
  assert.equal(p.status, 'proposed');
  assert.equal(p.due, '2026-10-24');
  assert.deepEqual(p.source, { runId: 'run-implement', nodeId: activeRun(s).nodes[0].id });
  s = applyCoachTurn(s, coach({ node: card(2, 'done'), proposeTasks: [{ slot: 'card:1', title: 'Again', due: null }, { slot: 'card:2', title: 'Done one', due: null }, { slot: 'card:9', title: 'Ghost', due: null }] }), deps);
  assert.equal(s.proposedTasks.length, 1);
});

test('proposals outside Implement tools are dropped', () => {
  let s = framed('seven_step', 'five_whys');
  s = applyCoachTurn(s, coach({ node: { slot: 'problem', text: 'Swaps are agreed by text message' }, proposeTasks: [{ slot: 'problem', title: 'Fix it', due: null }] }), deps);
  assert.deepEqual(s.proposedTasks, []);
});

test('confirm_task records the created task once; dismissed proposals cannot be confirmed', () => {
  let s = applyCoachTurn(inStep('implement', 'kanban'), coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft', due: null }] }), deps);
  const id = s.proposedTasks[0].id;
  s = confirmTask(s, { proposalId: id, taskId: 'task-1' }, deps);
  assert.equal(s.proposedTasks[0].status, 'confirmed');
  assert.equal(s.proposedTasks[0].taskId, 'task-1');
  assert.equal(confirmTask(s, { proposalId: id, taskId: 'task-1' }, deps).proposedTasks[0].taskId, 'task-1', 'same id is a no-op');
  assert.throws(() => confirmTask(s, { proposalId: id, taskId: 'task-2' }, deps), (err) => err.status === 409);
  assert.throws(() => confirmTask(s, { proposalId: 'nope', taskId: 'task-2' }, deps), (err) => err.status === 404);
  assert.throws(() => confirmTask(s, { proposalId: id, taskId: '' }, deps), (err) => err.status === 400);
});

test('dismiss_task drops a proposal; a confirmed one reverts only when its task was removed', () => {
  let s = applyCoachTurn(inStep('implement', 'kanban'), coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft', due: null }] }), deps);
  s = applyCoachTurn(s, coach({ node: card(2), proposeTasks: [{ slot: 'card:2', title: 'Ask', due: null }] }), deps);
  const [a, b] = s.proposedTasks.map((p) => p.id);
  s = dismissTask(s, { proposalId: a }, deps);
  assert.equal(s.proposedTasks[0].status, 'dismissed');
  s = confirmTask(s, { proposalId: b, taskId: 'task-2' }, deps);
  assert.throws(() => dismissTask(s, { proposalId: b }, deps), (err) => err.status === 409);
  s = dismissTask(s, { proposalId: b, reason: 'removed' }, deps);
  assert.equal(s.proposedTasks[1].status, 'dismissed');
  assert.equal(s.proposedTasks[1].removed, true);
  assert.throws(() => confirmTask(s, { proposalId: a, taskId: 'x' }, deps), (err) => err.status === 409);
  // Adam's decision: a node whose task was deleted is never proposed again.
  s = applyCoachTurn(s, coach({ verdict: 'clarify', proposeTasks: [{ slot: 'card:2', title: 'Ask again', due: null }] }), deps);
  assert.equal(s.proposedTasks.length, 2);
  // A proposal the person set aside (not deleted) may be offered again.
  s = applyCoachTurn(s, coach({ verdict: 'clarify', proposeTasks: [{ slot: 'card:1', title: 'Draft again', due: null }] }), deps);
  assert.equal(s.proposedTasks.length, 3);
});

test('leaving Implement with a finished tool proposes a review in two weeks; leaving it untouched does not', () => {
  let s = inStep('implement', 'kanban');
  for (const i of [1, 2, 3]) s = applyCoachTurn(s, coach({ node: card(i) }), deps);
  const left = moveOn(s, deps);
  assert.deepEqual(left.reviewProposal, { title: 'Review: Late rota', due: '2026-11-02', reason: 'A first look at how the plan is going.', status: 'proposed' });
  const untouched = { ...s, steps: { ...s.steps, implement: { runs: [], status: 'open', objection: null } } };
  assert.equal(moveOn(untouched, deps).reviewProposal, null);
});

test('the coach can propose the review date in Implement; the person confirms or dismisses it', () => {
  let s = inStep('implement', 'kanban');
  s = applyCoachTurn(s, coach({ verdict: 'clarify', proposeReview: { due: '2026-11-09', reason: 'The pilot ends then.' } }), deps);
  assert.equal(s.reviewProposal.due, '2026-11-09');
  assert.equal(s.reviewProposal.status, 'proposed');
  const dismissed = dismissReview(s, deps);
  assert.equal(dismissed.reviewProposal.status, 'dismissed');
  s = setReviewTask(s, { taskId: 'review-1', due: '2026-11-10' }, deps);
  assert.equal(s.reviewTaskId, 'review-1');
  assert.equal(s.reviewProposal.status, 'confirmed');
  assert.equal(s.reviewProposal.due, '2026-11-10');
  assert.throws(() => setReviewTask(s, { taskId: 'review-2', due: '2026-11-10' }, deps), (err) => err.status === 409);
  const moved = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.equal(moved.reviewProposal.due, '2026-11-10', 'an existing review is never replaced on leaving');
});

test('a review proposed outside Implement is ignored', () => {
  const s = applyCoachTurn(framed('seven_step', 'five_whys'), coach({ verdict: 'clarify', proposeReview: { due: '2026-11-09', reason: 'x' } }), deps);
  assert.equal(s.reviewProposal, null);
});

test('summary rows carry confirmed task ids and the review task id', () => {
  let s = applyCoachTurn(inStep('implement', 'kanban'), coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft', due: null }] }), deps);
  s = confirmTask(s, { proposalId: s.proposedTasks[0].id, taskId: 'task-1' }, deps);
  s = setReviewTask(s, { taskId: 'review-1', due: '2026-11-02' }, deps);
  const row = summaryRow(s);
  assert.deepEqual(row.taskIds, ['task-1']);
  assert.equal(row.reviewTaskId, 'review-1');
});

test('a review the person set aside is not revived by a later coach turn', () => {
  let s = inStep('implement', 'kanban');
  s = applyCoachTurn(s, coach({ verdict: 'clarify', proposeReview: { due: '2026-11-09', reason: 'The pilot ends then.' } }), deps);
  s = dismissReview(s, deps);
  s = applyCoachTurn(s, coach({ verdict: 'clarify', proposeReview: { due: '2026-11-16', reason: 'Try again.' } }), deps);
  assert.equal(s.reviewProposal.status, 'dismissed');
  assert.equal(s.reviewProposal.due, '2026-11-09');
});

test('setReviewTask ignores an impossible date and keeps the proposed one', () => {
  let s = applyCoachTurn(inStep('implement', 'kanban'), coach({ verdict: 'clarify', proposeReview: { due: '2026-11-09', reason: 'r' } }), deps);
  s = setReviewTask(s, { taskId: 'review-1', due: '2026-02-31' }, deps);
  assert.equal(s.reviewProposal.due, '2026-11-09');
});

test('coach due dates on or before today are dropped: a task keeps no date, a review is ignored', () => {
  let s = inStep('implement', 'kanban');
  s = applyCoachTurn(s, coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft', due: '2026-10-19' }] }), deps);
  assert.equal(s.proposedTasks[0].due, null);
  s = applyCoachTurn(s, coach({ node: card(2), proposeTasks: [{ slot: 'card:2', title: 'Ask', due: '2026-10-01' }] }), deps);
  assert.equal(s.proposedTasks[1].due, null);
  s = applyCoachTurn(s, coach({ verdict: 'clarify', proposeReview: { due: '2026-10-19', reason: 'today' } }), deps);
  assert.equal(s.reviewProposal, null);
});

test('a missing or non-string proposal id is a validation error', () => {
  const s = applyCoachTurn(inStep('implement', 'kanban'), coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft', due: null }] }), deps);
  for (const proposalId of [undefined, 7, '']) {
    assert.throws(() => confirmTask(s, { proposalId, taskId: 'task-1' }, deps), (err) => err.status === 400 && err.code === 'validation_error');
    assert.throws(() => dismissTask(s, { proposalId }, deps), (err) => err.status === 400 && err.code === 'validation_error');
  }
});

test('switching tools sets aside the old run\'s open proposals but keeps confirmed ones', () => {
  let s = applyCoachTurn(inStep('implement', 'kanban'), coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft', due: null }] }), deps);
  s = applyCoachTurn(s, coach({ node: card(2), proposeTasks: [{ slot: 'card:2', title: 'Ask', due: null }] }), deps);
  s = confirmTask(s, { proposalId: s.proposedTasks[1].id, taskId: 'task-2' }, deps);
  s = applyCoachTurn(s, coach({ verdict: 'clarify', suggestion: { kind: 'switch_tool', tool: 'eisenhower', reason: 'Priorities, not flow.' } }), deps);
  s = acceptSuggestion(s, deps);
  assert.equal(s.proposedTasks[0].status, 'dismissed');
  assert.equal(s.proposedTasks[0].removed, undefined);
  assert.equal(s.proposedTasks[1].status, 'confirmed');
});


const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });

/** A seven-step session moved on to `phase`; the steps before it are skipped untouched. */
function at(phase) {
  let s = idle(framed());
  while (s.phase !== phase) s = idle(moveOn(s, deps));
  return s;
}

/** In Implement with a finished 15% run, so leaving it proposes a review. */
function implementDone() {
  let s = idle(acceptSuggestion({ ...at('implement'), suggestion: { kind: 'next_tool', tool: 'fifteen_percent', reason: 'r' } }, deps));
  for (const [slot, text] of [['reflect', 'We control which day the rota goes out'], ['action:1', 'Move publish day to Wednesday'], ['action:2', 'Ask for swaps by Tuesday']]) {
    s = idle(applyCoachTurn(s, coach({ node: { slot, text } }), deps));
  }
  return idle(applyCoachTurn(s, coach({ node: { slot: 'chosen:1', text: 'Move publish day now' }, edges: [{ from: 'chosen:1', to: 'action:1', kind: 'picks' }] }), deps));
}

const snapshot = { byStatus: { open: 1, done: 2, bogus: 9 }, overdue: ['Ask for swaps by Tuesday', 7, 'Ask for swaps by Tuesday'] };

test('leaving a finished Implement opens Improve waiting for the review', () => {
  const s = idle(moveOn(implementDone(), deps));
  assert.equal(s.phase, 'improve');
  assert.equal(s.reviewProposal.status, 'proposed');
  assert.deepEqual(s.reviewState, { status: 'waiting', due: s.reviewProposal.due, returnTo: null, startedAt: null });
  assert.equal(waitingForReview(s), true);
});

test('Implement skipped untouched leaves no review, so Improve does not wait', () => {
  const s = idle(moveOn(at('implement'), deps));
  assert.equal(s.phase, 'improve');
  assert.equal(s.reviewState, null);
});

test('while Improve waits, the coach suggests no tool', () => {
  let s = applyCoachTurn(moveOn(implementDone(), deps), coach({}), deps);
  assert.equal(s.pendingLearning, 'implement');
  s = applyCoachTurn(idle(s), coach({ learning: 'I plan better with a date.', suggestion: { kind: 'next_tool', tool: 'after_action_review', reason: 'r' } }), deps);
  assert.equal(s.suggestion, null);
});

test('moving on while waiting marks Improve waiting and keeps the review open', () => {
  const s = idle(moveOn(idle(moveOn(implementDone(), deps)), deps));
  assert.equal(s.phase, 'document');
  assert.equal(s.steps.improve.status, 'waiting');
  assert.equal(s.reviewState.status, 'waiting');
});

test('a boundary turn never records an objection on a waiting step', () => {
  const left = moveOn(idle(moveOn(implementDone(), deps)), deps);
  const s = applyCoachTurn(left, coach({ exitObjection: 'You skipped Improve.' }), deps);
  assert.equal(s.steps.improve.status, 'waiting');
  assert.equal(s.steps.improve.objection, null);
});

test('start_review in a waiting Improve starts it with the task snapshot', () => {
  let s = idle(moveOn(implementDone(), deps));
  s = startReview(s, { snapshot }, deps);
  assert.equal(s.reviewState.status, 'reviewing');
  assert.equal(s.reviewState.startedAt, deps.now());
  assert.deepEqual(s.taskSnapshot, { at: deps.now(), byStatus: { open: 1, in_progress: 0, deferred: 0, done: 2, dead: 0, unknown: 0 }, overdue: ['Ask for swaps by Tuesday'] });
  assert.equal(s.runner.status, 'queued');
  assert.equal(s.turns.at(-1).text, 'Let\'s review how it went.');
  const again = startReview(idle(s), {}, deps);
  assert.equal(again.turns.length, s.turns.length, 'starting twice changes nothing');
});

test('start_review from Implement leaves it straight into the review', () => {
  const s = startReview({ ...implementDone(), reviewTaskId: 'task9', reviewProposal: { title: 'Review: Late rota', due: '2026-11-02', reason: '', status: 'confirmed' } }, {}, deps);
  assert.equal(s.phase, 'improve');
  assert.equal(s.reviewState.status, 'reviewing');
  assert.equal(s.reviewState.due, '2026-11-02');
  assert.equal(s.runner.mode, 'boundary');
});

test('a late review reopens Improve, then returns to where the session was', () => {
  let s = idle(moveOn(implementDone(), deps));
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'document');
  let late = idle(startReview(s, {}, deps));
  assert.equal(late.phase, 'improve');
  assert.equal(late.steps.improve.status, 'open');
  assert.equal(late.reviewState.returnTo, 'document');
  assert.equal(nextPhase(late), 'document');
  late = idle(moveOn(late, deps));
  assert.equal(late.phase, 'document');
  assert.equal(late.reviewState.status, 'done');

  s = idle(moveOn(s, deps));
  assert.equal(s.status, 'finished');
  s = idle(startReview(s, {}, deps));
  assert.equal(s.status, 'active');
  assert.equal(s.reviewState.returnTo, 'finished');
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'finished');
  assert.equal(s.status, 'finished');
});

test('start_review needs a live review, and is refused before Implement is done', () => {
  assert.throws(() => startReview(at('improve'), {}, deps), /no review to start/);
  assert.throws(() => startReview({ ...at('decide'), reviewTaskId: 'task9' }, {}, deps), /once Implement is done/);
});

test('setting the review aside while waiting lets Improve run now', () => {
  const s = dismissReview(idle(moveOn(implementDone(), deps)), deps);
  assert.equal(s.reviewState, null);
  assert.equal(s.suggestion?.tool, 'after_action_review');
});

test('task_status stores a cleaned snapshot without calling the coach; the same snapshot is a no-op', () => {
  let s = idle(dismissReview(idle(moveOn(implementDone(), deps)), deps));
  s = taskStatus(s, { snapshot }, deps);
  assert.equal(s.taskSnapshot.byStatus.done, 2);
  assert.equal(s.runner.status, 'idle');
  assert.equal(taskStatus(s, { snapshot }, deps), s);
  assert.throws(() => taskStatus(s, { snapshot: 'x' }, deps), /must be an object/);
});

/** Improve with a double-loop run that has named a governing assumption. */
function inDoubleLoop() {
  let s = idle(dismissReview(idle(moveOn(implementDone(), deps)), deps));
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool: 'double_loop', reason: 'r' } }, deps));
  for (const [slot, text, tag] of [['problem', 'The rota is still late'], ['single', 'We moved the publish day'], ['recurs', 'Late again in week four', 'yes'], ['governing:1', 'Only the manager may sign it off']]) {
    s = idle(applyCoachTurn(s, coach({ node: { slot, text, ...(tag ? { tag } : {}) } }), deps));
  }
  return s;
}

test('reopening Define from Improve is a detour; moving on returns to Improve', () => {
  let s = inDoubleLoop();
  assert.equal(reopenProblem(s, 'define'), null);
  assert.match(reopenProblem(s, 'contradiction'), /no contradiction step/);
  const loopRun = activeRun(s).id;
  s = acceptSuggestion({ ...s, suggestion: { kind: 'reopen_step', step: 'define', reason: 'The sign-off rule was never questioned.' } }, deps);
  assert.equal(s.phase, 'define');
  assert.deepEqual(s.detour, { from: 'improve', to: 'define', reason: 'The sign-off rule was never questioned.', at: deps.now() });
  assert.equal(s.steps.improve.runs.find((run) => run.id === loopRun).status, 'done');
  assert.equal(s.steps.define.status, 'open');
  assert.equal(s.runner.mode, 'turn');
  assert.equal(nextPhase(s), 'improve');
  s = moveOn(idle(s), deps);
  assert.equal(s.phase, 'improve');
  assert.equal(s.detour, null);
  assert.equal(s.runner.mode, 'boundary');
  assert.equal(s.runner.leaving, 'define');
});

test('reopen is refused while waiting and before double-loop names a governing assumption', () => {
  const waiting = idle(moveOn(implementDone(), deps));
  assert.match(reopenProblem(waiting, 'define'), /waiting/);
  assert.match(reopenProblem(idle(dismissReview(waiting, deps)), 'define'), /governing assumption/);
  assert.match(reopenProblem(at('decide'), 'define'), /only from Improve/);
});

test('the summary row carries the review date while waiting', () => {
  const waiting = idle(moveOn(implementDone(), deps));
  assert.equal(summaryRow(waiting).reviewDue, waiting.reviewProposal.due);
  assert.equal(summaryRow(at('decide')).reviewDue, null);
});

test('snapshot counts clamp to 500', () => {
  const s = taskStatus(dismissReview(idle(moveOn(implementDone(), deps)), deps), { snapshot: { byStatus: { open: 9000, done: -1 }, overdue: [] } }, deps);
  assert.equal(s.taskSnapshot.byStatus.open, 500);
  assert.equal(s.taskSnapshot.byStatus.done, 0);
});

test('task_status is refused on an archived problem', () => {
  assert.throws(() => taskStatus(archive(at('improve'), deps), { snapshot }, deps), /archived/);
});

test('leaving a waiting Improve asks no learning question', () => {
  const left = moveOn(idle(moveOn(implementDone(), deps)), deps);
  const s = applyCoachTurn(left, coach({}), deps);
  assert.equal(s.pendingLearning, null);
});

test('setting the review aside after leaving Improve resolves the waiting step', () => {
  const s = dismissReview(idle(moveOn(idle(moveOn(implementDone(), deps)), deps)), deps);
  assert.equal(s.steps.improve.status, 'skipped');
  assert.equal(s.reviewState, null);
});

test('start_review is refused once the review is done, and during a detour', () => {
  let s = idle(startReview(idle(moveOn(implementDone(), deps)), {}, deps));
  s = idle(moveOn(s, deps));
  assert.equal(s.reviewState.status, 'done');
  assert.throws(() => startReview(s, {}, deps), /already done/);

  const loop = inDoubleLoop();
  const reviewing = { ...loop, reviewProposal: { title: 'r', due: '2026-11-02', reason: '', status: 'confirmed' } };
  const detour = acceptSuggestion({ ...reviewing, suggestion: { kind: 'reopen_step', step: 'define', reason: 'Why.' } }, deps);
  assert.throws(() => startReview(idle(detour), {}, deps), /reopened step/);
});

test('a reopen during a late review returns to Improve, then to where the session was', () => {
  let s = idle(moveOn(idle(moveOn(implementDone(), deps)), deps));
  s = idle(startReview(s, {}, deps));
  assert.equal(s.reviewState.returnTo, 'document');
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool: 'double_loop', reason: 'r' } }, deps));
  for (const [slot, text, tag] of [['problem', 'The rota is still late'], ['single', 'We moved the publish day'], ['recurs', 'Late again in week four', 'yes'], ['governing:1', 'Only the manager may sign it off']]) {
    s = idle(applyCoachTurn(s, coach({ node: { slot, text, ...(tag ? { tag } : {}) } }), deps));
  }
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'reopen_step', step: 'define', reason: 'Why.' } }, deps));
  assert.equal(s.phase, 'define');
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'improve');
  assert.equal(nextPhase(s), 'document');
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'document');
});

/** In Document with a 5 Cs run whose name is next. */
function namingNext() {
  let s = idle(acceptSuggestion({ ...at('document'), suggestion: { kind: 'next_tool', tool: 'five_cs', reason: 'r' } }, deps));
  for (const [slot, text] of [['contextualise', 'So next term starts without the same scramble'], ['categorise', 'On the Kitchen rota project page'], ['condense:1', 'Publish the rota on Wednesday'], ['correct', 'Nothing in it needs correcting now']]) {
    s = idle(applyCoachTurn(s, coach({ node: { slot, text } }), deps));
  }
  return s;
}
const NAME = 'Kitchen rota case file 20261020 v1 Final';
const named = () => idle(applyCoachTurn(namingNext(), coach({ node: { slot: 'correspond', text: NAME } }), deps));
const digests = { purpose: '0a1b2c3d', kept: '1a2b3c4d' };

test('a new session has no case file', () => {
  const s = createSession({ text: 'x' }, deps);
  assert.equal(s.caseFile, null);
  assert.equal(s.caseFileDeclined, null);
});

test('an accepted name that breaks a strict rule is not placed; Keep it anyway refuses it too', () => {
  let s = idle(applyCoachTurn(namingNext(), coach({ node: { slot: 'correspond', text: 'rota stuff' } }), deps));
  assert.equal(activeRun(s).nodes.some((x) => x.slot === 'correspond'), false);
  s = idle(applyCoachTurn(s, coach({ verdict: 'challenge', node: { slot: 'correspond', text: 'rota stuff' } }), deps));
  assert.equal(s.pendingKeep.slot, 'correspond');
  assert.throws(() => keepAnyway(s, deps), /naming rule: add the date/);
  s = idle(applyCoachTurn(s, coach({ node: { slot: 'correspond', text: NAME } }), deps));
  assert.equal(activeRun(s).nodes.at(-1).text, NAME);
});

test('link_case_file records the first write and links the page', () => {
  const s = linkCaseFile(named(), { target: { kind: 'project', id: 'proj1' }, version: 1, title: NAME, sections: digests }, deps);
  assert.deepEqual(s.caseFile, { title: NAME, version: 1, target: { kind: 'project', id: 'proj1' }, writtenAt: deps.now(), sections: digests, history: [{ version: 1, at: deps.now(), target: { kind: 'project', id: 'proj1' } }] });
  assert.deepEqual(s.links.at(-1), { kind: 'project', id: 'proj1' });
  assert.equal(s.runner.status, 'idle', 'no coach call');
  assert.equal(linkCaseFile(s, { target: { kind: 'project', id: 'proj1' }, version: 1, title: NAME, sections: digests }, deps), s, 'a retry is a no-op');
});

test('an update is the next version on the same page and merges its sections; a move replaces them', () => {
  const s = linkCaseFile(named(), { target: { kind: 'project', id: 'proj1' }, version: 1, title: NAME, sections: digests }, deps);
  const up = linkCaseFile(s, { target: { kind: 'project', id: 'proj1' }, version: 2, title: 'Kitchen rota case file 20261102 v2 Final', sections: { learned: '2a3b4c5d' } }, deps);
  assert.equal(up.caseFile.version, 2);
  assert.deepEqual(up.caseFile.sections, { ...digests, learned: '2a3b4c5d' });
  assert.equal(up.caseFile.history.length, 2);
  assert.equal(up.links.filter((l) => l.id === 'proj1').length, 1);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'project', id: 'proj1' }, version: 3, title: NAME, sections: digests }, deps), /next case file version is v2/);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'task', id: 't9' }, version: 2, title: NAME, sections: digests }, deps), /already on/);
  const moved = linkCaseFile(s, { target: { kind: 'task', id: 't9' }, version: 2, title: NAME, sections: { kept: '9a9b9c9d' }, moved: true }, deps);
  assert.deepEqual(moved.caseFile.sections, { kept: '9a9b9c9d' });
  assert.deepEqual(moved.caseFile.target, { kind: 'task', id: 't9' });
});

test('link_case_file validates its payload', () => {
  const s = named();
  assert.throws(() => linkCaseFile(s, { target: { kind: 'goal', id: 'g' }, version: 1, title: NAME, sections: digests }, deps), /task or project/);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 0, title: NAME, sections: digests }, deps), /version/);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 1, title: '', sections: digests }, deps), /title/);
  assert.throws(() => linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 1, title: NAME, sections: { purpose: 'nothex!!' } }, deps), /sections/);
  assert.throws(() => linkCaseFile({ ...s, status: 'archived' }, { target: { kind: 'project', id: 'p' }, version: 1, title: NAME, sections: digests }, deps), /archived/);
});

test('Not now on the case file stores its key; a new write clears it', () => {
  let s = dismissCaseFile(named(), { key: 'abcdef12' }, deps);
  assert.equal(s.caseFileDeclined, 'abcdef12');
  assert.equal(dismissCaseFile(s, { key: 'abcdef12' }, deps), s);
  assert.throws(() => dismissCaseFile(s, { key: 'x' }, deps), /key/);
  s = linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 1, title: NAME, sections: digests }, deps);
  assert.equal(s.caseFileDeclined, null);
});

test('Document re-entered after a late review keeps its runs and its case file', () => {
  let s = idle(moveOn(implementDone(), deps));
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'document');
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool: 'five_cs', reason: 'r' } }, deps));
  s = linkCaseFile(s, { target: { kind: 'project', id: 'p' }, version: 1, title: NAME, sections: digests }, deps);
  s = idle(startReview(s, {}, deps));
  assert.equal(s.phase, 'improve');
  s = idle(moveOn(s, deps));
  assert.equal(s.phase, 'document');
  assert.equal(s.steps.document.runs.length, 1);
  assert.equal(s.caseFile.version, 1);
});

test('link_case_file adds its page even when the session already has 20 links', () => {
  const full = { ...named(), links: Array.from({ length: 20 }, (_, i) => ({ kind: 'task', id: `l${i}` })) };
  const s = linkCaseFile(full, { target: { kind: 'project', id: 'proj1' }, version: 1, title: NAME, sections: digests }, deps);
  assert.deepEqual(s.links.at(-1), { kind: 'project', id: 'proj1' });
});

test('a refused name drops the coach suggestion for that turn', () => {
  const s = idle(applyCoachTurn(namingNext(), coach({ node: { slot: 'correspond', text: 'rota stuff' }, suggestion: { kind: 'next_step', reason: 'Ready.' } }), deps));
  assert.equal(activeRun(s).nodes.some((x) => x.slot === 'correspond'), false);
  assert.equal(s.suggestion, null);
});
