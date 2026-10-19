// tests/unit/problem-solver-migrate.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSession, migrateRow } from '../../netlify/functions/_shared/problem-solver/migrate.mjs';
import { moveOn } from '../../netlify/functions/_shared/problem-solver/session.mjs';

const runs = [
  { id: 'r1', tool: 'five_whys', status: 'switched', switchReason: 'Branches', nodes: [], edges: [] },
  { id: 'r2', tool: 'problem_tree', status: 'done', nodes: [
    { id: 'a', slot: 'trunk', text: 't', state: 'accepted', skills: [], turnId: 'x' },
    { id: 'b', slot: 'cause:1', text: 'c1', state: 'accepted', skills: [], turnId: 'x' },
    { id: 'c', slot: 'cause:2', text: 'c2', state: 'accepted', skills: [], turnId: 'x' },
    { id: 'd', slot: 'effect:1', text: 'e1', state: 'accepted', skills: [], turnId: 'x' }
  ], edges: [] }
];
const v1 = (over = {}) => ({
  id: 's', title: 'T', revision: 4, status: 'defined', phase: 'defined', frame: { goal: 'g' }, model: { id: 'seven_step', reason: 'r' }, links: [],
  define: { runs, finishedEarly: false, exitObjection: 'Root not reached.' }, turns: [{ id: 't', role: 'user', text: 'x', createdAt: 'c' }],
  summary: '', suggestion: null, pendingKeep: null, requestIds: [], runner: { status: 'idle', mode: 'turn', error: null }, createdAt: 'c', updatedAt: 'u', ...over
});

test('a defined v1 session moves on to the step after define', () => {
  const s = migrateSession(v1());
  assert.equal(s.define, undefined);
  assert.equal(s.kind, 'full');
  assert.equal(s.status, 'active');
  assert.equal(s.phase, 'analyse');
  assert.deepEqual(s.steps.define, { runs, status: 'done', objection: 'Root not reached.' });
  assert.deepEqual(s.steps.analyse, { runs: [], status: 'open', objection: null });
  assert.deepEqual(s.learnings, []);
  assert.equal(s.pendingLearning, null);
  assert.deepEqual(s.proposedTasks, []);
});

test('a v1 session defined early with no complete run is a skipped define step', () => {
  const s = migrateSession(v1({ define: { runs: [runs[0]], finishedEarly: true, exitObjection: null } }));
  assert.equal(s.steps.define.status, 'skipped');
});

test('a v1 session mid-define stays in its model\'s define step', () => {
  assert.equal(migrateSession(v1({ phase: 'define', status: 'active', model: { id: 'polya', reason: '' } })).phase, 'identify');
  assert.equal(migrateSession(v1({ phase: 'define', status: 'active' })).steps.define.status, 'open');
});

test('a v1 frame session has no steps', () => {
  const s = migrateSession(v1({ phase: 'frame', status: 'active', model: null, define: { runs: [], finishedEarly: false, exitObjection: null } }));
  assert.equal(s.phase, 'frame');
  assert.deepEqual(s.steps, {});
});

test('a queued v1 closing turn becomes a boundary turn leaving define', () => {
  const s = migrateSession(v1({ runner: { status: 'queued', mode: 'closing', error: null } }));
  assert.deepEqual(s.runner, { status: 'queued', mode: 'boundary', error: null, leaving: 'define' });
  assert.equal(s.pendingLearning, null);
});

test('a stored finish_define suggestion becomes next_step', () => {
  const s = migrateSession(v1({ phase: 'define', status: 'active', suggestion: { kind: 'finish_define', reason: 'Done.' } }));
  assert.deepEqual(s.suggestion, { kind: 'next_step', reason: 'Done.' });
});

test('a v1 define session with no model is given the seven-step model and can move on', () => {
  const deps = { now: () => 'n', newId: () => 'nid' };
  const s = migrateSession(v1({ phase: 'define', status: 'active', model: null }));
  assert.deepEqual(s.model, { id: 'seven_step', reason: 'Assumed when this problem was upgraded.' });
  assert.equal(s.phase, 'define');
  assert.equal(moveOn(s, deps).phase, 'analyse');
  const d = migrateSession(v1({ model: null }));
  assert.deepEqual(d.model, { id: 'seven_step', reason: 'Assumed when this problem was upgraded.' });
  assert.equal(d.phase, 'analyse');
  assert.equal(moveOn(d, deps).phase, 'devise');
});

test('v2 sessions and index rows pass through unchanged', () => {
  const v2 = migrateSession(v1());
  assert.equal(migrateSession(v2), v2);
  const row = { id: 's', title: 'T', status: 'active', phase: 'frame' };
  assert.equal(migrateSession(row), row);
});

test('index rows from v1 move their phase on too', () => {
  assert.deepEqual(migrateRow({ id: 's', status: 'defined', phase: 'defined', model: 'seven_step' }), { id: 's', status: 'active', phase: 'analyse', model: 'seven_step' });
  assert.deepEqual(migrateRow({ id: 's', status: 'active', phase: 'define', model: 'triz' }), { id: 's', status: 'active', phase: 'specific_problem', model: 'triz' });
  const fresh = { id: 's', status: 'active', phase: 'analyse', model: 'seven_step' };
  assert.equal(migrateRow(fresh), fresh);
});

test('a closing v1 runner keeps its lease when it becomes a boundary runner', () => {
  const s = migrateSession(v1({ runner: { status: 'running', mode: 'closing', error: null, leaseUntil: 123 } }));
  assert.deepEqual(s.runner, { status: 'running', mode: 'boundary', error: null, leaseUntil: 123, leaving: 'define' });
});

test('an unreadable stored run does not stop a session migrating', () => {
  const bad = { id: 'x', tool: 'retired_tool', status: 'done', nodes: [], edges: [] };
  const s = migrateSession(v1({ define: { runs: [bad], finishedEarly: false, exitObjection: null } }));
  assert.equal(s.steps.define.status, 'skipped');
});

test('a v2 session saved before tasks existed gains empty task fields on read', () => {
  const old = { id: 'x', turns: [], steps: {}, phase: 'frame', title: 't' };
  const read = migrateSession(old);
  assert.deepEqual(read.proposedTasks, []);
  assert.equal(read.reviewProposal, null);
  assert.equal(read.reviewTaskId, null);
  assert.equal(old.proposedTasks, undefined, 'the input is not mutated');
});
