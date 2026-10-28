// tests/unit/communication-book-scripted.test.js
// The Communication Book's scripted coach and session shape: framing in three answers (the
// exchange, prepare, relate or read, what a better exchange would be) with the group kept to known
// ids, selecting a model, another angle within the book, the next conversation in order with its
// basis and date, Review, and one walk from the frame to an update offer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import {
  acceptSuggestion, activeRun, applyCoachTurn, createSession, linkCaseFile, moveOn, say, setReviewTask, startReview
} from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { actionOffer } from '../../packages/communication-book/record.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../packages/communication-book/commit-slots.mjs';
import { toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';

let n = 0;
const deps = { now: () => '2026-10-28T10:00:00.000Z', newId: () => `id${(n += 1)}` };

async function step(session, text) {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

async function framed() {
  let s = await step(createSession({ text: 'I need my manager to approve a fourth person for the project, and she has said no twice.', kind: 'talk' }, deps));
  s = await step(s, 'It is about getting ready for what I will say on Thursday.');
  return step(s, 'She weighs the case on its merits and I keep her trust.');
}

test('a talk session frames on situation, group and outcome, then starts in Explore on the Communication Book model', async () => {
  const s = await framed();
  assert.equal(s.kind, 'talk');
  assert.equal(s.model.id, 'communication_book');
  assert.equal(s.phase, 'explore');
  assert.deepEqual(Object.keys(s.frame), ['situation', 'group', 'outcome']);
  assert.equal(s.frame.group, 'prepare');
});

test('framing selects a fitting model and names a limit, as next_tool in the prepare group', async () => {
  const s = await framed();
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'cm_persuasion', reason: 'A first lens for getting someone to agree or act, with its limits kept in view.' });
  assert.match(s.turns.at(-1).text, /one way of seeing/);
  assert.ok(toolsForPlanStep('communication_book', 'explore').includes(s.suggestion.tool));
});

test('the scripted coach hears each group, and prepare when nothing else is named', async () => {
  const groupOf = async (answer) => {
    let s = await step(createSession({ text: 'A conversation went wrong.', kind: 'talk' }, deps));
    s = await step(s, answer);
    return s.frame.group;
  };
  assert.equal(await groupOf('It is about my relationship with my sister.'), 'relate');
  assert.equal(await groupOf('It is about an email I cannot make sense of.'), 'read');
  assert.equal(await groupOf('Hard to say.'), 'prepare');
});

test('another angle waits for the minimum, then stays inside the Communication Book', async () => {
  let s = await step(acceptSuggestion(await framed(), deps));
  s = await step(s, 'another angle');
  assert.match(s.turns.at(-1).text, /Finish this model first/);
  assert.ok(s.suggestion === null || s.suggestion.kind !== 'next_tool');
});

test('Commit has exactly one tool, cm_commit, and Review exactly cm_review', () => {
  assert.deepEqual(toolsForPlanStep('communication_book', 'commit'), [COMMIT_ID]);
  assert.deepEqual(toolsForPlanStep('communication_book', 'review'), [REVIEW_ID]);
});

test('the coach schema takes a next_technique for a cm_ model and refuses a toolkit tool', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'Try this.', suggestion: { kind: 'next_technique', tool: 'cm_apology', reason: 'Fits.' } });
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.value.suggestion.tool, 'cm_apology');
  const bad = validateCoachTurn({ verdict: 'clarify', message: 'Try this.', suggestion: { kind: 'next_technique', tool: 'perspective_shift', reason: 'No.' } });
  assert.equal(bad.ok, false);
});

test('a group answer keeps only known groups; another book’s frame key is dropped', () => {
  const s = createSession({ text: 'My friend and I have stopped talking.', kind: 'talk' }, deps);
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', frame: { situation: 'My friend and I have stopped talking', group: 'relate+trust', stay: 'x' } });
  assert.ok(turn.ok, turn.error);
  const next = applyCoachTurn(s, turn.value, deps);
  assert.deepEqual(next.frame, { situation: 'My friend and I have stopped talking', group: 'relate' });
});

/** Persuasion worked on one real request, the reflection last, then Commit opened on the next conversation. */
async function agreeing() {
  let s = await step(acceptSuggestion(await framed(), deps));
  for (const text of ['I covered two of her urgent requests last month without being asked', 'I can show the overtime hours from the last quarter', 'The client deadline in March is a real limit', 'reflection: My honest appeals are reciprocity and real evidence; the deadline only adds pressure.']) s = await step(s, text);
  assert.equal(activeRun(s).tool, 'cm_persuasion');
  s = await step(s, 'commit');
  s = await step(acceptSuggestion(s, deps)); // boundary: the learning question
  s = await step(s, 'I reach for urgency when I am not sure my case is strong.');
  assert.equal(s.suggestion?.tool, COMMIT_ID);
  return step(acceptSuggestion(s, deps));
}

async function agreed() {
  let s = await agreeing();
  for (const answer of [
    'She asks about the overtime figures before giving an answer.',
    'It rests on the overtime evidence the persuasion chart showed, not the deadline pressure.',
    'Ask her on Thursday: can I show you three months of overtime before you decide?',
    'I take it, and it waits on her reply after the meeting.',
    'Come back on 2026-11-11',
    'If she hears it as pressure again, I will send the figures in writing first.'
  ]) s = await step(s, answer);
  return s;
}

test('Persuasion works through to Commit: the next conversation fills in order, with its basis and date', async () => {
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
  for (const answer of ['She asks about the overtime figures before giving an answer.', 'It rests on the overtime evidence the persuasion chart showed, not the deadline pressure.', 'Ask her on Thursday: can I show you three months of overtime before you decide?', 'I take it, and it waits on her reply after the meeting.']) s = await step(s, answer);
  s = await step(s, 'After the next project review, maybe');
  assert.equal(s.steps.commit.runs[0].nodes.length, 4);
  assert.match(s.turns.at(-1).text, /a date/);
});

test('Review waits for the date, then opens the review; a walk to the end offers an update', async () => {
  let s = await agreed();
  const offer = actionOffer(s);
  assert.equal(offer.kind, 'write');
  assert.match(offer.file.title, /^Communication Book: /);
  assert.ok(offer.file.sections.some((section) => section.key === 'wanted' && section.lines[0].includes('on its merits')));
  assert.ok(offer.file.sections.some((section) => section.key === 'owner'));
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  s = setReviewTask(s, { taskId: 'task-check', due: '2026-11-11' }, deps);
  s = await step(moveOn(s, deps));
  s = await step(s, 'A case lands better when I lead with what I can show.');
  assert.equal(s.reviewState.status, 'waiting');
  s = await step(s, 'Anything yet?');
  assert.match(s.turns.at(-1).text, /Review picks up on/);
  s = await step(startReview(s, {}, deps));
  assert.equal(s.suggestion.tool, REVIEW_ID);
  s = await step(acceptSuggestion(s, deps));
  for (const answer of ['I showed the figures first and asked her what she needed to see.', 'She said it was the first time the case felt like facts, and asked for a written summary.', 'Keep leading with evidence, and drop the deadline line.']) s = await step(s, answer);
  s = await step(acceptSuggestion(s, deps)); // next_step: close the review
  assert.equal(s.phase, 'finished');
  const update = actionOffer(s);
  assert.equal(update.kind, 'update');
  assert.ok(update.changed.includes('outcome'));
});

test('only talk sessions have a record offer', async () => {
  const s = await agreed();
  assert.equal(actionOffer({ ...s, kind: 'collab' }), null);
});
