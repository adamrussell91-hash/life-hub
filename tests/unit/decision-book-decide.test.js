// tests/unit/decision-book-decide.test.js
// Decision Maker's Decide, record and Review: the plan's tools for each step, the decision record
// tool, a reason's basis, the review date as a confirm card, the record composed from the session
// (with its provenance and update offers), the coach's basis rule, the Decide and Review prompt
// layers, and one scripted walk from frame to a reviewed decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_STEPS, defaultToolFor, planStepForBook, stepPlan, stepServes, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { canPropose, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { reviewStart } from '../../packages/problem-solver/review.mjs';
import { MODELS } from '../../packages/problem-solver/models.mjs';
import { FEEDBACK_ID, RECORD_ID } from '../../packages/decision-book/record-slots.mjs';
import { basisCandidates, basisOf, composeRecord, dateWords, mainModel, recordOffer, recordProvenance, resolveBasis } from '../../packages/decision-book/record.mjs';
import { isRecordDate } from '../../packages/decision-book/tools/record.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
import {
  acceptSuggestion, applyCoachTurn, confirmTask, createSession, dismissSuggestion, keepAnyway, linkCaseFile, moveOn, say, setReviewTask, startReview
} from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };

/** One coach turn when the runner is queued, after the person's words if any. */
async function step(session, text) {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

/** A framed decision with the Eisenhower matrix worked to its minimum. */
async function explored() {
  let s = await step(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
  s = await step(s, 'It is about me and I want to understand what I really want.');
  s = await step(s, 'The offer closes Friday and the rent there is double.');
  s = await step(acceptSuggestion(s, deps));
  s = await step(s, 'Reply to the Sydney offer letter, do immediately');
  s = await step(s, 'Talk the move over with my partner, decide when');
  s = await step(s, 'Sort out the lease renewal paperwork, do later');
  s = await step(s, 'reflection: The offer reply is the only thing that cannot wait.');
  return s;
}

/** Explored, then Decide opened on the decision record. */
async function deciding() {
  let s = await explored();
  s = await step(s, 'decide');
  s = await step(acceptSuggestion(s, deps)); // boundary: the learning question
  s = await step(s, 'I decide faster once the urgent part is named.');
  return step(acceptSuggestion(s, deps));
}

/** Deciding, with the record worked to complete. */
async function decided() {
  let s = await deciding();
  for (const answer of [
    'I will take the Sydney job and move in March.',
    'The offer reply cannot wait and it matters most.',
    'The rent there goes above half of my pay.',
    'Then I look at the flats further out instead.',
    'Email my acceptance to the Sydney office on Monday.',
    'Review it on 2027-01-21'
  ]) s = await step(s, answer);
  return s;
}

const recordRun = (s) => s.steps.decide.runs.find((run) => run.tool === RECORD_ID);

// ---------------------------------------------------------------- plan and tool

test('Decide lists only the decision record and Review only the feedback analysis, each its default', () => {
  assert.deepEqual(toolsForPlanStep('decision_book', 'decide'), [RECORD_ID]);
  assert.equal(defaultToolFor('decision_book', 'decide'), RECORD_ID);
  assert.deepEqual(toolsForPlanStep('decision_book', 'review'), [FEEDBACK_ID]);
  assert.equal(defaultToolFor('decision_book', 'review'), FEEDBACK_ID);
  assert.equal(defaultToolFor('decision_book', 'explore'), null);
  assert.ok(!toolsForPlanStep('decision_book', 'explore').includes(RECORD_ID));
});

test('Decide serves as Implement and Review as Improve; Problem Solver keeps its own steps; no step is choose', () => {
  assert.equal(planStepForBook('decision_book', 'implement'), 'decide');
  assert.equal(planStepForBook('decision_book', 'improve'), 'review');
  assert.equal(planStepForBook('decision_book', 'document'), null);
  assert.ok(stepServes('decision_book', 'review', 'improve') && !stepServes('decision_book', 'explore', 'improve'));
  assert.equal(planStepForBook('seven_step', 'improve'), 'improve');
  assert.equal(planStepForBook('polya', 'improve'), 'evaluate');
  assert.ok(stepPlan('decision_book').every((s) => s.step !== 'choose'));
  assert.ok(TOOLS[RECORD_ID].steps.every((s) => s.id !== 'choose'));
});

test('Problem Solver never lists the decision record: no toolkit step, plan step or rubric line', () => {
  for (const book of BOOK_STEPS) assert.ok(!toolsForBookStep(book.id).includes(RECORD_ID), book.id);
  for (const id of Object.keys(MODELS)) for (const { step: stepId } of stepPlan(id)) assert.ok(!toolsForPlanStep(id, stepId).some((tool) => tool.startsWith('dm_')), `${id} ${stepId}`);
  assert.ok(!RUBRIC.includes('dm_'));
  const s = createSession({ text: 'Late rota.' }, deps);
  assert.ok(!buildCoachPrompt(s).system.join('\n').includes('dm_'));
});

test('the record takes its slots in order and completes with every one', () => {
  const place = (run, slot, text = 'An answer here') => placeNode(run, { id: `n${run.nodes.length + 1}`, slot, text, state: 'accepted' });
  let run = newRun(RECORD_ID, 'r');
  assert.deepEqual(nextSlots(run), ['decision']);
  run = place(run, 'decision');
  assert.deepEqual(nextSlots(run), ['reason:1']);
  run = place(run, 'reason:1');
  assert.deepEqual(nextSlots(run), ['reason:2', 'trigger']);
  run = place(run, 'trigger');
  assert.deepEqual(nextSlots(run), ['reason:2', 'action']);
  run = place(run, 'action');
  run = place(run, 'first_step');
  assert.deepEqual(nextSlots(run), ['reason:2', 'review']);
  assert.ok(!isComplete(run));
  assert.equal(checkNode(run, { slot: 'review', text: 'in a month' }), 'The review is a date: put it in node.text as YYYY-MM-DD.');
  assert.equal(checkNode(run, { slot: 'review', text: '2027-02-31' }), 'The review is a date: put it in node.text as YYYY-MM-DD.');
  run = place(run, 'review', '2027-01-21');
  assert.ok(isComplete(run));
  assert.deepEqual(nextSlots(run), []);
  assert.ok(canPropose(run, run.nodes.find((node) => node.slot === 'first_step')));
  assert.ok(!canPropose(run, run.nodes.find((node) => node.slot === 'decision')));
  assert.ok(isRecordDate('2027-01-21') && !isRecordDate('21/01/2027'));
});

// ---------------------------------------------------------------- the walk

test('the scripted coach suggests another angle from the see also as next_model, then Decide', async () => {
  let s = await explored();
  assert.ok(isComplete(s.steps.explore.runs[0]));
  assert.equal(s.proposedTasks.length, 1, 'the do-immediately item is offered as a task');
  s = await step(s, 'another angle');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'dm_project_portfolio', reason: 'Another angle on the same decision: The project portfolio matrix.' });
  s = dismissSuggestion(s, deps);
  s = await step(s, 'decide');
  assert.equal(s.suggestion.kind, 'next_step');
});

test('Decide opens on the decision record; a reason keeps the Explore node it rests on', async () => {
  let s = await deciding();
  assert.equal(s.phase, 'decide');
  assert.equal(s.steps.decide.runs[0].tool, RECORD_ID);
  s = await step(s, 'I will take the Sydney job and move in March.');
  s = await step(s, 'The offer reply cannot wait and it matters most.');
  const reason = recordRun(s).nodes.find((node) => node.slot === 'reason:1');
  const item = s.steps.explore.runs[0].nodes.find((node) => node.slot === 'item:1');
  assert.deepEqual(s.basis[reason.id], [{ runId: s.steps.explore.runs[0].id, nodeId: item.id }]);
  assert.deepEqual(basisOf(s)[reason.id], [{ model: 'The Eisenhower matrix', title: item.text }]);
  const prompt = buildDecisionPrompt(s);
  assert.match(prompt.user, /REASONS CAN REST ON \(tool slot: node\):\n {2}dm_eisenhower item:1: /);
  assert.match(prompt.user, /Placed reasons rest on:\n {2}reason:1 rests on The Eisenhower matrix: /);
});

test('the record’s review date becomes the review card; its first step a task card', async () => {
  const s = await decided();
  assert.ok(isComplete(recordRun(s)));
  assert.deepEqual(s.reviewProposal, { title: 'Review: Should I take the Sydney job offer?', due: '2027-01-21', reason: 'The review date set in the decision record.', status: 'proposed' });
  assert.equal(s.proposedTasks.at(-1).title, 'Email my acceptance to the Sydney office on');
  assert.equal(s.suggestion.kind, 'next_step');
  assert.match(buildDecisionPrompt(s).user, /Progress: RECORD COMPLETE\. Suggest next_step: Review waits for its date\./);
  assert.match(buildDecisionPrompt(s).user, /REVIEW: proposed for 2027-01-21/);
});

test('a review date that is not after today is placed but proposes no review', async () => {
  let s = await deciding();
  for (const answer of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.', 'The rent there goes above half of my pay.', 'Then I look at the flats further out instead.', 'Email my acceptance to the Sydney office on Monday.', 'Review it on 2026-10-01']) s = await step(s, answer);
  assert.ok(isComplete(recordRun(s)));
  assert.equal(s.reviewProposal, null);
});

test('moving on waits for the review; Review now opens the feedback analysis with the task evidence', async () => {
  let s = await decided();
  s = confirmTask(s, { proposalId: s.proposedTasks.at(-1).id, taskId: 'task-first' }, deps);
  s = setReviewTask(s, { taskId: 'task-review', due: '2027-01-21' }, deps);
  s = await step(moveOn(s, deps));
  assert.equal(s.phase, 'review');
  assert.deepEqual(s.reviewState, { status: 'waiting', due: '2027-01-21', returnTo: null, startedAt: null });
  assert.match(buildDecisionPrompt(s).user, /REVIEW IS WAITING for results\. It is a task for 2027-01-21\./);
  s = await step(s, 'I learned I set the trigger before I felt sure.');
  assert.match(s.turns.at(-1).text, /Review picks up at your review on/);
  assert.equal(s.suggestion, null);
  assert.equal(reviewStart(s), 'start');
  s = await step(startReview(s, { snapshot: { byStatus: { done: 1, open: 1 }, overdue: [] } }, deps));
  assert.equal(s.reviewState.status, 'reviewing');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: FEEDBACK_ID, reason: 'Compare what you expected with what happened.' });
  assert.match(buildDecisionPrompt(s).user, /TASK STATUS \(as of 2026-10-21\): 2 tasks: 1 not started, 1 done/);
  s = await step(acceptSuggestion(s, deps));
  assert.match(s.turns.at(-1).text, /^Let's look at how it went\. 1 of 2 tasks are done\./);
  s = await step(s, 'Taking the Sydney job and moving in March.');
  s = await step(s, 'I expected the move to settle within two months.');
  s = await step(s, 'The move took four months and cost far more.');
  s = await step(s, 'reflection: I judge timing too hopefully, so I pad my estimates now.');
  const run = s.steps.review.runs[0];
  assert.deepEqual(run.nodes.filter((node) => node.slot.startsWith('force')).map((node) => node.tag), ['expected', 'actual']);
  assert.ok(isComplete(run));
  assert.match(buildDecisionPrompt(s).user, /Suggest next_step to close the review/);
});

// ---------------------------------------------------------------- the record

test('the record composes from the session, never the coach’s words', async () => {
  const s = await decided();
  const file = composeRecord(s);
  assert.equal(file.title, 'Decision: Should I take the Sydney job offer?');
  assert.deepEqual(file.sections.map((section) => section.key), ['decision', 'reasons', 'stop_rule', 'first_step', 'review', 'known', 'models', 'learnings']);
  const lines = Object.fromEntries(file.sections.map((section) => [section.key, section.lines]));
  assert.deepEqual(lines.decision, ['I will take the Sydney job and move in March.']);
  assert.match(lines.reasons[0], /^The offer reply cannot wait and it matters most\. \(rests on The Eisenhower matrix: .+\)$/);
  assert.deepEqual(lines.stop_rule, ['If: The rent there goes above half of my pay.', 'Then: Then I look at the flats further out instead.']);
  assert.deepEqual(lines.review, ['21 January 2027']);
  assert.deepEqual(lines.models, ['The Eisenhower matrix']);
  assert.ok(!JSON.stringify(file).includes('That holds up'), 'no coach message reaches the record');
});

test('the provenance names the main model, its section and the caption', async () => {
  const s = await decided();
  assert.equal(mainModel(s), 'dm_eisenhower');
  assert.deepEqual(recordProvenance(s), {
    model: 'dm_eisenhower',
    section: 1,
    models: ['The Eisenhower matrix'],
    date: '2026-10-21',
    caption: 'Decided with The Decision Book · The Eisenhower matrix · 21 October 2026'
  });
  assert.equal(dateWords('2027-01-01'), '1 January 2027');
  assert.equal(dateWords('soon'), 'soon');
});

test('record offers: write, then nothing, a graphic retry, and a dated update after the review', async () => {
  let s = await decided();
  assert.equal(recordOffer(createSession({ text: 'Late rota.' }, deps)), null, 'only decision sessions keep a record');
  const offer = recordOffer(s);
  assert.equal(offer.kind, 'write');
  assert.equal(offer.provenance.caption, 'Decided with The Decision Book · The Eisenhower matrix · 21 October 2026');
  assert.match(buildDecisionPrompt(s).user, /DECISION RECORD: ready to write\./);
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: false }, deps);
  assert.equal(s.caseFile.graphic, false);
  assert.equal(recordOffer(s).kind, 'graphic');
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  assert.equal(s.caseFile.graphic, true);
  assert.equal(recordOffer(s), null);
  assert.deepEqual(s.links, [{ kind: 'task', id: 'task-page' }]);
  assert.match(buildDecisionPrompt(s).user, /DECISION RECORD: v1 written 2026-10-21 to the linked task\./);

  s = setReviewTask(s, { taskId: 'task-review', due: '2027-01-21' }, deps);
  s = await step(moveOn(s, deps));
  s = await step(s, 'Nothing new about how I decide yet.');
  s = await step(startReview(s, {}, deps));
  s = await step(acceptSuggestion(s, deps));
  for (const answer of ['Taking the Sydney job and moving in March.', 'I expected the move to settle within two months.', 'The move took four months and cost far more.']) s = await step(s, answer);
  assert.equal(recordOffer(s), null, 'held while the review is under way');
  s = await step(s, 'reflection: I judge timing too hopefully, so I pad my estimates now.');
  s = await step(moveOn(s, deps));
  assert.equal(s.phase, 'finished');
  const update = recordOffer(s);
  assert.equal(update.kind, 'update');
  assert.equal(update.version, 2);
  assert.ok(update.changed.includes('outcome'));
  assert.deepEqual(update.file.sections.find((section) => section.key === 'outcome').lines, ['The move took four months and cost far more.', 'What it shows: I judge timing too hopefully, so I pad my estimates now.']);
});

test('a session with no record of its own still cannot link one; Problem Solver ignores graphic', () => {
  const unframed = createSession({ text: 'Late rota.' }, deps);
  assert.throws(() => linkCaseFile(unframed, { target: { kind: 'task', id: 't' }, version: 1, title: 'x', sections: { a: '0000000a' } }, deps), /no Document step/);
  const framed = { ...unframed, model: { id: 'polya', reason: 'r' } };
  const linked = linkCaseFile(framed, { target: { kind: 'task', id: 't' }, version: 1, title: 'x', sections: { a: '0000000a' }, graphic: false }, deps);
  assert.equal(linked.caseFile.graphic, undefined);
});

// ---------------------------------------------------------------- the live coach's basis rule

test('the live coach must rest an accepted reason on a placed node; other nodes drop a basis', async () => {
  let s = await deciding();
  s = await step(s, 'I will take the Sydney job and move in March.');
  s = say(s, 'Because the offer reply cannot wait.', deps);
  const replies = [
    { verdict: 'accept', message: 'That holds up. What would make you rethink?', node: { slot: 'reason', text: 'The offer reply cannot wait.' } },
    { verdict: 'accept', message: 'That holds up. What would make you rethink?', node: { slot: 'reason', text: 'The offer reply cannot wait.' }, basis: [{ tool: 'dm_eisenhower', slot: 'item:1' }, { tool: 'dm_nope', slot: 'item:1' }] }
  ];
  const seen = [];
  const coach = createModelCoach(async (prompt) => {
    seen.push(prompt.user);
    return JSON.stringify(replies.shift());
  });
  const turn = await coach(s);
  assert.match(seen[1], /YOUR LAST REPLY WAS REJECTED: A reason rests on what a model showed: put at least one of these in "basis".+dm_eisenhower item:1/);
  assert.deepEqual(turn.basis, [{ tool: 'dm_eisenhower', slot: 'item:1' }, { tool: 'dm_nope', slot: 'item:1' }]);
  const next = applyCoachTurn(s, turn, deps);
  const reason = recordRun(next).nodes.find((node) => node.slot === 'reason:1');
  assert.equal(next.basis[reason.id].length, 1, 'only the placed node is kept');

  const other = createModelCoach(async () => JSON.stringify({ verdict: 'accept', message: 'Noted, now the next one. What else?', node: { slot: 'trigger', text: 'Rent above half my pay.' }, basis: [{ tool: 'dm_eisenhower', slot: 'item:1' }] }));
  assert.deepEqual((await other(say(next, 'If rent tops half my pay.', deps))).basis, []);
});

test('a challenged reason keeps its basis for Keep it anyway', async () => {
  let s = await deciding();
  s = await step(s, 'I will take the Sydney job and move in March.');
  s = say(s, 'Feels right.', deps);
  const turn = { verdict: 'challenge', message: 'That rests on a feeling. What did a model show?', node: { slot: 'reason:1', text: 'Feels right.', title: 'Feels right' }, edges: [], skillsSeen: [], skillsMissing: ['critical_thinking'], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, basis: [{ tool: 'dm_eisenhower', slot: 'item:2' }] };
  s = applyCoachTurn(s, turn, deps);
  assert.deepEqual(s.pendingKeep.basis, [{ tool: 'dm_eisenhower', slot: 'item:2' }]);
  s = keepAnyway(s, deps);
  const reason = recordRun(s).nodes.find((node) => node.slot === 'reason:1');
  assert.equal(reason.state, 'contested');
  assert.equal(s.basis[reason.id][0].nodeId, s.steps.explore.runs[0].nodes.find((node) => node.slot === 'item:2').id);
});

test('basis candidates are the latest kept run of each model; unknown references resolve to nothing', async () => {
  const s = await explored();
  const candidates = basisCandidates(s);
  assert.deepEqual(candidates.map((c) => c.slot), ['item:1', 'item:2', 'item:3', 'reflection']);
  assert.deepEqual(resolveBasis(s, [{ tool: 'dm_eisenhower', slot: 'item:9' }, null, { tool: 'swot', slot: 'item:1' }]), []);
});

// ---------------------------------------------------------------- prompt layers

test('the Decide and Review layers name their tool and rules', async () => {
  const s = await deciding();
  const decide = buildDecisionPrompt(s).system[1];
  assert.match(decide, /DECISION RECORD RULES/);
  assert.match(decide, /"basis" as \[\{"tool":"<model id>","slot":"<slot>"\}\]/);
  assert.match(decide, /review: a date after TODAY, in node.text as YYYY-MM-DD/);
  const review = buildDecisionPrompt({ ...s, phase: 'review', steps: { ...s.steps, review: { runs: [], status: 'open', objection: null } } }).system[1];
  assert.match(review, /^CURRENT STEP: Review\nReview compares what the person expected when they decided with what actually happened, on the feedback analysis \(dm_feedback_analysis\)\./);
  assert.match(review, /When REVIEW IS WAITING/);
});
