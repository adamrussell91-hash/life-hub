// tests/unit/decision-book-prompts.test.js
// Decision Maker's coach knowledge: the rubric and its catalogue lines, the step layer, the
// active model's note, waiting, tasks, another angle, and the route from coach to prompt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISION_RUBRIC, buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
import { GATEKEEPING, VOICE } from '../../netlify/functions/_shared/problem-solver/prompts-shared.mjs';
import { COMPANIONS, anotherAngle, catalogueLines, modelNote } from '../../netlify/functions/_shared/problem-solver/knowledge/decision-book.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, moveOn } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { CATALOGUE } from '../../packages/decision-book/catalogue.mjs';
import { COMPASS_IDS } from '../../packages/decision-book/compass.mjs';
import { DECISION_MODEL } from '../../packages/decision-book/model.mjs';
import { workThrough } from '../../packages/decision-book/work-through.mjs';
import { MODELS } from '../../packages/problem-solver/models.mjs';
import { BOOK_STEPS, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, ...fields });

/** A framed decision with `tool` open in Explore. */
function inModel(tool) {
  let s = createSession({ text: 'Too much on this term.', kind: 'decision' }, deps);
  s = applyCoachTurn(s, turn({ frame: { decision: 'What to drop this term.' } }), deps);
  s = applyCoachTurn(s, turn({ frame: { compass: 'self_improve' } }), deps);
  s = applyCoachTurn(s, turn({ frame: { known: 'Five commitments, two due in May.' }, suggestion: { kind: 'next_tool', tool, reason: 'r' } }), deps);
  return acceptSuggestion(s, deps);
}

/** The session with its active run swapped for `run`. */
function withRun(session, run) {
  const step = session.steps.explore;
  return { ...session, steps: { ...session.steps, explore: { ...step, runs: step.runs.map((r) => (r.status === 'active' ? { ...run, id: r.id, status: 'active' } : r)) } } };
}

test('the rubric shares voice and gatekeeping, and adds the stance, compass, flow and traps', () => {
  assert.ok(DECISION_RUBRIC.includes(VOICE));
  assert.ok(DECISION_RUBRIC.includes(GATEKEEPING));
  for (const words of ['THE BOOK\'S STANCE', 'THE SECTION COMPASS', 'DECISION TRAPS', 'sunk-cost', 'single option dressed up as a choice', 'name one sibling you passed over', 'dm_yes_no', 'dm_stop_rule', 'Waiting on', 'ANOTHER ANGLE', 'Can become tasks']) {
    assert.ok(DECISION_RUBRIC.includes(words), `rubric mentions ${words}`);
  }
  for (const id of COMPASS_IDS) assert.ok(DECISION_RUBRIC.includes(`- ${id}:`), `compass ${id}`);
  assert.match(DECISION_RUBRIC, /"frame":\{"decision":"...","compass":"...","known":"..."\}\|null,"suggestion"/);
  assert.doesNotMatch(DECISION_RUBRIC, /whatIsTrue|"model":|proposeReview|reopen_step/);
});

test('one catalogue line per model, the book\'s see also and our pairs kept apart', () => {
  const lines = catalogueLines().split('\n');
  assert.equal(lines.length, 52);
  assert.deepEqual(lines.map((line) => line.match(/^- (\S+) \(/)[1]), CATALOGUE.map((entry) => entry.id));
  for (const line of lines) assert.match(line, /\[s[1-4] (worksheet|lens)\]: \S/);
  const whitmore = lines.find((line) => line.startsWith('- dm_whitmore '));
  assert.match(whitmore, /Book's see also: dm_flow\./);
  const eisenhower = lines.find((line) => line.startsWith('- dm_eisenhower '));
  assert.doesNotMatch(eisenhower, /Book's see also/);
  assert.match(eisenhower, /Pairs well \(ours\): dm_project_portfolio, dm_stop_rule\./);
  assert.ok(DECISION_RUBRIC.includes(catalogueLines()));
});

test('Problem Solver\'s prompts never list the Decision Maker models', () => {
  assert.doesNotMatch(RUBRIC, /dm_/);
  assert.doesNotMatch(buildCoachPrompt(createSession({ text: 'Students hand in work late.' }, deps)).system.join('\n'), /dm_/);
  for (const model of Object.keys(MODELS)) {
    for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('dm_')), `${model} ${step}`);
  }
  for (const { id } of BOOK_STEPS) assert.ok(!toolsForBookStep(id).some((tool) => tool.startsWith('dm_')), id);
});

test('every model has a note: steps, slots, watch-fors, and the lens or worksheet rule', () => {
  for (const entry of CATALOGUE) {
    const note = modelNote(entry.id);
    assert.match(note, new RegExp(`^MODEL NOTE: .+ \\(${entry.id}\\), section ${entry.section}`));
    for (const part of ['Use it when:', 'Steps:\n  1. ', 'Slot meanings:', 'Watch for:']) assert.ok(note.includes(part), `${entry.id} ${part}`);
    assert.ok(note.includes(entry.tier === 'lens' ? 'Lens: explain the idea in two sentences' : 'Worksheet: work its steps'), entry.id);
  }
  assert.match(modelNote('dm_eisenhower'), /Exercise \(offer once, when the minimum is met\): Sort this week/);
  assert.match(modelNote('dm_eisenhower'), /item = .+\(tag: decide_when\|do_now\|do_later\|delegate\)/);
  assert.equal(modelNote('five_whys'), null);
});

test('companions sit in the reused tools\' notes, not in new slots', () => {
  assert.match(modelNote('morphological'), /SCAMPER companion: .+substitute, combine, adapt/);
  assert.match(modelNote('double_loop'), /Espoused theory and theory in use/);
  assert.match(modelNote('swot'), /Reused from Problem Solver: where its words say Implement, read Decide\./);
  assert.doesNotMatch(modelNote('swot'), /SCAMPER|Espoused/);
  assert.deepEqual(Object.keys(COMPANIONS), ['morphological', 'double_loop']);
});

test('framing: two cached layers, the missing answers, and no model note', () => {
  const prompt = buildDecisionPrompt(createSession({ text: 'Should I move?', kind: 'decision' }, deps));
  assert.equal(prompt.system.length, 2);
  assert.equal(prompt.system[0], DECISION_RUBRIC);
  assert.match(prompt.system[1], /NEXT AFTER FRAMING: Explore/);
  assert.match(prompt.user, /^DECISION: Should I move\?/);
  assert.match(prompt.user, /Missing frame answers: decision, compass, known/);
});

test('in a model: a third cached layer with its note, and the run state in the turn', () => {
  const prompt = buildDecisionPrompt(inModel('dm_eisenhower'));
  assert.equal(prompt.system.length, 3);
  assert.match(prompt.system[1], /CURRENT STEP: Explore/);
  assert.equal(prompt.system[2], modelNote('dm_eisenhower'));
  assert.match(prompt.user, /COMPASS: Improve yourself/);
  assert.match(prompt.user, /ACTIVE MODEL: The Eisenhower matrix \(dm_eisenhower\)/);
  assert.match(prompt.user, /Open slots: item:1/);
  assert.match(prompt.user, /Progress: not yet at the minimum/);
  assert.doesNotMatch(prompt.user, /Steps:|Slot meanings:/); // static parts stay in the cached note
});

test('the coach waits while the person places points on a plot', () => {
  let s = inModel('dm_gift');
  s = applyCoachTurn(s, turn({ node: { slot: 'point:1', text: 'A book for my sister', title: 'Book' } }), deps);
  assert.match(buildDecisionPrompt(s).user, /Waiting on: The person places each point on the chart/);
});

test('do-immediately items can become tasks through the proposal flow', () => {
  let s = inModel('dm_eisenhower');
  s = applyCoachTurn(s, turn({ node: { slot: 'item:1', text: 'Reply to the head of year', title: 'Reply', tag: 'do_now' } }), deps);
  s = applyCoachTurn(s, turn({ node: { slot: 'item:2', text: 'Sort the shed', title: 'Shed', tag: 'do_later' } }), deps);
  assert.match(buildDecisionPrompt(s).user, /Can become tasks: item:1\n/);
  s = applyCoachTurn(s, turn({ proposeTasks: [{ slot: 'item:1', title: 'Reply to the head of year', due: null }, { slot: 'item:2', title: 'Sort the shed', due: null }] }), deps);
  assert.deepEqual(s.proposedTasks.map((p) => [p.title, p.status]), [['Reply to the head of year', 'proposed']]);
  assert.match(buildDecisionPrompt(s).user, /TASKS FROM THIS DECISION:\n {2}proposed: "Reply to the head of year"/);
});

test('minimum met: another angle from the book\'s see also, then ours, or Decide', () => {
  const s = withRun(inModel('dm_whitmore'), workThrough('dm_whitmore'));
  assert.match(buildDecisionPrompt(s).user, /Progress: MINIMUM MET\. ANOTHER ANGLE: the book's see also: dm_flow; ours: .+; or next_step to Decide\./);
  assert.deepEqual(anotherAngle('dm_whitmore', ['dm_flow']).book, []);
  assert.deepEqual(anotherAngle('dm_eisenhower'), { book: [], ours: ['dm_project_portfolio', 'dm_stop_rule'] });
});

test('Decide has its own step layer and no model note', () => {
  const s = moveOn(inModel('dm_eisenhower'), deps);
  const prompt = buildDecisionPrompt(s);
  assert.equal(s.phase, 'decide');
  assert.equal(prompt.system.length, 2);
  assert.match(prompt.system[1], /CURRENT STEP: Decide\n.+Stop Rule/);
  assert.match(prompt.user, /MODE: boundary.+what they learned about how they decide/);
});

test('a decision session is coached with the decision prompt, a Problem Solver one with its own', async () => {
  const seen = [];
  const coach = createModelCoach(async (prompt) => {
    seen.push(prompt.system[0]);
    return JSON.stringify({ verdict: 'clarify', message: 'Tell me a little more about what is at stake, and by when it has to be settled?' });
  });
  await coach(createSession({ text: 'Should I move?', kind: 'decision' }, deps));
  await coach(createSession({ text: 'Late work.' }, deps));
  assert.deepEqual(seen, [DECISION_RUBRIC, RUBRIC]);
});

test('next_model is next_tool for the book\'s models only', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'm', suggestion: { kind: 'next_model', tool: 'dm_flow', reason: 'r' } });
  assert.deepEqual(ok.value.suggestion, { kind: 'next_tool', tool: 'dm_flow', reason: 'r' });
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'm', suggestion: { kind: 'next_model', tool: 'five_whys', reason: 'r' } }).ok, false);
});

test('no Decision Maker step is called choose', () => {
  assert.ok(!DECISION_MODEL.steps.some((step) => step.id === 'choose'));
});
