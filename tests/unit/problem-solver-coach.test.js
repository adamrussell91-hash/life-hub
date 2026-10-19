// tests/unit/problem-solver-coach.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { anthropicModel, createModelCoach, fitWords, wordCount } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-16T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const reply = (fields) => JSON.stringify({ verdict: 'clarify', message: 'What is the goal here, in one sentence, as an ideal state rather than a fix?', ...fields });

function inDefine() {
  const s = createSession({ text: 'Late work.' }, deps);
  return acceptSuggestion(applyCoachTurn(s, { verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: 'r' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' }, summary: null, exitObjection: null }, deps), deps);
}

test('fitWords trims to the last full sentence and keeps a final question', () => {
  const long = `${'This is a sentence that runs on. '.repeat(12)}What will you check first?`;
  const out = fitWords(long, 60);
  assert.ok(wordCount(out) <= 60);
  assert.ok(out.endsWith('What will you check first?'));
});

test('valid reply passes straight through', async () => {
  const calls = [];
  const coach = createModelCoach(async (prompt) => { calls.push(prompt); return reply({}); });
  const turn = await coach(createSession({ text: 'Late work.' }, deps));
  assert.equal(turn.verdict, 'clarify');
  assert.equal(calls.length, 1);
});

test('illegal slot triggers one repair', async () => {
  const replies = [reply({ verdict: 'accept', node: { slot: 'why:9', text: 'x' } }), reply({})];
  const coach = createModelCoach(async () => replies.shift());
  const turn = await coach(inDefine());
  assert.equal(turn.verdict, 'clarify');
  assert.equal(replies.length, 0);
});

test('two bad replies throw coach_lost_thread', async () => {
  const coach = createModelCoach(async () => 'not json');
  await assert.rejects(coach(createSession({ text: 'Late work.' }, deps)), (err) => err.code === 'coach_lost_thread');
});

test('over-long message is rewritten once, then trimmed', async () => {
  const long = `${'Words keep coming here. '.repeat(20)}Why?`;
  const replies = [reply({ message: long }), long];
  const coach = createModelCoach(async () => replies.shift());
  const turn = await coach(createSession({ text: 'Late work.' }, deps));
  assert.ok(wordCount(turn.message) <= 60);
});

test('in frame, a suggestion without a model is dropped without a repair', async () => {
  const calls = [];
  const coach = createModelCoach(async (prompt) => { calls.push(prompt); return reply({ suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }); });
  const turn = await coach(createSession({ text: 'Late work.' }, deps));
  assert.equal(turn.suggestion, null);
  assert.equal(calls.length, 1);
});

test('in frame, a next_step suggestion is dropped even when the model is set', async () => {
  const model = { id: 'seven_step', reason: 'r' };
  const frame = { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' };
  const coach = createModelCoach(async () => reply({ frame, model, suggestion: { kind: 'next_step', reason: 'r' } }));
  const turn = await coach(createSession({ text: 'Late work.' }, deps));
  assert.equal(turn.suggestion, null);
  assert.deepEqual(turn.model, model);
  const keeps = createModelCoach(async () => reply({ frame, model, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }));
  assert.deepEqual((await keeps(createSession({ text: 'Late work.' }, deps))).suggestion, { kind: 'next_tool', tool: 'five_whys', reason: 'r' });
});

test('scripted coach: asks the goal, fills the frame, then gatekeeps 5 Whys', async () => {
  let s = createSession({ text: 'The rota keeps changing late.' }, deps);
  s = applyCoachTurn(s, await scriptedCoach(s), deps);
  assert.deepEqual(s.frame, {}, 'the opening problem is not an answer');
  for (const answer of ['Rota fixed a week ahead every week', 'It changed late three of the last four weeks']) {
    s = say(s, answer, deps);
    s = applyCoachTurn(s, await scriptedCoach(s), deps);
    assert.equal(s.phase, 'frame');
  }
  s = say(s, 'We can change the day it is published', deps);
  s = applyCoachTurn(s, await scriptedCoach(s), deps);
  assert.equal(s.phase, 'define');
  assert.equal(s.model.id, 'seven_step');
  assert.equal(s.suggestion.tool, 'five_whys');
  s = acceptSuggestion(s, deps);
  const opening = await scriptedCoach(s);
  assert.equal(opening.verdict, 'clarify', 'no stale answer is placed when a tool opens');
  assert.equal(opening.node, null);
  s = say(applyCoachTurn(s, opening, deps), 'too short', deps);
  const challenged = await scriptedCoach(s);
  assert.equal(challenged.verdict, 'challenge');
  assert.equal(challenged.node.slot, 'problem');
});

test('scripted coach: a switch: answer suggests switching to Problem tree', async () => {
  let s = createSession({ text: 'The rota keeps changing late.' }, deps);
  s = applyCoachTurn(s, await scriptedCoach(s), deps);
  for (const text of ['A rota fixed a full week ahead', 'It changed late three of four weeks', 'We can change the day it is published']) {
    s = say(s, text, deps);
    s = applyCoachTurn(s, await scriptedCoach(s), deps);
  }
  s = acceptSuggestion(s, deps);
  s = applyCoachTurn(s, await scriptedCoach(s), deps);
  s = say(s, 'switch: the causes branch in several directions', deps);
  const turn = await scriptedCoach(s);
  assert.equal(turn.node, null);
  assert.deepEqual(turn.suggestion, { kind: 'switch_tool', tool: 'problem_tree', reason: 'the causes branch in several directions' });
  s = acceptSuggestion(applyCoachTurn(s, turn, deps), deps);
  assert.deepEqual(s.steps.define.runs.map((run) => [run.tool, run.status]), [['five_whys', 'switched'], ['problem_tree', 'active']]);
});

test('an edge to an unplaced slot is dropped without a repair call', async () => {
  const replies = [reply({ verdict: 'accept', node: { slot: 'problem', text: 'Rota changes late.' }, edges: [{ from: 'problem', to: 'why:1', kind: 'relates' }] })];
  const coach = createModelCoach(async () => replies.shift());
  const turn = await coach(inDefine());
  assert.equal(replies.length, 0);
  assert.equal(turn.node.slot, 'problem');
  assert.deepEqual(turn.edges, []);
});

function inProblemTree() {
  const accept = (node, edges = []) => ({ verdict: 'accept', message: 'ok', node, edges, skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null });
  let s = createSession({ text: 'Inconsistent eating and training.' }, deps);
  s = acceptSuggestion(applyCoachTurn(s, { ...accept(null), frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: 'r' }, suggestion: { kind: 'next_tool', tool: 'problem_tree', reason: 'r' } }, deps), deps);
  s = applyCoachTurn(s, accept({ slot: 'trunk', text: 'Inconsistent eating and training.' }), deps);
  return applyCoachTurn(s, accept({ slot: 'cause:1', text: 'Delayed payoff boredom.' }), deps);
}

test('problem tree: an effect linked to the trunk keeps the effect and drops the link', async () => {
  const calls = [];
  const coach = createModelCoach(async (prompt) => {
    calls.push(prompt);
    return reply({ verdict: 'accept', message: 'That loop is real: no progress feeds the boredom. What else does it cost you?', node: { slot: 'effect:1', text: 'No visible progress, which demotivates.' }, edges: [{ from: 'effect:1', to: 'trunk', kind: 'relates' }, { from: 'effect:1', to: 'cause:1', kind: 'feeds' }, { from: 'effect:1', to: 'cause:1', kind: 'relates' }] });
  });
  const turn = await coach(inProblemTree());
  assert.equal(calls.length, 1);
  assert.equal(turn.node.slot, 'effect:1');
  assert.deepEqual(turn.edges, [{ from: 'effect:1', to: 'cause:1', kind: 'relates' }]);
});

test('problem tree: a bare slot name takes the next open index', async () => {
  const coach = createModelCoach(async () => reply({ verdict: 'accept', node: { slot: 'effect', text: 'No visible progress.' }, edges: [{ from: 'effect', to: 'cause:1', kind: 'relates' }] }));
  const turn = await coach(inProblemTree());
  assert.equal(turn.node.slot, 'effect:1');
  assert.deepEqual(turn.edges, [{ from: 'effect:1', to: 'cause:1', kind: 'relates' }]);
});

test('problem tree: a links-only accept keeps just the links the tool allows', async () => {
  const coach = createModelCoach(async () => reply({ verdict: 'accept', node: null, edges: [{ from: 'effect:1', to: 'trunk', kind: 'relates' }, { from: 'effect:1', to: 'cause:9', kind: 'relates' }, { from: 'effect:1', to: 'cause:1', kind: 'relates' }] }));
  let s = inProblemTree();
  s = applyCoachTurn(s, { verdict: 'accept', message: 'ok', node: { slot: 'effect:1', text: 'e' }, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null }, deps);
  const turn = await coach(s);
  assert.equal(turn.node, null);
  assert.deepEqual(turn.edges, [{ from: 'effect:1', to: 'cause:1', kind: 'relates' }]);
});

test('applyCoachTurn drops an edge that cannot be added', () => {
  const s = applyCoachTurn(inDefine(), { verdict: 'accept', message: 'ok', node: { slot: 'problem', text: 'x' }, edges: [{ from: 'problem', to: 'why:1', kind: 'relates' }], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null }, deps);
  assert.equal(s.steps.define.runs[0].nodes.length, 1);
  assert.equal(s.steps.define.runs[0].edges.length, 0);
});

test('anthropicModel sends each system layer as its own cached block', async () => {
  let body;
  const fetchImpl = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await anthropicModel({ ANTHROPIC_API_KEY: 'k' }, fetchImpl)({ system: ['fixed', 'step'], user: 'u', maxTokens: 10 });
  assert.deepEqual(body.system, [
    { type: 'text', text: 'fixed', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'step', cache_control: { type: 'ephemeral' } }
  ]);
});

test('a tool suggestion that is not available in the step triggers one repair', async () => {
  const analyse = moveOn(inDefine(), deps);
  let calls = 0;
  const coach = createModelCoach(async () => {
    calls += 1;
    return calls === 1 ? reply({ suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }) : reply({});
  });
  const turn = await coach({ ...analyse, runner: { status: 'queued', mode: 'turn', error: null } });
  assert.equal(calls, 2);
  assert.equal(turn.suggestion, null);
});

test('boundary mode drops an unavailable tool suggestion without a repair call', async () => {
  const boundary = moveOn(inDefine(), deps);
  let calls = 0;
  const coach = createModelCoach(async () => {
    calls += 1;
    return reply({ suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } });
  });
  const turn = await coach(boundary);
  assert.equal(calls, 1);
  assert.equal(turn.suggestion, null);
});

test('a missing tag on a tagged slot triggers one repair that names the choices', async () => {
  TOOLS.fake_tagged = { id: 'fake_tagged', name: 'Fake', kind: 'diagnostic', step: 'define', when: 'w', failureModes: ['a', 'b'], steps: [{ id: 's', title: 'S', prompt: 'p' }], edgeKinds: [], slots: { pick: 'A pick' }, nodeTags: { pick: ['up', 'down'] }, nextSlots: () => ['pick'], complete: () => false };
  try {
    const base = inDefine();
    const session = { ...base, steps: { ...base.steps, define: { ...base.steps.define, runs: [{ id: 'f', tool: 'fake_tagged', status: 'active', nodes: [], edges: [] }] } } };
    const replies = [reply({ verdict: 'accept', node: { slot: 'pick', text: 'Rising' } }), reply({ verdict: 'accept', node: { slot: 'pick', text: 'Rising', tag: 'up' } })];
    const prompts = [];
    const coach = createModelCoach(async (prompt) => { prompts.push(prompt); return replies.shift(); });
    const turn = await coach(session);
    assert.equal(turn.node.tag, 'up');
    assert.equal(prompts.length, 2);
    assert.match(prompts[1].user, /pick needs a tag: one of up, down/);
  } finally {
    delete TOOLS.fake_tagged;
  }
});

test('a challenge on a tagged slot without a tag also gets one repair', async () => {
  TOOLS.fake_tagged = { id: 'fake_tagged', name: 'Fake', kind: 'diagnostic', step: 'define', when: 'w', failureModes: ['a', 'b'], steps: [{ id: 's', title: 'S', prompt: 'p' }], edgeKinds: [], slots: { pick: 'A pick' }, nodeTags: { pick: ['up', 'down'] }, nextSlots: () => ['pick'], complete: () => false };
  try {
    const base = inDefine();
    const session = { ...base, steps: { ...base.steps, define: { ...base.steps.define, runs: [{ id: 'f', tool: 'fake_tagged', status: 'active', nodes: [], edges: [] }] } } };
    const replies = [reply({ verdict: 'challenge', node: { slot: 'pick', text: 'Rising' } }), reply({ verdict: 'challenge', node: { slot: 'pick', text: 'Rising', tag: 'down' } })];
    const prompts = [];
    const coach = createModelCoach(async (prompt) => { prompts.push(prompt); return replies.shift(); });
    const turn = await coach(session);
    assert.equal(turn.node.tag, 'down');
    assert.equal(prompts.length, 2);
    assert.match(prompts[1].user, /pick needs a tag: one of up, down/);
  } finally {
    delete TOOLS.fake_tagged;
  }
});

function inKanban() {
  const base = inDefine();
  return { ...base, phase: 'implement', runner: { status: 'queued', mode: 'turn', error: null }, steps: { ...base.steps, implement: { runs: [{ id: 'k', tool: 'kanban', status: 'active', nodes: [], edges: [] }], status: 'open', objection: null } } };
}

test('a proposed task on a bare slot name follows the node to its numbered slot', async () => {
  const coach = createModelCoach(async () => reply({ verdict: 'accept', message: 'That card is specific enough to start. Shall I make it a real task due Friday?', node: { slot: 'card', text: 'Draft the rota template for next month', tag: 'todo' }, proposeTasks: [{ slot: 'card', title: 'Draft' }] }));
  const turn = await coach(inKanban());
  assert.equal(turn.node.slot, 'card:1');
  assert.equal(turn.proposeTasks[0].slot, 'card:1');
});

test('boundary turns carry no task or review proposals', async () => {
  const boundary = moveOn(inKanban(), deps);
  const coach = createModelCoach(async () => reply({ proposeTasks: [{ slot: 'card:1', title: 'Draft' }], proposeReview: { due: '2026-11-02', reason: 'r' } }));
  const turn = await coach(boundary);
  assert.deepEqual(turn.proposeTasks, []);
  assert.equal(turn.proposeReview, null);
});
