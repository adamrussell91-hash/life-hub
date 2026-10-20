// tests/unit/problem-solver-scripted.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, moveOn, say, score } from '../../netlify/functions/_shared/problem-solver/session.mjs';

import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { addEdge, checkNode, isComplete, newRun, placeNode } from '../../packages/problem-solver/machine.mjs';
import { matrixTotals, options } from '../../packages/problem-solver/tools/decision-matrix.mjs';

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
  // The last step was left untouched, so there is nothing to have learned from it.
  assert.match(s.turns.at(-1).text, /on the record now/);
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

/** A seven-step session in `phase` with `run` active and `text` as the latest answer. */
function inStep(phase, run, text, steps = {}) {
  return { phase, model: { id: 'seven_step' }, title: 'Late rota', runner: { status: 'idle', mode: 'turn', error: null }, turns: [{ role: 'user', text }], proposedTasks: [], steps: { ...steps, [phase]: { runs: [run], status: 'open', objection: null } } };
}

test('a slot hint places in the named open slot with the prefix stripped', async () => {
  const run = build('decision_matrix', []);
  let turn = await scriptedCoach(inStep('decide', run, 'option: Publish the rota every Wednesday morning'));
  assert.equal(turn.verdict, 'accept');
  assert.equal(turn.node.slot, 'option:1');
  assert.equal(turn.node.text, 'Publish the rota every Wednesday morning');
  turn = await scriptedCoach(inStep('decide', run, 'criterion: Staff can plan their week ahead'));
  assert.equal(turn.node.slot, 'criterion:1');
  assert.equal(turn.node.text, 'Staff can plan their week ahead');
});

test('the six-word challenge counts the words after a hint', async () => {
  const turn = await scriptedCoach(inStep('decide', build('decision_matrix', []), 'option: Wednesday rota'));
  assert.equal(turn.verdict, 'challenge');
  assert.equal(turn.node.text, 'Wednesday rota');
});

test('a SWOT quadrant item links to the latest option', async () => {
  const run = build('swot', [['goal', 'g'], ['option:1', 'o1']]);
  const turn = await scriptedCoach(inStep('decide', run, 'strength: The team already uses a shared calendar'));
  assert.equal(turn.node.slot, 'strength:1');
  assert.deepEqual(turn.edges, [{ from: 'strength:1', to: 'option:1', kind: 'of' }]);
  assert.equal(checkNode(run, turn.node, turn.edges), null);
});

test('morphological links: attribute to the thinnest subject, contradiction pairs, scenario picks', async () => {
  let run = build('morphological', [['problem', 'p'], ['subject:1', 's1'], ['subject:2', 's2'], ['subject:3', 's3'], ['attribute:1', 'a1']], [['attribute:1', 'subject:1', 'of']]);
  let turn = await scriptedCoach(inStep('decide', run, 'attribute: Published on paper in the staff room'));
  assert.deepEqual(turn.edges, [{ from: 'attribute:2', to: 'subject:2', kind: 'of' }]);
  assert.equal(checkNode(run, turn.node, turn.edges), null);

  const attrs = [['attribute:1', 's1a'], ['attribute:2', 's2a'], ['attribute:3', 's3a'], ['attribute:4', 's1b'], ['attribute:5', 's2b'], ['attribute:6', 's3b']];
  const of = [['attribute:1', 'subject:1', 'of'], ['attribute:2', 'subject:2', 'of'], ['attribute:3', 'subject:3', 'of'], ['attribute:4', 'subject:1', 'of'], ['attribute:5', 'subject:2', 'of'], ['attribute:6', 'subject:3', 'of']];
  run = build('morphological', [['problem', 'p'], ['subject:1', 's1'], ['subject:2', 's2'], ['subject:3', 's3'], ...attrs], of);
  turn = await scriptedCoach(inStep('decide', run, 'contradiction: Paper rotas cannot carry live swap requests'));
  assert.equal(turn.node.slot, 'contradiction:1');
  assert.deepEqual(turn.edges, [{ from: 'contradiction:1', to: 'attribute:1', kind: 'pair' }, { from: 'contradiction:1', to: 'attribute:2', kind: 'pair' }]);
  assert.equal(checkNode(run, turn.node, turn.edges), null);

  run = placeNode(run, { id: 'contradiction:1', slot: 'contradiction:1', text: 'c', state: 'accepted' });
  run = addEdge(addEdge(run, { from: 'contradiction:1', to: 'attribute:1', kind: 'pair' }), { from: 'contradiction:1', to: 'attribute:2', kind: 'pair' });
  turn = await scriptedCoach(inStep('decide', run, 'scenario: A shared app with weekly sign off'));
  assert.equal(turn.node.slot, 'scenario:1');
  assert.deepEqual(turn.edges, [{ from: 'scenario:1', to: 'attribute:4', kind: 'picks' }, { from: 'scenario:1', to: 'attribute:5', kind: 'picks' }, { from: 'scenario:1', to: 'attribute:3', kind: 'picks' }]);
  assert.equal(checkNode(run, turn.node, turn.edges), null);
});

test('a 15% chosen note picks the first unpicked action and is proposed as a task', async () => {
  const run = build('fifteen_percent', [['reflect', 'r'], ['action:1', 'a1'], ['action:2', 'a2'], ['chosen:1', 'c1']], [['chosen:1', 'action:1', 'picks']]);
  const turn = await scriptedCoach(inStep('implement', run, 'chosen: Put the draft rota on the noticeboard today'));
  assert.equal(turn.node.slot, 'chosen:2');
  assert.deepEqual(turn.edges, [{ from: 'chosen:2', to: 'action:2', kind: 'picks' }]);
  assert.equal(checkNode(run, turn.node, turn.edges), null);
  assert.equal(turn.proposeTasks.length, 1);
});

test('a kanban card is placed in To do and proposed as a task', async () => {
  const text = 'Draft the new Wednesday rota template for the whole team';
  const turn = await scriptedCoach(inStep('implement', build('kanban', []), text));
  assert.equal(turn.node.slot, 'card:1');
  assert.equal(turn.node.tag, 'todo');
  assert.deepEqual(turn.proposeTasks, [{ slot: 'card:1', title: 'Draft the new Wednesday rota template for the', due: null }]);
});

test('a column hint tags the card; a done card proposes nothing', async () => {
  const run = build('kanban', [['card:1', 'c1', 'todo']]);
  let turn = await scriptedCoach(inStep('implement', run, 'doing: Tell the team about the Wednesday change'));
  assert.equal(turn.node.slot, 'card:2');
  assert.equal(turn.node.tag, 'doing');
  assert.equal(turn.node.text, 'Tell the team about the Wednesday change');
  assert.equal(turn.proposeTasks.length, 1);
  turn = await scriptedCoach(inStep('implement', run, 'done: Old Friday rota process retired last month'));
  assert.equal(turn.node.tag, 'done');
  assert.deepEqual(turn.proposeTasks, []);
});

const scoredMatrix = () => {
  const run = build('decision_matrix', [['criterion:1', 'Staff can plan ahead'], ['criterion:2', 'Fewer swaps for the manager'], ['option:1', 'Publish the rota every Wednesday morning'], ['option:2', 'Let staff swap shifts in a shared app']]);
  const s = score(inStep('decide', run, ''), { mode: 'percent', weights: [60, 40], ratings: [[8, 5], [6, 9]] }, deps);
  return s.steps.decide.runs[0];
};

test('after scoring, a plain answer places the choice and names the leading option', async () => {
  const run = scoredMatrix();
  const { leader } = matrixTotals(run);
  const leading = options(run)[leader].text;
  for (const text of ['I will go with the one that scored best overall', 'choice: Publish the rota every Wednesday morning']) {
    const turn = await scriptedCoach(inStep('decide', run, text));
    assert.equal(turn.verdict, 'accept');
    assert.equal(turn.node.slot, 'choice');
    assert.equal(isComplete(placeNode(run, { id: 'x', ...turn.node, state: 'accepted' })), true);
    assert.ok(turn.message.includes(`The scores lead with ${leading}`), turn.message);
    assert.match(turn.message, /carrying your choice into Implement/);
  }
});

test('an Implement tool opens by carrying the chosen option forward', async () => {
  const decided = placeNode(scoredMatrix(), { id: 'ch', slot: 'choice', text: 'Let staff swap shifts in a shared app', state: 'accepted' });
  const session = inStep('implement', build('kanban', []), '', { decide: { runs: [{ ...decided, status: 'done' }], status: 'done', objection: null } });
  session.turns = [{ role: 'coach', text: 'Start it.' }];
  const turn = await scriptedCoach(session);
  assert.match(turn.message, /^We are carrying forward: Let staff swap shifts in a shared app\./);
});

// Improve: the wait, the review opening, the three tools' hints.

/** A seven-step session moved on to Implement, with a kanban run there and a live review. */
async function intoImplementDone() {
  let s = await intoDefine();
  for (const _ of [1, 2, 3, 4]) s = await step(moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps));
  assert.equal(s.phase, 'implement');
  const kanban = { ...build('kanban', [['card:1', 'Draft the Wednesday rota', 'done']]), status: 'active' };
  s = { ...s, steps: { ...s.steps, implement: { ...s.steps.implement, runs: [kanban] } } };
  s = { ...s, runner: { status: 'idle', mode: 'turn', error: null }, reviewProposal: { title: 'Review: Late rota', due: '2026-11-02', reason: 'r', status: 'proposed' } };
  return s;
}

test('leaving Implement with a review in place: the learning turn says when Improve picks up, with no suggestion', async () => {
  let s = await step(moveOn(await intoImplementDone(), deps));
  assert.equal(s.phase, 'improve');
  assert.equal(s.reviewState.status, 'waiting');
  assert.match(s.turns.at(-1).text, /learn/);
  s = await step(say(s, 'I hurry the last step when the end is in sight.', deps));
  assert.equal(s.learnings.at(-1).text, 'I hurry the last step when the end is in sight.');
  assert.equal(s.suggestion, null);
  const said = new Date('2026-11-02T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  assert.match(said, /2 Nov/);
  assert.ok(s.turns.at(-1).text.includes(`Improve picks up at your review on ${said}.`), s.turns.at(-1).text);
});

const improveSession = (run, text, extra = {}) => ({ ...inStep('improve', run, text), reviewState: { status: 'reviewing', due: '2026-11-02', returnTo: null, startedAt: 'x' }, ...extra });

test('a reviewing Improve with no tool open suggests the after action review', async () => {
  const s = { ...improveSession(null, 'Let\'s review how it went.'), steps: { improve: { runs: [], status: 'open', objection: null } } };
  const turn = await scriptedCoach(s);
  assert.deepEqual([turn.suggestion?.kind, turn.suggestion?.tool], ['next_tool', 'after_action_review']);
});

test('the after action review opens on how it went, with the task counts when there is a snapshot', async () => {
  const s = improveSession(build('after_action_review', []), '');
  s.turns = [{ role: 'coach', text: 'Start it.' }];
  let turn = await scriptedCoach(s);
  assert.match(turn.message, /^Let's look at how it went\./);
  assert.doesNotMatch(turn.message, /tasks are done/);
  s.taskSnapshot = { at: 'x', byStatus: { open: 1, in_progress: 1, deferred: 0, done: 2, dead: 0, unknown: 0 }, overdue: [] };
  turn = await scriptedCoach(s);
  assert.match(turn.message, /^Let's look at how it went\. 2 of 4 tasks are done\./);
});

test('after action review answers place in order; a short learned is challenged, a longer one accepted', async () => {
  let run = build('after_action_review', []);
  const answers = ['Publish the rota a week ahead every single time', 'It went out on time in three weeks of four', 'The manager was away and nobody else could sign it off'];
  for (const [i, text] of answers.entries()) {
    const turn = await scriptedCoach(improveSession(run, text));
    assert.equal(turn.verdict, 'accept');
    assert.equal(turn.node.slot, ['intended', 'achieved', 'differences'][i]);
    run = placeNode(run, { id: turn.node.slot, ...turn.node, state: 'accepted' });
  }
  let turn = await scriptedCoach(improveSession(run, 'Name a deputy who can sign off'));
  assert.equal(turn.verdict, 'challenge');
  assert.equal(turn.node.slot, 'learned');
  assert.match(turn.message, /more/i);
  turn = await scriptedCoach(improveSession(run, 'A single point of sign off is fragile, so name a deputy and write the steps down for them'));
  assert.equal(turn.verdict, 'accept');
  assert.equal(turn.node.slot, 'learned');
});

test('double loop: recurs is tagged yes or no from the answer', async () => {
  const run = build('double_loop', [['problem', 'p'], ['single', 's']]);
  for (const [text, tag] of [
    ['yes, it came back again in week four', 'yes'],
    ['It came back the following month after we fixed it', 'yes'],
    ['The late rota did recur over the summer', 'yes'],
    ['The rota stayed on time every week since then', 'no']
  ]) {
    const turn = await scriptedCoach(improveSession(run, text));
    assert.equal(turn.node.slot, 'recurs');
    assert.equal(turn.node.tag, tag, text);
  }
});

test('reopen: define in a double loop with a governing node suggests reopening Define', async () => {
  const run = build('double_loop', [['problem', 'p'], ['single', 's'], ['recurs', 'r', 'yes'], ['governing:1', 'g']]);
  const s = improveSession(run, 'reopen: define');
  s.steps.define = { runs: [], status: 'done', objection: null };
  const turn = await scriptedCoach(s);
  assert.equal(turn.verdict, 'clarify');
  assert.equal(turn.node, null);
  assert.equal(turn.suggestion.kind, 'reopen_step');
  assert.equal(turn.suggestion.step, 'define');
  assert.equal(typeof turn.suggestion.reason, 'string');
  assert.ok(turn.suggestion.reason.length > 10);
  // Without a governing node there is nothing to reopen for.
  const early = improveSession(build('double_loop', [['problem', 'p']]), 'reopen: define');
  early.steps.define = { runs: [], status: 'done', objection: null };
  const refused = await scriptedCoach(early);
  assert.equal(refused.suggestion, null);
  assert.equal(refused.node, null);
});

test('next: <tool> suggests that tool when it belongs to the step', async () => {
  const run = build('after_action_review', [['intended', 'i'], ['achieved', 'a'], ['differences', 'd'], ['learned', 'l']]);
  let turn = await scriptedCoach(improveSession(run, 'next: double_loop'));
  assert.deepEqual([turn.verdict, turn.suggestion?.kind, turn.suggestion?.tool], ['clarify', 'next_tool', 'double_loop']);
  assert.equal(turn.node, null);
  turn = await scriptedCoach(improveSession(run, 'next: kanban'));
  assert.equal(turn.suggestion, null);
});

test('feedback matrix: themes are tagged from their wording; why and how link to the latest theme', async () => {
  const items = [['suggestion:1', 's'], ['compliment:1', 'c'], ['change:1', 'ch']];
  let run = build('feedback_matrix', items);
  for (const [text, tag] of [
    ['theme: Keep publishing the rota on Wednesday mornings', 'do_more'],
    ['theme: Do more of the early swaps through the app', 'do_more'],
    ['theme: Who signs off when the manager is away?', 'question'],
    ['theme: It is unclear who owns the holiday calendar', 'question'],
    ['theme: Stop texting swaps outside the shared app', 'change']
  ]) {
    const turn = await scriptedCoach(improveSession(run, text));
    assert.equal(turn.node.slot, 'theme:1');
    assert.equal(turn.node.tag, tag, text);
  }
  run = build('feedback_matrix', [...items, ['theme:1', 't1', 'change'], ['theme:2', 't2', 'do_more']]);
  for (const name of ['why', 'how']) {
    const turn = await scriptedCoach(improveSession(run, `${name}: Swaps by text never reach the rota at all`));
    assert.equal(turn.node.slot, `${name}:1`);
    assert.deepEqual(turn.edges, [{ from: `${name}:1`, to: 'theme:2', kind: 'of' }]);
    assert.equal(checkNode(run, turn.node, turn.edges), null);
  }
});

test('a boundary turn leaving a step with nothing done asks no learning question', async () => {
  let s = await step(moveOn(await intoImplementDone(), deps));
  s = await step(say(s, 'I hurry the last step when the end is in sight.', deps));
  assert.equal(s.steps.improve.status, 'open');
  s = await step(moveOn(s, deps));
  assert.equal(s.phase, 'document');
  assert.equal(s.steps.improve.status, 'waiting');
  assert.equal(s.pendingLearning, null);
  assert.doesNotMatch(s.turns.at(-1).text, /learn/);
});
