// tests/unit/problem-solver-prompts.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-19T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, ...fields });

function inTool(tool = 'five_whys', model = 'seven_step') {
  let s = createSession({ text: 'Late work.' }, deps);
  s = applyCoachTurn(s, turn({ frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: model, reason: 'r' }, suggestion: { kind: 'next_tool', tool, reason: 'r' } }), deps);
  return acceptSuggestion(s, deps);
}

test('rubric carries voice, skills, process, chapters and final words', () => {
  for (const word of ['Metacognition', 'Critical thinking', '25 and 60 words', 'Keep it anyway', 'seven-step', 'DEVISE:', 'determination, hope and success', 'Never end on agreement or praise alone.', 'MINIMUM MET']) {
    assert.ok(RUBRIC.includes(word), `rubric mentions ${word}`);
  }
});

test('system is two cached layers: the fixed rubric, then the step layer', () => {
  const prompt = buildCoachPrompt(inTool());
  assert.equal(prompt.system.length, 2);
  assert.equal(prompt.system[0], RUBRIC);
  assert.match(prompt.system[1], /CURRENT STEP: Define/);
  assert.match(prompt.system[1], /`problem_tree`/);
  assert.match(prompt.system[1], /five_whys \(5 Whys\)/);
  assert.match(prompt.system[1], /Watch for: Stopping at a symptom/);
});

test('frame prompt asks for the missing frame questions and has an empty step layer', () => {
  const prompt = buildCoachPrompt(createSession({ text: 'Students hand in work late.' }, deps));
  assert.match(prompt.user, /PHASE: frame/);
  assert.match(prompt.user, /Missing frame answers: goal, whatIsTrue, whatCanBeDone/);
  assert.match(prompt.system[1], /NEXT STEP AFTER FRAMING/);
  assert.match(prompt.system[1], /five_whys \(5 Whys\)/);
  assert.match(prompt.system[1], /`problem_tree`/);
});

test('tool prompt lists the tool steps, open slots and progress', () => {
  const prompt = buildCoachPrompt(inTool());
  assert.match(prompt.user, /ACTIVE TOOL: 5 Whys/);
  assert.match(prompt.user, /Open slots: problem/);
  assert.match(prompt.user, /Progress: not yet at the minimum/);
});

test('boundary prompt names the step left and asks for the learning question', () => {
  const s = moveOn(inTool(), deps);
  const { user } = buildCoachPrompt(s);
  assert.match(user, /MODE: boundary\. The person has just left Define/);
  assert.match(user, /exitObjection/);
  assert.match(user, /PHASE: analyse/);
});

test('boundary prompt after skipping a step with no runs asks about the next step, not a learning', () => {
  let s = applyCoachTurn(moveOn(inTool(), deps), turn({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  s = applyCoachTurn(say(s, 'I rush.', deps), turn({ verdict: 'clarify', message: 'Noted.' }), deps);
  s = moveOn(s, deps);
  const { user } = buildCoachPrompt(s);
  assert.match(user, /MODE: boundary/);
  assert.doesNotMatch(user, /what they learned/i);
  assert.match(user, /acknowledge/i);
  assert.match(user, /what they want from Devise/);
});

test('after a boundary the prompt asks the coach to record the learning and open the step', () => {
  let s = applyCoachTurn(moveOn(inTool(), deps), turn({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  s = say(s, 'I rush.', deps);
  assert.match(buildCoachPrompt(s).user, /AWAITING LEARNING from Define: if they named something they learned, put it in "learning"/);
});

test('earlier steps are summarised for carry-forward', () => {
  let s = inTool();
  s = applyCoachTurn(s, turn({ node: { slot: 'problem', text: 'Reports are late.' } }), deps);
  s = moveOn(s, deps);
  assert.match(buildCoachPrompt(s).user, /EARLIER STEPS:\nDefine \(skipped\): 5 Whys incomplete; problem: Reports are late\./);
});

test('finished sessions get a closing instruction', () => {
  let s = inTool('five_whys', 'polya');
  for (const _ of [1, 2, 3, 4, 5]) s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.match(buildCoachPrompt(s).user, /PHASE: finished/);
  assert.match(buildCoachPrompt(s).system[1], /The session is finished/);
});

test('a step with no tools says so and never lists or suggests tools', () => {
  const analyse = moveOn(inTool(), deps);
  const { system, user } = buildCoachPrompt(analyse);
  assert.doesNotMatch(system[1], /TOOLS FOR THIS STEP/);
  assert.match(system[1], /Do not suggest a tool/);
  assert.doesNotMatch(user, /No tool is open in this step yet/);
  const learning = buildCoachPrompt(applyCoachTurn(analyse, turn({ verdict: 'clarify' }), deps));
  assert.doesNotMatch(learning.user, /next_tool/);
});

test('awaiting-learning line for a finished session has no orient clause', () => {
  let s = inTool('five_whys', 'polya');
  for (const _ of [1, 2, 3, 4]) s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  s = { ...s, steps: { ...s.steps, document: { ...s.steps.document, runs: [{ id: 'doc', tool: 'five_whys', status: 'active', nodes: [], edges: [] }] } } };
  s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  s = applyCoachTurn(s, turn({ verdict: 'clarify' }), deps);
  const line = buildCoachPrompt(s).user.split('\n').find((l) => l.startsWith('AWAITING LEARNING'));
  assert.ok(line);
  assert.doesNotMatch(line, /orient/);
});

test('slot meanings show tag choices and placed nodes show their tag', async () => {
  const { TOOLS: T } = await import('../../packages/problem-solver/tools/index.mjs');
  T.fake_tagged = { id: 'fake_tagged', name: 'Fake', kind: 'diagnostic', step: 'define', when: 'w', failureModes: ['a', 'b'], steps: [{ id: 's', title: 'S', prompt: 'p' }], edgeKinds: [], slots: { pick: 'A pick' }, nodeTags: { pick: ['up', 'down'] }, nextSlots: () => ['pick'], complete: () => false };
  try {
    let s = inTool('five_whys');
    s = { ...s, steps: { ...s.steps, define: { ...s.steps.define, runs: [{ id: 'f', tool: 'fake_tagged', status: 'active', nodes: [{ id: 'n', slot: 'pick', text: 'Rising', tag: 'up', state: 'accepted', skills: [], turnId: 't' }], edges: [] }] } } };
    const { user } = buildCoachPrompt(s);
    assert.match(user, /pick = A pick \(tag: up\|down\)/);
    assert.match(user, /pick \[up\]: Rising/);
  } finally {
    delete T.fake_tagged;
  }
});
