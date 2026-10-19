// tests/unit/problem-solver-scripted.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { addEdge, checkNode, newRun, placeNode } from '../../packages/problem-solver/machine.mjs';

/** Run `fn` with the Analyse tools moved to a step that does not exist, so Analyse offers no tool. */
async function withoutAnalyseTools(fn) {
  const saved = Object.entries(TOOLS).filter(([, def]) => def.step === 'analyse');
  try {
    for (const [id, def] of saved) TOOLS[id] = { ...def, step: '__none__' };
    return await fn();
  } finally {
    for (const [id, def] of saved) TOOLS[id] = def;
  }
}

let n = 0;
const deps = { now: () => '2026-10-19T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const step = async (s) => applyCoachTurn(s, await scriptedCoach(s), deps);

async function intoDefine() {
  let s = await step(createSession({ text: 'Late rota.' }, deps));
  for (const text of ['Rota fixed a week ahead.', 'Changed three weeks out of four, by the logs.', 'Move the publish day earlier.']) s = await step(say(s, text, deps));
  return acceptSuggestion(s, deps);
}

test('boundary asks what was learned, then records it', async () => {
  await withoutAnalyseTools(async () => {
  let s = await step(moveOn(await intoDefine(), deps));
  assert.equal(s.pendingLearning, 'define');
  assert.match(s.turns.at(-1).text, /learn/);
  s = await step(say(s, 'I blame people when I am tired.', deps));
  assert.deepEqual(s.learnings.map((l) => l.step), ['define']);
  assert.match(s.turns.at(-1).text, /no tool for this step yet/);
  assert.equal(s.suggestion, null);
  });
});

test('when the next step has a tool, the learning turn suggests it', async () => {
  let s = createSession({ text: 'Late rota.' }, deps);
  s = applyCoachTurn(s, { ...(await scriptedCoach(s)), verdict: 'accept', frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'triz', reason: 'r' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }, deps);
  s = await step(moveOn(acceptSuggestion(s, deps), deps));
  s = await step(say(s, 'I rush.', deps));
  assert.equal(s.suggestion?.tool, 'contradiction');
});

test('finished sessions get a closing line', async () => {
  let s = await intoDefine();
  for (const _ of [1, 2, 3, 4, 5, 6, 7]) s = await step(moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps));
  assert.equal(s.phase, 'finished');
  assert.match(s.turns.at(-1).text, /learn/);
});

test('in Analyse the scripted coach opens with a causal map, places causes and adds a link', async () => {
  let s = await step(moveOn(await intoDefine(), deps));
  s = await step(say(s, 'I blame people when I am tired.', deps));
  assert.equal(s.phase, 'analyse');
  assert.equal(s.suggestion?.tool, 'causal_map');
  s = await step(acceptSuggestion(s, deps));
  for (const text of [
    'The rota is published too late every week.',
    'Shift swaps are agreed by text and never logged.',
    'The manager signs off the rota only on Fridays.',
    'Holiday requests arrive after the rota is drafted.'
  ]) s = await step(say(s, text, deps));
  const run = s.steps.analyse.runs.at(-1);
  assert.deepEqual(run.nodes.map((node) => node.slot), ['problem', 'cause:1', 'cause:2', 'cause:3']);
  s = await step(say(s, 'link: cause 1 to problem, plus', deps));
  const linked = s.steps.analyse.runs.at(-1);
  assert.equal(linked.edges.length, 1);
  const slotOf = (id) => linked.nodes.find((node) => node.id === id).slot;
  assert.deepEqual([slotOf(linked.edges[0].from), slotOf(linked.edges[0].to), linked.edges[0].kind], ['cause:1', 'problem', 'plus']);
});

test('a link the tool does not allow gets a clarify turn and no edge', async () => {
  const s = devise(build('causal_map', [['problem', 'p'], ['cause:1', 'c']]), 'link: problem to cause 1, plus');
  const turn = await scriptedCoach(s);
  assert.equal(turn.verdict, 'clarify');
  assert.deepEqual(turn.edges, []);
});

/** A run of `tool` with `nodes` placed in order and `edges` (slot form) added. */
function build(tool, nodes, edges = []) {
  let run = newRun(tool, 'r1');
  for (const [slot, text, tag] of nodes) run = placeNode(run, { id: slot, slot, text, ...(tag ? { tag } : {}), state: 'accepted' });
  for (const [from, to, kind] of edges) run = addEdge(run, { from, to, kind });
  return run;
}

/** A session in a Devise step with `run` active and `text` as the latest answer. */
function devise(run, text) {
  return { phase: 'devise', model: { id: 'seven_step' }, runner: { status: 'idle', mode: 'turn', error: null }, turns: [{ role: 'user', text }], steps: { devise: { runs: [run] } } };
}

const LONG = 'Ask the team which day suits them best.';

test('a tagged slot takes a tag the tool accepts, opposite when the last pathway needs it', async () => {
  let run = build('duncker', [['problem', 'p'], ['desired', 'd']]);
  let turn = await scriptedCoach(devise(run, LONG));
  assert.equal(turn.node.slot, 'pathway:1');
  assert.equal(turn.node.tag, 'direct');
  run = build('duncker', [['problem', 'p'], ['desired', 'd'], ['pathway:1', 'a', 'direct'], ['pathway:2', 'b', 'direct'], ['pathway:3', 'c', 'direct'], ['solution:1', 's']], [['solution:1', 'pathway:1', 'under']]);
  turn = await scriptedCoach(devise(run, LONG));
  assert.equal(turn.node.slot, 'pathway:4');
  assert.equal(turn.node.tag, 'opposite');
  assert.equal(checkNode(run, turn.node, turn.edges), null);
});

test('a duncker solution goes under the most recent pathway', async () => {
  const run = build('duncker', [['problem', 'p'], ['desired', 'd'], ['pathway:1', 'a', 'direct'], ['pathway:2', 'b', 'opposite'], ['pathway:3', 'c', 'direct'], ['pathway:4', 'e', 'direct']]);
  const turn = await scriptedCoach(devise(run, LONG));
  assert.equal(turn.node.slot, 'solution:1');
  assert.deepEqual(turn.edges, [{ from: 'solution:1', to: 'pathway:4', kind: 'under' }]);
  assert.equal(checkNode(run, turn.node, turn.edges), null);
});

test('a lotus idea links to the first solution with room', async () => {
  const solutions = Array.from({ length: 8 }, (_, i) => [`solution:${i + 1}`, `s${i + 1}`]);
  const ideas = Array.from({ length: 8 }, (_, i) => [`idea:${i + 1}`, `i${i + 1}`]);
  const run = build('lotus_blossom', [['problem', 'p'], ...solutions, ...ideas], ideas.map(([slot]) => [slot, 'solution:1', 'petal']));
  const turn = await scriptedCoach(devise(run, LONG));
  assert.equal(turn.node.slot, 'idea:9');
  assert.deepEqual(turn.edges, [{ from: 'idea:9', to: 'solution:2', kind: 'petal' }]);
  assert.equal(checkNode(run, turn.node, turn.edges), null);
});

test('a lotus preferred note marks the most recent idea', async () => {
  const solutions = Array.from({ length: 8 }, (_, i) => [`solution:${i + 1}`, `s${i + 1}`]);
  const ideas = Array.from({ length: 64 }, (_, i) => [`idea:${i + 1}`, `i${i + 1}`]);
  const run = build('lotus_blossom', [['problem', 'p'], ...solutions, ...ideas], ideas.map(([slot], i) => [slot, `solution:${Math.floor(i / 8) + 1}`, 'petal']));
  const turn = await scriptedCoach(devise(run, LONG));
  assert.equal(turn.node.slot, 'preferred:1');
  assert.deepEqual(turn.edges, [{ from: 'preferred:1', to: 'idea:64', kind: 'marks' }]);
  assert.equal(checkNode(run, turn.node, turn.edges), null);
});

test('a problem reduction priority lists the sub-problems as 1, 2, …', async () => {
  const subs = Array.from({ length: 6 }, (_, i) => [`sub:${i + 1}`, `part ${i + 1}`]);
  const run = build('problem_reduction', [['problem', 'p'], ...subs]);
  const turn = await scriptedCoach(devise(run, LONG));
  assert.equal(turn.node.slot, 'priority');
  assert.equal(turn.node.text, '1, 2, 3, 4, 5, 6');
  assert.equal(checkNode(run, turn.node, turn.edges), null);
});
