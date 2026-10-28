// tests/unit/collaboration-book-scripted.test.js
// The Collaboration Book's scripted coach and session shape: framing in three answers (the team
// situation, problem, goal or trust, the result that would help) with the group kept to known
// ids, selecting a model, another angle within the book, the team experiment in order with its
// basis and date, Review, and one walk from the frame to an update offer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import {
  acceptSuggestion, activeRun, applyCoachTurn, createSession, linkCaseFile, moveOn, say, setReviewTask, startReview
} from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { actionOffer } from '../../packages/collaboration-book/record.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../packages/collaboration-book/commit-slots.mjs';
import { toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';

let n = 0;
const deps = { now: () => '2026-10-28T10:00:00.000Z', newId: () => `id${(n += 1)}` };

async function step(session, text) {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

async function framed() {
  let s = await step(createSession({ text: 'Our team waits on me for every decision about how the work gets done.', kind: 'collab' }, deps));
  s = await step(s, 'It is a problem we keep running into every week.');
  return step(s, 'The team deciding its own methods, with me clear about the outcome.');
}

test('a collab session frames on situation, group and outcome, then starts in Explore on the Collaboration Book model', async () => {
  const s = await framed();
  assert.equal(s.kind, 'collab');
  assert.equal(s.model.id, 'collaboration_book');
  assert.equal(s.phase, 'explore');
  assert.deepEqual(Object.keys(s.frame), ['situation', 'group', 'outcome']);
  assert.equal(s.frame.group, 'problems');
});

test('framing selects a fitting model and names a limit, as next_tool in the problems group', async () => {
  const s = await framed();
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'cb_agility', reason: 'A first lens for how the team is sized, organised or led, with its limits kept in view.' });
  assert.match(s.turns.at(-1).text, /one way of seeing/);
  assert.ok(toolsForPlanStep('collaboration_book', 'explore').includes(s.suggestion.tool));
});

test('the scripted coach hears each group, and problems when nothing else is named', async () => {
  const groupOf = async (answer) => {
    let s = await step(createSession({ text: 'Something is off in the team.', kind: 'collab' }, deps));
    s = await step(s, answer);
    return s.frame.group;
  };
  assert.equal(await groupOf('It is about trust between two of us.'), 'trust');
  assert.equal(await groupOf('It is about the goal we are meant to share.'), 'goals');
  assert.equal(await groupOf('Hard to say.'), 'problems');
});

test('another angle waits for the minimum, then stays inside the Collaboration Book', async () => {
  let s = await step(acceptSuggestion(await framed(), deps));
  s = await step(s, 'another angle');
  assert.match(s.turns.at(-1).text, /Finish this model first/);
  assert.ok(s.suggestion === null || s.suggestion.kind !== 'next_tool');
});

test('Agree has exactly one tool, cb_commit, and Review exactly cb_review', () => {
  assert.deepEqual(toolsForPlanStep('collaboration_book', 'commit'), [COMMIT_ID]);
  assert.deepEqual(toolsForPlanStep('collaboration_book', 'review'), [REVIEW_ID]);
});

test('the coach schema takes a next_technique for a cb_ model and refuses another book’s', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'Try this.', suggestion: { kind: 'next_technique', tool: 'cb_premortem', reason: 'Fits.' } });
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.value.suggestion.tool, 'cb_premortem');
  const bad = validateCoachTurn({ verdict: 'clarify', message: 'Try this.', suggestion: { kind: 'next_technique', tool: 'after_action_review', reason: 'No.' } });
  assert.equal(bad.ok, false);
});

test('a group answer keeps only known groups; another book’s frame key is dropped', () => {
  const s = createSession({ text: 'Two of us have stopped talking.', kind: 'collab' }, deps);
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', frame: { situation: 'Two of us have stopped talking', group: 'trust+nowhere', stay: 'x' } });
  assert.ok(turn.ok, turn.error);
  const next = applyCoachTurn(s, turn.value, deps);
  assert.deepEqual(next.frame, { situation: 'Two of us have stopped talking', group: 'trust' });
});

/** Agility worked on one real example, the reflection last, then Agree opened on the experiment. */
async function agreeing() {
  let s = await step(acceptSuggestion(await framed(), deps));
  for (const text of ['The sprint goal is clear but I choose every method', 'The release checklist: nobody owns it', 'reflection: The goal is clear enough; the method decisions should move to the team.']) s = await step(s, text);
  assert.equal(activeRun(s).tool, 'cb_agility');
  s = await step(s, 'agree');
  s = await step(acceptSuggestion(s, deps)); // boundary: the learning question
  s = await step(s, 'I hold on to decisions when I am anxious about quality.');
  assert.equal(s.suggestion?.tool, COMMIT_ID);
  return step(acceptSuggestion(s, deps));
}

async function agreed() {
  let s = await agreeing();
  for (const answer of [
    'The team chooses its own way of testing for the next sprint.',
    'It rests on the sprint goal being clear while every method still runs through me.',
    'Tell the team on Monday that testing methods are theirs to choose.',
    'Sam owns it, after hearing from the two testers.',
    'Come back on 2026-11-11',
    'If quality drops twice in a row, or the team still waits for me.'
  ]) s = await step(s, answer);
  return s;
}

test('Agility works through to Agree: the experiment fills in order, with its basis and date', async () => {
  const s = await agreed();
  const run = s.steps.commit.runs[0];
  assert.equal(run.tool, COMMIT_ID);
  assert.deepEqual(run.nodes.map((node) => node.slot), ['result', 'rests_on', 'next_action', 'owner', 'check_back', 'change_course']);
  assert.equal(run.nodes.find((node) => node.slot === 'check_back').text, '2026-11-11');
  const restsOn = run.nodes.find((node) => node.slot === 'rests_on');
  assert.equal(s.basis[restsOn.id].length, 1);
  assert.equal(s.reviewProposal.due, '2026-11-11');
  assert.ok(s.proposedTasks.every((p) => p.status === 'proposed'));
});

test('a date that is not a date is asked for again', async () => {
  let s = await agreeing();
  for (const answer of ['The team chooses its own way of testing for the next sprint.', 'It rests on the sprint goal being clear while every method still runs through me.', 'Tell the team on Monday that testing methods are theirs to choose.', 'Sam owns it, after hearing from the two testers.']) s = await step(s, answer);
  s = await step(s, 'After a couple of sprints, maybe');
  assert.equal(s.steps.commit.runs[0].nodes.length, 4);
  assert.match(s.turns.at(-1).text, /a date/);
});

test('Review waits for the date, then opens the review; a walk to the end offers an update', async () => {
  let s = await agreed();
  const offer = actionOffer(s);
  assert.equal(offer.kind, 'write');
  assert.match(offer.file.title, /^Collaboration Book: /);
  assert.ok(offer.file.sections.some((section) => section.key === 'wanted' && section.lines[0].includes('own methods')));
  assert.ok(offer.file.sections.some((section) => section.key === 'owner'));
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  s = setReviewTask(s, { taskId: 'task-check', due: '2026-11-11' }, deps);
  s = await step(moveOn(s, deps));
  s = await step(s, 'Handing over a method is easier when the goal is written down.');
  assert.equal(s.reviewState.status, 'waiting');
  s = await step(s, 'Anything yet?');
  assert.match(s.turns.at(-1).text, /Review picks up on/);
  s = await step(startReview(s, {}, deps));
  assert.equal(s.suggestion.tool, REVIEW_ID);
  s = await step(acceptSuggestion(s, deps));
  for (const answer of ['The team picked pair testing and shipped on time.', 'The conditions changed: testing decisions now sit with the team.', 'Keep the practice and try it for planning next.']) s = await step(s, answer);
  s = await step(acceptSuggestion(s, deps)); // next_step: close the review
  assert.equal(s.phase, 'finished');
  const update = actionOffer(s);
  assert.equal(update.kind, 'update');
  assert.ok(update.changed.includes('outcome'));
});

test('only collab sessions have a record offer', async () => {
  const s = await agreed();
  assert.equal(actionOffer({ ...s, kind: 'change' }), null);
});
