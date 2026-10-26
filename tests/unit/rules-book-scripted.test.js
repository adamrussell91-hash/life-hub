// tests/unit/rules-book-scripted.test.js
// The Rules Book's scripted coach and session shape: grounding in three answers with the group
// kept to known ids, selecting a rule, another angle within the book, the experiment in order
// with its basis and check time, Review, and one walk from ground to an update offer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import {
  acceptSuggestion, applyCoachTurn, createSession, linkCaseFile, moveOn, say, setReviewTask, startReview
} from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { actionOffer } from '../../packages/rules-book/record.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../packages/rules-book/commit-slots.mjs';
import { toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';

let n = 0;
const deps = { now: () => '2026-10-27T10:00:00.000Z', newId: () => `id${(n += 1)}` };

async function step(session, text) {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

async function grounded() {
  let s = await step(createSession({ text: 'The Friday report keeps slipping past its deadline.', kind: 'rules' }, deps));
  s = await step(s, 'It sits in my work and deadlines, and the date keeps moving.');
  return step(s, 'Due Friday; I assume it is simple, but I have never timed it.');
}

async function applied() {
  let s = await step(acceptSuggestion(await grounded(), deps));
  s = await step(s, 'Finish a first complete version by Tuesday');
  return s;
}

test('a rules session frames on situation, group and known, then starts in Explore on the Rules Book model', async () => {
  const s = await grounded();
  assert.equal(s.kind, 'rules');
  assert.equal(s.model.id, 'rules_book');
  assert.equal(s.phase, 'explore');
  assert.deepEqual(Object.keys(s.frame), ['situation', 'group', 'known']);
  assert.equal(s.frame.group, 'workplace');
});

test('grounding selects a fitting rule and names a limit, as next_tool in the workplace group', async () => {
  const s = await grounded();
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'rb_parkinson', reason: 'A first lens for work that keeps slipping, with its limits kept in view.' });
  assert.match(s.turns.at(-1).text, /rule of thumb/);
  assert.ok(toolsForPlanStep('rules_book', 'explore').includes(s.suggestion.tool));
});

test('another angle waits for the minimum, then stays inside the Rules Book', async () => {
  let s = await step(acceptSuggestion(await grounded(), deps));
  s = await step(s, 'another angle');
  assert.match(s.turns.at(-1).text, /Finish this rule first/);
  assert.ok(s.suggestion === null || s.suggestion.kind !== 'next_tool');
});

test('Act has exactly one tool, rb_commit, and Review exactly rb_review', () => {
  assert.deepEqual(toolsForPlanStep('rules_book', 'commit'), [COMMIT_ID]);
  assert.deepEqual(toolsForPlanStep('rules_book', 'review'), [REVIEW_ID]);
});

test('the coach schema takes a next_technique for an rb_ rule and refuses another book’s', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'Try this.', suggestion: { kind: 'next_technique', tool: 'rb_plotz', reason: 'Fits.' } });
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.value.suggestion.tool, 'rb_plotz');
  const bad = validateCoachTurn({ verdict: 'clarify', message: 'Try this.', suggestion: { kind: 'next_technique', tool: 'dm_conflict', reason: 'No.' } });
  assert.equal(bad.ok, false);
});

test('a group answer keeps only known groups; a route key is not a rules frame key', () => {
  const s = createSession({ text: 'Stuck on the grant bid.', kind: 'rules' }, deps);
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', frame: { situation: 'The grant bid is stuck', group: 'change+nowhere', route: 'doing' } });
  assert.ok(turn.ok, turn.error);
  const next = applyCoachTurn(s, turn.value, deps);
  assert.deepEqual(next.frame, { situation: 'The grant bid is stuck', group: 'change' });
});

/** Parkinson's three stages worked, the reflection last, then Act opened on the experiment. */
async function committing() {
  let s = await applied();
  for (const text of ['Second complete version by Wednesday', 'Final version by Thursday', 'reflection: Three finished versions keep the work from swelling to fill the days.']) s = await step(s, text);
  s = await step(s, 'act');
  s = await step(acceptSuggestion(s, deps)); // boundary: the learning question
  s = await step(s, 'I only start when a date is close.');
  assert.equal(s.suggestion?.tool, COMMIT_ID);
  return step(acceptSuggestion(s, deps));
}

async function committed() {
  let s = await committing();
  for (const answer of [
    'The Friday report goes out on time this week.',
    'It rests on the three finished versions I planned.',
    'Draft the first complete version this afternoon.',
    'Right after the Monday stand-up meeting ends.',
    'Check on 2026-11-05',
    'The second version is still not done by Wednesday lunchtime.'
  ]) s = await step(s, answer);
  return s;
}

test('Parkinson works through to Act: the experiment fills in order, with its basis and check time', async () => {
  const s = await committed();
  const run = s.steps.commit.runs[0];
  assert.equal(run.tool, COMMIT_ID);
  assert.deepEqual(run.nodes.map((node) => node.slot), ['result', 'rests_on', 'next_action', 'start', 'check_back', 'change_course']);
  assert.equal(run.nodes.find((node) => node.slot === 'check_back').text, '2026-11-05');
  const restsOn = run.nodes.find((node) => node.slot === 'rests_on');
  assert.equal(s.basis[restsOn.id].length, 1);
  assert.equal(s.reviewProposal.due, '2026-11-05');
  assert.ok(s.proposedTasks.every((p) => p.status === 'proposed'));
});

test('a check time without a date is asked for again', async () => {
  let s = await committing();
  for (const answer of ['The Friday report goes out on time this week.', 'It rests on the three finished versions I planned.', 'Draft the first complete version this afternoon.', 'Right after the Monday stand-up meeting ends.']) s = await step(s, answer);
  s = await step(s, 'Sometime next week, probably');
  assert.equal(s.steps.commit.runs[0].nodes.length, 4);
  assert.match(s.turns.at(-1).text, /a date/);
});

test('Review waits for the check time, then opens the review; a walk to the end offers an update', async () => {
  let s = await committed();
  const offer = actionOffer(s);
  assert.equal(offer.kind, 'write');
  assert.match(offer.file.title, /^Rules Book: /);
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  s = setReviewTask(s, { taskId: 'task-check', due: '2026-11-05' }, deps);
  s = await step(moveOn(s, deps));
  s = await step(s, 'A dated check keeps me honest.');
  assert.equal(s.reviewState.status, 'waiting');
  s = await step(s, 'Anything yet?');
  assert.match(s.turns.at(-1).text, /Review picks up on/);
  s = await step(startReview(s, {}, deps));
  assert.equal(s.suggestion.tool, REVIEW_ID);
  s = await step(acceptSuggestion(s, deps));
  for (const answer of ['The report went out a day early this time.', 'My reading held: the dates, not the work, were the trouble.', 'Keep the rule for now, and drop it if the work stops growing.']) s = await step(s, answer);
  s = await step(acceptSuggestion(s, deps)); // next_step: close the review
  assert.equal(s.phase, 'finished');
  const update = actionOffer(s);
  assert.equal(update.kind, 'update');
  assert.ok(update.changed.includes('outcome'));
});

test('only rules sessions have a record offer', async () => {
  const s = await committed();
  assert.equal(actionOffer({ ...s, kind: 'shift' }), null);
});
