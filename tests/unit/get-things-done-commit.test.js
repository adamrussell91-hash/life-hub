// tests/unit/get-things-done-commit.test.js
// Gear Shifter's Commit and Review tools: the plan's tools for each step, gt_commit's slots in
// order with the check-back as a date, gt_review's three slots, the record register in books.mjs,
// and the session hooks: rests_on keeps its basis, the check-back becomes the review card and the
// next action a task card. The live coach rests an accepted rests_on on a placed node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_STEPS, defaultToolFor, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { canPropose, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { BOOK_KINDS } from '../../packages/problem-solver/books.mjs';
import { GEAR_TOOLS } from '../../packages/get-things-done/tools/index.mjs';
import { COMMIT_ID, COMMIT_SLOT_NAMES, EXPERIMENT_REVIEW_ID, EXPERIMENT_REVIEW_SLOT_NAMES } from '../../packages/get-things-done/commit-slots.mjs';
import { REVIEW_TOOL } from '../../packages/get-things-done/model.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-22T10:00:00.000Z', newId: () => `id${(n += 1)}` };

/** The person says `text` (if any), then the coach replies with `raw`, read through the schema. */
export function reply(session, raw, text = null) {
  const next = text ? say(session, text, deps) : session;
  const turn = validateCoachTurn({ verdict: 'accept', message: 'Noted.', ...raw });
  assert.ok(turn.ok, turn.error);
  return applyCoachTurn(next, turn.value, deps);
}

/** A framed shift with Appreciation worked to its minimum. */
export function explored() {
  let s = createSession({ text: 'The team report keeps stalling.', kind: 'shift' }, deps);
  s = reply(s, { frame: { need: 'Get the team report out' } });
  s = reply(s, { frame: { route: 'others' } }, 'It turns on two colleagues.');
  s = reply(s, { frame: { known: 'Due Friday; Priya has the data.' }, suggestion: { kind: 'next_technique', tool: 'gt_appreciation', reason: 'Fits.' } }, 'Due Friday; Priya has the data.');
  s = acceptSuggestion(s, deps);
  s = reply(s, { node: { slot: 'entry:1', text: 'Thank Priya for pulling the sales data together', tag: 'acknowledge_contribution' } }, 'Priya pulled the data.');
  s = reply(s, { node: { slot: 'reflection', text: 'Saying thanks first makes the next ask easier' } }, 'Thanks first.');
  return s;
}

/** Explored, then Commit opened on gt_commit. */
export function committing() {
  let s = moveOn(explored(), deps);
  s = applyCoachTurn(s, validateCoachTurn({ verdict: 'clarify', message: 'What did you learn about how you get things done?' }).value, deps);
  s = reply(s, { verdict: 'clarify', learning: 'I move faster when I thank people first.' }, 'I move faster when I thank people first.');
  assert.equal(s.suggestion?.tool, COMMIT_ID);
  return acceptSuggestion(s, deps);
}

const commitRun = (s) => s.steps.commit.runs.find((run) => run.tool === COMMIT_ID);

// ---------------------------------------------------------------- plan and tools

test('Commit lists only gt_commit, its default; Review lists the experiment review and Project Evaluation', () => {
  assert.deepEqual(toolsForPlanStep('gear_shifter', 'commit'), [COMMIT_ID]);
  assert.equal(defaultToolFor('gear_shifter', 'commit'), COMMIT_ID);
  assert.deepEqual(toolsForPlanStep('gear_shifter', 'review'), [EXPERIMENT_REVIEW_ID, REVIEW_TOOL]);
  assert.equal(defaultToolFor('gear_shifter', 'review'), null);
  assert.ok(!toolsForPlanStep('gear_shifter', 'explore').includes(COMMIT_ID));
  assert.ok(!toolsForPlanStep('gear_shifter', 'explore').includes(EXPERIMENT_REVIEW_ID));
  assert.equal(TOOLS[COMMIT_ID].step, 'commit');
  assert.ok(!GEAR_TOOLS[COMMIT_ID] && !GEAR_TOOLS[EXPERIMENT_REVIEW_ID]);
});

test('no toolkit step and no Decision Maker step lists the Commit or Review tools', () => {
  for (const { id } of BOOK_STEPS) assert.ok(!toolsForBookStep(id).some((t) => [COMMIT_ID, EXPERIMENT_REVIEW_ID].includes(t)), id);
  for (const { step } of stepPlan('decision_book')) assert.ok(!toolsForPlanStep('decision_book', step).some((t) => t.startsWith('gt_')), step);
});

test('gt_commit takes its slots in order, refuses a check-back that is no date, and completes with all six', () => {
  assert.deepEqual(COMMIT_SLOT_NAMES, ['result', 'rests_on', 'next_action', 'start', 'check_back', 'change_course']);
  let run = newRun(COMMIT_ID, 'c1');
  const texts = { result: 'The report sent on Friday', rests_on: 'Appreciation', next_action: 'Message Priya to thank her', start: 'Right after the stand-up', check_back: '2026-11-05', change_course: 'Priya does not reply by Wednesday' };
  for (const [i, name] of COMMIT_SLOT_NAMES.entries()) {
    assert.deepEqual(nextSlots(run), [name]);
    if (name === 'check_back') {
      assert.ok(checkNode(run, { slot: name, text: 'next Thursday' }, []));
      assert.ok(checkNode(run, { slot: name, text: '2026-02-31' }, []));
    }
    run = placeNode(run, { id: `n${i}`, slot: name, text: texts[name], state: 'accepted' });
    assert.equal(isComplete(run), i === COMMIT_SLOT_NAMES.length - 1);
  }
  assert.deepEqual(nextSlots(run), []);
  assert.deepEqual(run.nodes.filter((node) => canPropose(run, node)).map((node) => node.slot), ['next_action']);
});

test('gt_review takes what changed, what it cost and what to keep, in order', () => {
  assert.deepEqual(EXPERIMENT_REVIEW_SLOT_NAMES, ['changed', 'cost', 'keep']);
  let run = newRun(EXPERIMENT_REVIEW_ID, 'r1');
  for (const [i, name] of EXPERIMENT_REVIEW_SLOT_NAMES.entries()) {
    assert.deepEqual(nextSlots(run), [name]);
    run = placeNode(run, { id: `n${i}`, slot: name, text: `${name} words here`, state: 'accepted' });
  }
  assert.ok(isComplete(run));
  assert.equal(TOOLS[EXPERIMENT_REVIEW_ID].step, 'review');
});

test('each book names its record tool, basis slot and date slot', () => {
  assert.deepEqual({ ...BOOK_KINDS.decision.record }, { tool: 'dm_record', basisSlot: 'reason', dateSlot: 'review', dateReason: 'The review date set in the decision record.', basisRule: 'A reason rests on what a model showed' });
  assert.deepEqual({ ...BOOK_KINDS.shift.record }, { tool: COMMIT_ID, basisSlot: 'rests_on', dateSlot: 'check_back', dateReason: 'The check-back date set in the experiment.', basisRule: 'The experiment rests on what a technique showed' });
});

// ---------------------------------------------------------------- session hooks

test('rests_on keeps the Explore nodes it names; the next action becomes a task card', () => {
  let s = committing();
  s = reply(s, { node: { slot: 'result', text: 'The team report goes out on Friday' } }, 'The report out on Friday.');
  s = reply(s, { node: { slot: 'rests_on', text: 'Appreciation: thank Priya first' }, basis: [{ tool: 'gt_appreciation', slot: 'entry:1' }, { tool: 'gt_nope', slot: 'entry:1' }] }, 'It rests on thanking Priya.');
  const run = commitRun(s);
  const restsOn = run.nodes.find((node) => node.slot === 'rests_on');
  const appreciation = s.steps.explore.runs[0];
  assert.deepEqual(s.basis[restsOn.id], [{ runId: appreciation.id, nodeId: appreciation.nodes[0].id }]);
  s = reply(s, { node: { slot: 'next_action', text: 'Message Priya to thank her' }, proposeTasks: [{ slot: 'next_action', title: 'Message Priya', due: '2026-10-23' }] }, 'Message Priya.');
  assert.deepEqual(s.proposedTasks.map((p) => [p.title, p.status, p.due]), [['Message Priya', 'proposed', '2026-10-23']]);
});

test('an accepted check-back after today becomes the review card; one not after today does not', () => {
  const upTo = (date) => {
    let s = committing();
    for (const [slot, text] of [['result', 'The team report goes out on Friday'], ['rests_on', 'Appreciation'], ['next_action', 'Message Priya'], ['start', 'Right after the stand-up']]) s = reply(s, { node: { slot, text } }, text);
    return reply(s, { node: { slot: 'check_back', text: date } }, date);
  };
  const later = upTo('2026-11-05');
  assert.deepEqual(later.reviewProposal, { title: 'Review: The team report keeps stalling.', due: '2026-11-05', reason: 'The check-back date set in the experiment.', status: 'proposed' });
  const today = upTo('2026-10-22');
  assert.equal(commitRun(today).nodes.at(-1).slot, 'check_back');
  assert.equal(today.reviewProposal, null);
});

test('the live coach must rest an accepted rests_on on a placed node; other slots drop a basis', async () => {
  let s = committing();
  s = reply(s, { node: { slot: 'result', text: 'The team report goes out on Friday' } }, 'Report out Friday.');
  const replies = [
    { verdict: 'accept', message: 'Good.', node: { slot: 'rests_on', text: 'Appreciation' } },
    { verdict: 'accept', message: 'Good.', node: { slot: 'rests_on', text: 'Appreciation' }, basis: [{ tool: 'gt_appreciation', slot: 'entry:1' }] }
  ];
  const prompts = [];
  const coach = createModelCoach(async (prompt) => { prompts.push(prompt); return JSON.stringify(replies.shift()); });
  const turn = await coach(say(s, 'It rests on Appreciation.', deps));
  assert.equal(prompts.length, 2);
  assert.match(prompts[1].user, /rests on what a technique showed/);
  assert.deepEqual(turn.basis, [{ tool: 'gt_appreciation', slot: 'entry:1' }]);
  const result = await createModelCoach(async () => JSON.stringify({ verdict: 'accept', message: 'Good.', node: { slot: 'result', text: 'The report out' }, basis: [{ tool: 'gt_appreciation', slot: 'entry:1' }] }))(say(committing(), 'The report out.', deps));
  assert.deepEqual(result.basis, []);
});
