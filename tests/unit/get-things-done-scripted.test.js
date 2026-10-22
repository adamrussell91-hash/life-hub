// tests/unit/get-things-done-scripted.test.js
// Gear Shifter's scripted coach: discern from the route, another angle within Gear Shifter, the
// experiment in order with its basis and check-back, Review on the experiment review or Project
// Evaluation, Kanban's own columns, and one walk from frame to an update offer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import {
  acceptSuggestion, applyCoachTurn, createSession, linkCaseFile, moveOn, say, setReviewTask, startReview
} from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { newRun } from '../../packages/problem-solver/machine.mjs';
import { actionOffer } from '../../packages/get-things-done/record.mjs';
import { COMMIT_ID } from '../../packages/get-things-done/commit-slots.mjs';

let n = 0;
const deps = { now: () => '2026-10-22T10:00:00.000Z', newId: () => `id${(n += 1)}` };

async function step(session, text) {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

async function framed() {
  let s = await step(createSession({ text: 'The team report keeps stalling.', kind: 'shift' }, deps));
  s = await step(s, 'It turns on two colleagues and their part of it.');
  return step(s, 'Due Friday; Priya has the data and Sam the charts.');
}

async function explored() {
  let s = await step(acceptSuggestion(await framed(), deps));
  s = await step(s, 'Thank Priya for pulling the sales data together');
  return step(s, 'reflection: Saying thanks first makes the next ask much easier.');
}

async function committing() {
  let s = await step(await explored(), 'commit');
  s = await step(acceptSuggestion(s, deps)); // boundary: the learning question
  s = await step(s, 'I move faster when I thank people first.');
  assert.equal(s.suggestion?.tool, COMMIT_ID);
  return step(acceptSuggestion(s, deps));
}

async function committed() {
  let s = await committing();
  for (const answer of [
    'The team report goes out on Friday morning.',
    'It rests on thanking Priya before asking for more.',
    'Message Priya to thank her for the data today.',
    'Right after the Monday stand-up meeting ends.',
    'Check back on 2026-11-05',
    'Priya has not replied by Wednesday lunchtime at all.'
  ]) s = await step(s, answer);
  return s;
}

test('framing discerns from the route: the obstacle named and a technique as next_tool', async () => {
  const s = await framed();
  assert.equal(s.phase, 'explore');
  assert.equal(s.frame.route, 'others');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'gt_appreciation', reason: 'A first technique for other people.' });
  assert.match(s.turns.at(-1).text, /other people/);
});

test('Explore with nothing open suggests a technique; another angle waits for the minimum, then stays in Gear Shifter', async () => {
  let s = await framed();
  s = await step(acceptSuggestion(s, deps));
  s = await step(s, 'another angle');
  assert.match(s.turns.at(-1).text, /Finish this technique first/);
  s = await step(s, 'Thank Priya for pulling the sales data together');
  s = await step(s, 'reflection: Saying thanks first makes the next ask much easier.');
  s = await step(s, 'another angle');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'gt_small_gifts', reason: 'Another angle on the same work: The Theory of Small Gifts.' });
  s = await step(s, 'commit');
  assert.equal(s.suggestion.kind, 'next_step');
});

test('the experiment fills in order: its basis, the task card and the check-back card', async () => {
  const s = await committed();
  const run = s.steps.commit.runs[0];
  assert.deepEqual(run.nodes.map((node) => node.slot), ['result', 'rests_on', 'next_action', 'start', 'check_back', 'change_course']);
  assert.equal(run.nodes.find((node) => node.slot === 'check_back').text, '2026-11-05');
  const restsOn = run.nodes.find((node) => node.slot === 'rests_on');
  assert.equal(s.basis[restsOn.id].length, 1);
  assert.deepEqual(s.proposedTasks.map((p) => p.status), ['proposed']);
  assert.equal(s.reviewProposal.due, '2026-11-05');
  assert.equal(s.suggestion.kind, 'next_step');
});

test('a check-back without a date is asked again', async () => {
  let s = await committing();
  for (const answer of ['The team report goes out on Friday morning.', 'It rests on thanking Priya before asking for more.', 'Message Priya to thank her for the data today.', 'Right after the Monday stand-up meeting ends.']) s = await step(s, answer);
  s = await step(s, 'Sometime next week, probably');
  assert.equal(s.steps.commit.runs[0].nodes.length, 4);
  assert.match(s.turns.at(-1).text, /2026-11-05|a date/);
});

test('Review waits for the check-back, then opens the experiment review, or Project Evaluation for a finished project', async () => {
  let s = setReviewTask(await committed(), { taskId: 'task-check', due: '2026-11-05' }, deps);
  s = await step(moveOn(s, deps));
  s = await step(s, 'A dated check-back keeps me honest.');
  assert.equal(s.reviewState.status, 'waiting');
  s = await step(s, 'Anything yet?');
  assert.match(s.turns.at(-1).text, /Review picks up on/);
  assert.equal(s.suggestion, null);
  s = await step(startReview(s, {}, deps));
  assert.equal(s.suggestion.tool, 'gt_review');
  const finished = await step(s, 'The project is finished and shipped.');
  assert.equal(finished.suggestion.tool, 'gt_project_evaluation');
  s = await step(acceptSuggestion(s, deps));
  assert.match(s.turns.at(-1).text, /how it went/i);
});

test('Gear Shifter’s Kanban takes its own columns; Problem Solver’s still takes Review', async () => {
  const run = (tool) => {
    const s = createSession({ text: 'Too much half done.', kind: 'shift' }, deps);
    return { ...s, phase: 'explore', model: { id: 'gear_shifter', reason: '' }, frame: { need: 'x', route: 'doing', known: 'y' }, steps: { explore: { status: 'open', objection: null, runs: [{ ...newRun(tool, 'r1'), status: 'active' }] } } };
  };
  const doing = await scriptedCoach(say(run('gt_kanban'), 'doing: Draft the methods section of the report', deps));
  assert.equal(doing.node.tag, 'doing');
  const review = await scriptedCoach(say(run('gt_kanban'), 'review: Check the charts Sam made for the report', deps));
  assert.notEqual(review.node.tag, 'review');
  const ps = await scriptedCoach(say({ ...run('kanban'), kind: 'full' }, 'review: Check the charts Sam made for the report', deps));
  assert.equal(ps.node.tag, 'review');
});

test('one walk from frame to a reviewed experiment ends with an update offer', async () => {
  let s = await committed();
  const offer = actionOffer(s);
  assert.equal(offer.kind, 'write');
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  s = setReviewTask(s, { taskId: 'task-check', due: '2026-11-05' }, deps);
  s = await step(moveOn(s, deps));
  s = await step(s, 'A dated check-back keeps me honest.');
  s = await step(startReview(s, {}, deps));
  s = await step(acceptSuggestion(s, deps));
  for (const answer of ['The report went out a day early this time.', 'About an hour of chasing Sam on Thursday.', 'Keep thanking people before I ask them for more.']) s = await step(s, answer);
  s = await step(acceptSuggestion(s, deps)); // next_step: close the review
  assert.equal(s.phase, 'finished');
  const update = actionOffer(s);
  assert.equal(update.kind, 'update');
  assert.ok(update.changed.includes('outcome'));
});
