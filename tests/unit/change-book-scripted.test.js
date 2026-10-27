// tests/unit/change-book-scripted.test.js
// The Change Book's scripted coach and session shape: framing in three answers (the change, where
// it sits, what should stay) with the group kept to known ids, selecting a model, another angle
// within the book, the reversible step in order with its basis and review date, Review, one
// walk from the frame to an update offer, and the two self-scored charts waiting for their Save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import {
  acceptSuggestion, activeRun, applyCoachTurn, createSession, linkCaseFile, moveOn, say, score, setReviewTask, startReview
} from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { actionOffer } from '../../packages/change-book/record.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../packages/change-book/commit-slots.mjs';
import { toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { isComplete } from '../../packages/problem-solver/machine.mjs';

let n = 0;
const deps = { now: () => '2026-10-27T10:00:00.000Z', newId: () => `id${(n += 1)}` };

async function step(session, text) {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

async function framed() {
  let s = await step(createSession({ text: 'I have been offered a city job and might leave my local one.', kind: 'change' }, deps));
  s = await step(s, 'It is about me and how I choose what matters.');
  return step(s, 'My Saturday mornings with my family should stay.');
}

test('a change session frames on change, group and stay, then starts in Explore on the Change Book model', async () => {
  const s = await framed();
  assert.equal(s.kind, 'change');
  assert.equal(s.model.id, 'change_book');
  assert.equal(s.phase, 'explore');
  assert.deepEqual(Object.keys(s.frame), ['change', 'group', 'stay']);
  assert.equal(s.frame.group, 'self');
});

test('framing selects a fitting model and names a limit, as next_tool in the self group', async () => {
  const s = await framed();
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'ch_meaning_of_life', reason: 'A first lens for a choice about what matters, with its limits kept in view.' });
  assert.match(s.turns.at(-1).text, /one way of seeing/);
  assert.ok(toolsForPlanStep('change_book', 'explore').includes(s.suggestion.tool));
});

test('the scripted coach hears each group, and mine when nothing else is named', async () => {
  const groupOf = async (answer) => {
    let s = await step(createSession({ text: 'Something is changing.', kind: 'change' }, deps));
    s = await step(s, answer);
    return s.frame.group;
  };
  assert.equal(await groupOf('It is about our team at work.'), 'ours');
  assert.equal(await groupOf('It is about how society and the news shape this.'), 'world');
  assert.equal(await groupOf('It is about my own habits.'), 'mine');
});

test('another angle waits for the minimum, then stays inside the Change Book', async () => {
  let s = await step(acceptSuggestion(await framed(), deps));
  s = await step(s, 'another angle');
  assert.match(s.turns.at(-1).text, /Finish this model first/);
  assert.ok(s.suggestion === null || s.suggestion.kind !== 'next_tool');
});

test('Act has exactly one tool, ch_commit, and Review exactly ch_review', () => {
  assert.deepEqual(toolsForPlanStep('change_book', 'commit'), [COMMIT_ID]);
  assert.deepEqual(toolsForPlanStep('change_book', 'review'), [REVIEW_ID]);
});

test('the coach schema takes a next_technique for a ch_ model and refuses another book’s', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'Try this.', suggestion: { kind: 'next_technique', tool: 'ch_anti_change', reason: 'Fits.' } });
  assert.ok(ok.ok, ok.error);
  assert.equal(ok.value.suggestion.tool, 'ch_anti_change');
  const bad = validateCoachTurn({ verdict: 'clarify', message: 'Try this.', suggestion: { kind: 'next_technique', tool: 'concept_map', reason: 'No.' } });
  assert.equal(bad.ok, false);
});

test('a group answer keeps only known groups; another book’s frame key is dropped', () => {
  const s = createSession({ text: 'The merger is coming.', kind: 'change' }, deps);
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', frame: { change: 'The merger is coming', group: 'ours+nowhere', situation: 'x' } });
  assert.ok(turn.ok, turn.error);
  const next = applyCoachTurn(s, turn.value, deps);
  assert.deepEqual(next.frame, { change: 'The merger is coming', group: 'ours' });
});

/** Meaning of Life worked on one concrete example, the reflection last, then Act opened on the step. */
async function committing() {
  let s = await step(acceptSuggestion(await framed(), deps));
  for (const text of ['More income from the city job', 'More meaning in the local role I know well', 'More fun with the city team', 'reflection: Meaning matters most to me this year, more than the pay rise.']) s = await step(s, text);
  s = await step(s, 'act');
  s = await step(acceptSuggestion(s, deps)); // boundary: the learning question
  s = await step(s, 'I chase income when I am tired.');
  assert.equal(s.suggestion?.tool, COMMIT_ID);
  return step(acceptSuggestion(s, deps));
}

async function committed() {
  let s = await committing();
  for (const answer of [
    'I choose the role that gives me more meaning this year.',
    'It rests on the meaning I placed in the local role.',
    'Ask the city team for a two-week trial day each week.',
    'My family on Saturdays, and the class I teach now.',
    'Review on 2026-11-05',
    'If the trial days drain me more than the local days do.'
  ]) s = await step(s, answer);
  return s;
}

test('Meaning of Life works through to Act: the step fills in order, with its basis and review date', async () => {
  const s = await committed();
  const run = s.steps.commit.runs[0];
  assert.equal(run.tool, COMMIT_ID);
  assert.deepEqual(run.nodes.map((node) => node.slot), ['result', 'rests_on', 'next_action', 'affected', 'check_back', 'change_course']);
  assert.equal(run.nodes.find((node) => node.slot === 'check_back').text, '2026-11-05');
  const restsOn = run.nodes.find((node) => node.slot === 'rests_on');
  assert.equal(s.basis[restsOn.id].length, 1);
  assert.equal(s.reviewProposal.due, '2026-11-05');
  assert.ok(s.proposedTasks.every((p) => p.status === 'proposed'));
});

test('a review date without a date is asked for again', async () => {
  let s = await committing();
  for (const answer of ['I choose the role that gives me more meaning this year.', 'It rests on the meaning I placed in the local role.', 'Ask the city team for a two-week trial day each week.', 'My family on Saturdays, and the class I teach now.']) s = await step(s, answer);
  s = await step(s, 'Sometime next month, probably');
  assert.equal(s.steps.commit.runs[0].nodes.length, 4);
  assert.match(s.turns.at(-1).text, /a date/);
});

test('Review waits for the review date, then opens the review; a walk to the end offers an update', async () => {
  let s = await committed();
  const offer = actionOffer(s);
  assert.equal(offer.kind, 'write');
  assert.match(offer.file.title, /^Change Book: /);
  assert.ok(offer.file.sections.some((section) => section.key === 'stay' && section.lines[0].includes('Saturday')));
  assert.ok(offer.file.sections.some((section) => section.key === 'affected'));
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  s = setReviewTask(s, { taskId: 'task-check', due: '2026-11-05' }, deps);
  s = await step(moveOn(s, deps));
  s = await step(s, 'A dated review keeps me honest.');
  assert.equal(s.reviewState.status, 'waiting');
  s = await step(s, 'Anything yet?');
  assert.match(s.turns.at(-1).text, /Review picks up on/);
  s = await step(startReview(s, {}, deps));
  assert.equal(s.suggestion.tool, REVIEW_ID);
  s = await step(acceptSuggestion(s, deps));
  for (const answer of ['The trial days went well and the family Saturdays held.', 'My reading held: meaning mattered more than the pay.', 'Keep the model for now, and keep the step as it is.']) s = await step(s, answer);
  s = await step(acceptSuggestion(s, deps)); // next_step: close the review
  assert.equal(s.phase, 'finished');
  const update = actionOffer(s);
  assert.equal(update.kind, 'update');
  assert.ok(update.changed.includes('outcome'));
});

test('only change sessions have a record offer', async () => {
  const s = await committed();
  assert.equal(actionOffer({ ...s, kind: 'rules' }), null);
});

/** A change session started from a shelf model, framed and with the model open. */
async function opened(model) {
  let s = await step(createSession({ text: 'My days are full of messages and I get little done.', kind: 'change', startModel: model }, deps));
  s = await step(s, 'It is about my own habits and how I spend my attention.');
  s = await step(s, 'The Friday catch-up with the team, which keeps us close.');
  return step(acceptSuggestion(s, deps));
}

test('Multitasking in the dev mock: the workday, then the coach waits for the star to be saved, then it completes', async () => {
  let s = await opened('ch_multitasking');
  assert.equal(activeRun(s).tool, 'ch_multitasking');
  s = await step(s, 'Last Tuesday at the office, mostly email and calls.');
  assert.deepEqual(activeRun(s).nodes.map((node) => node.slot), ['subject']);
  s = await step(s, 'I think it was about half email.');
  assert.match(s.turns.at(-1).text, /Score it on the chart/);
  assert.equal(activeRun(s).nodes.length, 1, 'a plain reply is not placed while the chart waits');
  s = score(s, { runId: activeRun(s).id, time: { a: 30, b: 50, c: 15, d: 30 }, value: { a: 8, b: 3, c: 9, d: 2 } }, deps);
  s = await step(s, 'Email takes half my day and gives back the least of anything.');
  assert.deepEqual(activeRun(s).nodes.map((node) => node.slot), ['subject', 'note:1']);
  s = await step(s, 'reflection: Focused work is worth the most and gets the least of my day.');
  assert.equal(isComplete(s.steps.explore.runs.at(-1)), true);
});

test('(Un)Happiness in the dev mock: own forces by hint, the table saved, then the two arrows and the reflection', async () => {
  let s = await opened('ch_unhappiness');
  s = await step(s, 'I would say three now and four later.');
  assert.match(s.turns.at(-1).text, /force:/);
  s = await step(s, 'force: The long commute into the city every day');
  assert.deepEqual(activeRun(s).nodes.map((node) => node.slot), ['force:1']);
  const ids = ['thoughts', 'luck', 'politics', 'faith', 'fitness_industry', 'social_limits', 'actions', 'friends_family', 'economy', 'science', 'own_1'];
  const col = (n) => Object.fromEntries(ids.map((id) => [id, n]));
  s = score(s, { runId: activeRun(s).id, feeling: 'happy', now: 3, later: 4, influenceNow: col(3), influenceLater: col(2) }, deps);
  s = await step(s, 'A steady job, good friends and a lot of luck with housing.');
  s = await step(s, 'Moving closer to family and cutting the commute right down.');
  assert.deepEqual(activeRun(s).nodes.map((node) => node.slot), ['force:1', 'got_here', 'get_there']);
  s = await step(s, 'reflection: I put more of it down to myself now than I expect to later.');
  assert.equal(isComplete(s.steps.explore.runs.at(-1)), true);
});
