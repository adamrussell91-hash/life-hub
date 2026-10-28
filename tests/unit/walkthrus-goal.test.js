import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGES, applyCycleDecision, checkOneActive, evidenceGain, isLiveWalkthruGoal, normalizeSnapshot, normalizeWalkthru, openCycle, pieceFor, termRefFor, withOpenCycle, withSnapshot
} from '../../packages/walkthrus/goal.mjs';
import { normalizeGoalRecord } from '../../netlify/functions/_shared/goal-record.mjs';
import { ARROW_TYPES, normalizeArrows } from '../../packages/walkthrus/arrows.mjs';
import { applyTap, countsAsRep, hasLapsed, isToLog, normalizeRep, summarise } from '../../packages/walkthrus/reps.mjs';

const T = 'w1-cold-calling';
const U = 'w1-quizzing';
const snap = (mean, n = 20, at = '2026-10-01T00:00:00.000Z') => ({ at, class_id: null, label: '9B quiz', mean, n });
const goal = (over = {}) => ({ id: 'goal_a', sphere: 'professional', status: 'active', walkthru: { technique_id: T }, ...over });

test('a WalkThru section needs a real technique and fills in the rest', () => {
  assert.equal(normalizeWalkthru({ technique_id: 'nope' }), null);
  assert.equal(normalizeWalkthru(null), null);
  const wt = normalizeWalkthru({ technique_id: T, stage: 'wrong', adapted: { 1: '  mine  ', 9: 'x', 2: '' }, problem_type: 'recall', cycles: [{ started: '2026-10-01' }, { nope: 1 }], origin: { kind: 'pattern', suggestion_id: 's1' } });
  assert.equal(wt.stage, 'attempt');
  assert.deepEqual(wt.adapted, { 1: 'mine' });
  assert.equal(wt.problem_type, 'recall');
  assert.equal(wt.cycles.length, 1);
  assert.deepEqual(wt.origin, { kind: 'pattern', suggestion_id: 's1' });
  assert.equal(normalizeWalkthru({ technique_id: T, problem_type: 'x' }).problem_type, null);
  assert.deepEqual(STAGES, ['attempt', 'develop', 'adapt', 'practise', 'test']);
});

test('an old goal without a WalkThru section is untouched, and only professional goals carry one', () => {
  const old = normalizeGoalRecord({ id: 'g1', title: 'Old', sphere: 'work' });
  assert.equal('walkthru' in old, false);
  assert.equal('walkthru' in normalizeGoalRecord({ id: 'g2', title: 'Life', sphere: 'life', walkthru: { technique_id: T } }), false);
  const pro = normalizeGoalRecord({ id: 'g3', title: 'Pro', sphere: 'professional', walkthru: { technique_id: T } });
  assert.equal(pro.walkthru.technique_id, T);
  assert.equal('walkthru' in normalizeGoalRecord({ id: 'g4', title: 'Bad', sphere: 'professional', walkthru: { technique_id: 'nope' } }), false);
});

test('one active technique at a time', () => {
  assert.equal(checkOneActive([], goal()), null);
  const refused = checkOneActive([goal({ id: 'goal_b', walkthru: { technique_id: U } })], goal());
  assert.equal(refused.status, 409);
  assert.equal(refused.code, 'walkthru_active');
  assert.match(refused.message, /Quizzing/);
  // parked, achieved or dropped goals don't count, and a goal never blocks itself
  for (const status of ['parked', 'achieved', 'dropped', 'archived']) assert.equal(checkOneActive([goal({ id: 'goal_b', status, walkthru: { technique_id: U } })], goal()), null);
  assert.equal(checkOneActive([goal()], goal()), null);
  assert.equal(isLiveWalkthruGoal({ id: 'x', status: 'active' }), false);
});

test('a city only appears when the Test shows a gain on the problem it came from', () => {
  const at = (stage, before, after) => goal({ walkthru: { technique_id: T, stage, cycles: [{ started: '2026-10-01', evidence_before: before, evidence_after: after }] } });
  assert.equal(pieceFor({ id: 'x' }), null);
  assert.equal(pieceFor(goal({ walkthru: { technique_id: T, stage: 'attempt' } })), 'dashed_house');
  assert.equal(pieceFor(goal({ walkthru: { technique_id: T, stage: 'develop' } })), 'dashed_house');
  assert.equal(pieceFor(goal({ walkthru: { technique_id: T, stage: 'practise' } })), 'house');
  assert.equal(pieceFor(at('test', snap(0.5), snap(0.7))), 'city');
  assert.equal(pieceFor(at('test', snap(0.5), snap(0.52))), 'house', 'a gain under 5 points is not a gain');
  assert.equal(pieceFor(at('test', snap(0.5, 2), snap(0.9, 2))), 'house', 'two students is too few');
  assert.equal(pieceFor(at('test', snap(0.5), null)), 'house');
  assert.equal(pieceFor({ ...at('practise', snap(0.5), snap(0.9)) }), 'house', 'not before the Test');
  assert.equal(pieceFor({ ...at('test', snap(0.5), snap(0.9)), status: 'dropped' }), null);
  assert.deepEqual(evidenceGain(snap(0.4), snap(0.6)), { gain: true, change: 0.6 - 0.4 });
});

test('snapshots are class-level means only', () => {
  assert.equal(normalizeSnapshot({ at: 'x', mean: 0.5, n: 4 }), null);
  assert.equal(normalizeSnapshot({ at: '2026-10-01T00:00:00Z', mean: 1.5, n: 4 }), null);
  assert.deepEqual(Object.keys(normalizeSnapshot(snap(0.5))).sort(), ['at', 'class_id', 'label', 'mean', 'n']);
});

test('keep going carries the goal and opens a new cycle; move on achieves or drops', () => {
  const base = normalizeWalkthru({ technique_id: T, stage: 'test', cycles: [{ started: '2026-10-01', evidence_before: snap(0.5), evidence_after: snap(0.7) }] });
  const g = goal({ walkthru: base, term: { year: 2026, term: 4 } });
  const keep = applyCycleDecision(g, 'keep', { at: '2026-11-20T01:00:00.000Z', reps: 6 });
  assert.equal(keep.status, 'active');
  assert.deepEqual(keep.term_history.at(-1), { year: 2026, term: 4, outcome: 'carried', at: '2026-11-20T01:00:00.000Z' });
  assert.equal(keep.walkthru.stage, 'practise');
  assert.equal(keep.walkthru.cycles.length, 2);
  assert.equal(keep.walkthru.cycles[0].decision, 'keep');
  assert.equal(keep.walkthru.cycles[0].reps, 6);
  assert.equal(openCycle(keep.walkthru).started, '2026-11-20');

  const won = applyCycleDecision(g, 'move_on', { at: '2026-11-20T01:00:00.000Z' });
  assert.equal(won.status, 'achieved');
  assert.equal(won.term_history.at(-1).outcome, 'achieved');
  const flat = applyCycleDecision(goal({ walkthru: { ...base, cycles: [{ started: '2026-10-01', evidence_before: snap(0.5), evidence_after: snap(0.5) }] } }), 'move_on', { at: '2026-11-20T01:00:00.000Z' });
  assert.equal(flat.status, 'dropped');
  assert.equal(flat.term_history.at(-1).outcome, 'dropped');
  assert.ok(applyCycleDecision({ id: 'x' }, 'keep').error);
  assert.ok(applyCycleDecision(g, 'sideways').error);
  assert.deepEqual(termRefFor('2026-10-28'), { year: 2026, term: 4 });
});

test('cycles open on first use and snapshots land on the open cycle', () => {
  const wt = normalizeWalkthru({ technique_id: T });
  const opened = withOpenCycle(wt, '2026-10-05');
  assert.equal(opened.cycles.length, 1);
  assert.equal(withOpenCycle(opened, '2026-10-06').cycles.length, 1);
  const before = withSnapshot(wt, 'before', snap(0.4), '2026-10-05');
  assert.equal(openCycle(before).evidence_before.mean, 0.4);
  assert.equal(openCycle(withSnapshot(before, 'after', snap(0.6), '2026-11-01')).evidence_after.mean, 0.6);
});

test('arrows: typed, free ones need a label, duplicates and self-loops are dropped', () => {
  assert.deepEqual(ARROW_TYPES, ['leads_to', 'pairs_with', 'free']);
  const out = normalizeArrows([
    { id: 'a1', from: T, to: U, type: 'leads_to', label: ' then retrieve ' },
    { id: 'a2', from: T, to: U, type: 'leads_to' },
    { id: 'a3', from: U, to: T, type: 'pairs_with' },
    { id: 'a4', from: T, to: U, type: 'pairs_with' },
    { id: 'a5', from: T, to: U, type: 'free' },
    { id: 'a6', from: T, to: T, type: 'leads_to' },
    { id: 'a7', from: 'nope', to: U, type: 'leads_to' },
    { id: 'a8', from: T, to: U, type: 'free', label: 'because' }
  ]);
  assert.deepEqual(out.map((a) => a.id), ['a1', 'a3', 'a8']);
  assert.equal(out[0].label, 'then retrieve');
});

test('reps: ran and partly count, skipped is logged but not a rep, tapping again undoes', () => {
  const rep = (state, over = {}) => normalizeRep({ technique_id: T, lesson_id: 'l1', class_id: 'c1', state, lesson_end: '2026-10-20T04:00:00.000Z', at: '2026-10-20T05:00:00.000Z', ...over });
  assert.equal(countsAsRep(rep('ran')), true);
  assert.equal(countsAsRep(rep('partly')), true);
  assert.equal(countsAsRep(rep('skipped')), false);
  assert.equal(normalizeRep({ technique_id: 'nope', lesson_id: 'l1', state: 'ran', at: '2026-10-20T05:00:00.000Z' }), null);
  const planned = rep('planned');
  const ran = applyTap(planned, { state: 'ran' }, '2026-10-20T06:00:00.000Z');
  assert.equal(ran.state, 'ran');
  assert.equal(applyTap(ran, { state: 'partly' }, '2026-10-20T06:01:00.000Z').state, 'partly');
  assert.equal(applyTap(ran, { state: 'ran' }, '2026-10-20T06:02:00.000Z').state, 'planned', 'undo returns a timetabled lesson to planned');
  assert.equal(applyTap(rep('ran', { lesson_end: null }), { state: 'ran' }), null, 'undo removes an unscheduled one');
});

test('reps: unlogged lessons collect as to-log, then lapse after 7 days and count as nothing', () => {
  const planned = normalizeRep({ technique_id: T, lesson_id: 'l1', state: 'planned', lesson_end: '2026-10-20T04:00:00.000Z', at: '2026-10-19T00:00:00.000Z' });
  const day = 86_400_000;
  const end = Date.parse(planned.lesson_end);
  assert.equal(isToLog(planned, end - 1), false, 'not before the lesson ends');
  assert.equal(isToLog(planned, end + day), true);
  assert.equal(hasLapsed(planned, end + 6 * day), false);
  assert.equal(hasLapsed(planned, end + 7 * day), true);
  assert.equal(summarise([planned], { now: end + day }).to_log, 1);
  assert.equal(summarise([planned], { now: end + 8 * day }).to_log, 0);
  const logged = [
    normalizeRep({ technique_id: T, lesson_id: 'l2', state: 'ran', at: '2026-10-21T00:00:00.000Z' }),
    normalizeRep({ technique_id: T, lesson_id: 'l3', state: 'partly', at: '2026-10-22T00:00:00.000Z' }),
    normalizeRep({ technique_id: T, lesson_id: 'l4', state: 'skipped', at: '2026-10-23T00:00:00.000Z' })
  ];
  assert.deepEqual(summarise(logged, { now: Date.parse('2026-10-24T00:00:00.000Z') }), { reps: 2, ran: 1, partly: 1, skipped: 1, to_log: 0 });
  assert.equal(summarise(logged, { now: Date.parse('2026-10-24T00:00:00.000Z'), since: '2026-10-22' }).reps, 1, 'a cycle window counts only its own reps');
});
