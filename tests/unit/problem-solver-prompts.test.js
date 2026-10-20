// tests/unit/problem-solver-prompts.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';

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

test('a step with no tools says so and never lists or suggests tools', async () => {
  await withoutAnalyseTools(() => {
    const analyse = moveOn(inTool(), deps);
    const { system, user } = buildCoachPrompt(analyse);
    assert.doesNotMatch(system[1], /TOOLS FOR THIS STEP/);
    assert.match(system[1], /Do not suggest a tool/);
    assert.doesNotMatch(user, /No tool is open in this step yet/);
    const learning = buildCoachPrompt(applyCoachTurn(analyse, turn({ verdict: 'clarify' }), deps));
    assert.equal(learning.system.length > 0, true);
    assert.match(learning.user, /AWAITING LEARNING/);
    assert.doesNotMatch(learning.user, /next_tool/);
  });
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

test('run lines say what a tool is waiting on and never call an unfinished tool complete', () => {
  let s = inTool('force_field');
  for (const [slot, text] of [['current', 'c'], ['goal', 'g'], ['for:1', 'f'], ['against:1', 'a']]) s = applyCoachTurn(s, turn({ node: { slot, text } }), deps);
  const user = buildCoachPrompt(s).user;
  assert.match(user, /Waiting on: The person scores each force 1 to 5/);
  assert.match(user, /Open slots: for:2, against:2/);
  assert.match(RUBRIC, /reply accept with node null and the links in "edges"/);
});

test('open slots none says tool complete only when it is', () => {
  let s = inTool('intent_statement');
  for (const slot of ['problem', 'stakeholders', 'failures', 'approach', 'opportunity']) s = applyCoachTurn(s, turn({ node: { slot, text: 'x' } }), deps);
  s = applyCoachTurn(s, turn({ node: { slot: 'risk', text: 'x' } }), deps);
  assert.match(buildCoachPrompt(s).user, /Open slots: none \(tool complete\)/);
  let t = inTool('causal_map');
  for (const [slot, text] of [['problem', 'p'], ['cause:1', 'a'], ['cause:2', 'b'], ['cause:3', 'c']]) t = applyCoachTurn(t, turn({ node: { slot, text } }), deps);
  assert.doesNotMatch(buildCoachPrompt(t).user, /none \(tool complete\)/);
});

test('the analyse step layer carries its selection guide, tools and challenge triggers', () => {
  const s = moveOn(inTool(), deps);
  const layer = buildCoachPrompt(s).system[1];
  assert.match(layer, /CURRENT STEP: Analyse/);
  assert.match(layer, /`causal_map`/);
  assert.match(layer, /causal_map \(Causal map\)/);
  assert.match(layer, /CHALLENGE IN THIS STEP:/);
  assert.doesNotMatch(layer, /No tools are available/);
});

test('a tool\'s scoreLine shows under its run and in earlier steps', async () => {
  const { TOOLS: T } = await import('../../packages/problem-solver/tools/index.mjs');
  T.fake_scored = { id: 'fake_scored', name: 'Fake scored', kind: 'decision', step: 'define', when: 'w', failureModes: ['a', 'b'], steps: [{ id: 's', title: 'S', prompt: 'p' }], edgeKinds: [], slots: { item: 'An item' }, nextSlots: () => ['item:1'], complete: () => true, scoreLine: () => 'Totals: A 7.2 (leading), B 6.8' };
  try {
    let s = inTool('five_whys');
    s = { ...s, steps: { define: { ...s.steps.define, runs: [{ id: 'f', tool: 'fake_scored', status: 'active', nodes: [{ id: 'n', slot: 'item:1', text: 'Thing', state: 'accepted', skills: [], turnId: 't' }], edges: [] }] } } };
    assert.match(buildCoachPrompt(s).user, /Scores: Totals: A 7\.2 \(leading\), B 6\.8/);
    const moved = moveOn(s, deps);
    assert.match(buildCoachPrompt(moved).user, /EARLIER STEPS:[\s\S]*Totals: A 7\.2/);
  } finally {
    delete T.fake_scored;
  }
});

test('the decide step layer carries its guide, tools, triggers and carry-forward', () => {
  let s = inTool();
  for (let i = 0; i < 3; i += 1) s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  const layer = buildCoachPrompt(s).system[1];
  assert.match(layer, /CURRENT STEP: Decide/);
  assert.match(layer, /decision_matrix \(Decision matrix\)/);
  assert.match(layer, /CHALLENGE IN THIS STEP:/);
  assert.match(layer, /CARRY FORWARD:/);
  assert.match(layer, /choice slot/);
});

test('implement prompts show TODAY, nodes that can become tasks, and the task and review state', () => {
  let s = { ...inTool('five_whys'), updatedAt: '2026-10-19T10:00:00.000Z' };
  s = { ...s, phase: 'implement', steps: { ...s.steps, implement: { runs: [{ id: 'k', tool: 'kanban', status: 'active', nodes: [{ id: 'n1', slot: 'card:1', text: 'Draft the template', tag: 'todo', state: 'accepted', skills: [], turnId: 't' }, { id: 'n2', slot: 'card:2', text: 'Ask the team', tag: 'todo', state: 'accepted', skills: [], turnId: 't' }], edges: [] }], status: 'open', objection: null } } };
  s.steps.implement.runs[0].nodes.push({ id: 'n3', slot: 'card:3', text: 'Old removed task', tag: 'todo', state: 'accepted', skills: [], turnId: 't' });
  s = { ...s, proposedTasks: [{ id: 'p1', title: 'Draft the template', status: 'confirmed', due: null, taskId: 'task-1', source: { runId: 'k', nodeId: 'n1' } }, { id: 'p3', title: 'Old removed task', status: 'dismissed', removed: true, due: null, taskId: 'task-3', source: { runId: 'k', nodeId: 'n3' } }], reviewProposal: null, reviewTaskId: null };
  const { user, system } = buildCoachPrompt(s);
  assert.match(user, /TODAY: 2026-10-19/);
  assert.match(user, /Can become tasks: card:2/);
  assert.doesNotMatch(user, /Can become tasks: card:1/);
  assert.match(user, /TASKS FROM THIS PROBLEM:\n  confirmed: "Draft the template"/);
  assert.match(user, /REVIEW TASK: none yet/);
  assert.match(system[0], /"proposeTasks"/);
  assert.match(system[0], /"proposeReview"/);
  assert.doesNotMatch(user, /TASKS FROM THIS PROBLEM:[\s\S]*Old removed task/, 'the coach is not told about deleted tasks');
  assert.doesNotMatch(user, /Can become tasks:[^\n]*card:3/, 'nor offered them again');
});

test('outside Decide the chosen option is shown as the aim; in Implement without one, the coach asks', () => {
  const base = { ...inTool('five_whys'), updatedAt: '2026-10-19T10:00:00.000Z' };
  const choice = { id: 'd', tool: 'decision_matrix', status: 'done', nodes: [{ id: 'c', slot: 'choice', text: 'Publish the rota on Wednesdays', title: 'Wednesday rota', state: 'accepted', skills: [], turnId: 't' }], edges: [] };
  const implement = { runs: [], status: 'open', objection: null };
  const withChoice = { ...base, phase: 'implement', steps: { ...base.steps, decide: { runs: [choice], status: 'done', objection: null }, implement } };
  assert.match(buildCoachPrompt(withChoice).user, /CHOSEN OPTION \(the aim for Implement\): Publish the rota on Wednesdays/);
  const without = { ...base, phase: 'implement', steps: { ...base.steps, implement } };
  assert.match(buildCoachPrompt(without).user, /CHOSEN OPTION: none recorded/);
});

test('a review the person set aside reads as set aside, not to be proposed again', () => {
  const s = { ...inTool('five_whys'), updatedAt: '2026-10-19T10:00:00.000Z', proposedTasks: [], reviewProposal: { title: 'Review: x', due: '2026-11-02', reason: 'r', status: 'dismissed' }, reviewTaskId: null };
  assert.match(buildCoachPrompt(s).user, /REVIEW TASK: set aside by the person; do not propose again/);
});

test('a tool\'s promptNote reaches the coach under the active run', () => {
  let s = inTool('after_action_review');
  for (const [slot, text] of [['intended', 'Publish the rota a week ahead'], ['achieved', 'Three weeks out of four'], ['differences', 'One sick day stopped the sign-off']]) {
    s = applyCoachTurn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, turn({ node: { slot, text } }), deps);
  }
  assert.match(buildCoachPrompt(s).user, /Note: .*longer than 6 words/);
});

const idleRunner = { status: 'idle', mode: 'turn', error: null };
const improveAt = (extra) => ({ ...inTool(), phase: 'improve', steps: { ...inTool().steps, improve: { runs: [], status: 'open', objection: null } }, runner: idleRunner, ...extra });

test('rubric explains the review, the wait and reopen_step', () => {
  for (const word of ['reopen_step', 'IMPROVE IS WAITING', '"step":"define|analyse"']) assert.ok(RUBRIC.includes(word), word);
});

test('a waiting Improve holds tools and names the review date', () => {
  const s = improveAt({ reviewProposal: { title: 'Review: Late work.', due: '2026-11-02', reason: '', status: 'proposed' }, reviewState: { status: 'waiting', due: '2026-11-02', returnTo: null, startedAt: null } });
  const prompt = buildCoachPrompt(s);
  assert.match(prompt.user, /IMPROVE IS WAITING/);
  assert.match(prompt.user, /2026-11-02/);
  assert.match(prompt.system[1], /CURRENT STEP: Improve/);
  assert.match(prompt.system[1], /after_action_review \(After action review\)/);
  assert.match(prompt.system[1], /CARRY FORWARD:/);
});

test('a review in progress carries the task snapshot', () => {
  const s = improveAt({
    reviewState: { status: 'reviewing', due: '2026-11-02', returnTo: 'document', startedAt: '2026-11-02T09:00:00.000Z' },
    taskSnapshot: { at: '2026-11-02T09:00:00.000Z', byStatus: { open: 1, in_progress: 0, deferred: 0, done: 2, dead: 0, unknown: 0 }, overdue: ['Ask for swaps'] }
  });
  const { user } = buildCoachPrompt(s);
  assert.match(user, /REVIEW IN PROGRESS since 2026-11-02; afterwards the session returns to Document/);
  assert.match(user, /TASK STATUS \(as of 2026-11-02\): 3 tasks: 1 not started, 2 done; overdue: "Ask for swaps"/);
});

test('a reopened step tells the coach why and where Move on returns', () => {
  const s = { ...inTool(), detour: { from: 'improve', to: 'define', reason: 'The sign-off rule was never questioned.', at: 't' } };
  assert.match(buildCoachPrompt(s).user, /REOPENED: Define was reopened from Improve because: The sign-off rule was never questioned\..*returns to Improve/s);
});

test('leaving a waiting Improve is not treated as a skip', () => {
  const base = improveAt({});
  const s = {
    ...base,
    phase: 'document',
    steps: { ...base.steps, improve: { runs: [], status: 'waiting', objection: null }, document: { runs: [], status: 'open', objection: null } },
    runner: { status: 'running', mode: 'boundary', leaving: 'improve', error: null },
    reviewProposal: { title: 'Review: Late work.', due: '2026-11-02', reason: '', status: 'proposed' },
    reviewState: { status: 'waiting', due: '2026-11-02', returnTo: null, startedAt: null }
  };
  const mode = buildCoachPrompt(s).user.split('\n').find((line) => line.startsWith('MODE: boundary'));
  assert.ok(mode, 'has a MODE line');
  assert.match(mode, /waiting for its review/i);
  assert.match(mode, /2026-11-02/);
  assert.doesNotMatch(mode, /skipped/i);
  assert.match(mode, /do not object/i);
});

const documentAt = (runs, extra = {}) => ({ ...inTool(), phase: 'document', steps: { ...inTool().steps, document: { runs, status: 'open', objection: null } }, runner: { status: 'idle', mode: 'turn', error: null }, caseFile: null, caseFileDeclined: null, ...extra });
const doneFiveCs = () => ({ id: 'r5', tool: 'five_cs', status: 'active', edges: [], nodes: [
  ['contextualise', 'So next term starts calmly'], ['categorise', 'On the rota project page'], ['condense:1', 'Publish on Wednesday'],
  ['correct', 'Nothing needs correcting'], ['correspond', 'Kitchen rota case file 20261020 v1 Final']
].map(([slot, text]) => ({ id: slot, slot, text, title: slot, state: 'accepted' })) });

test('rubric explains the case file and the name rules', () => {
  for (const word of ['CASE FILE', 'node.text', 'Document']) assert.ok(RUBRIC.includes(word), word);
});

test('the Document step carries its guide, triggers and carry-forward', () => {
  const { system } = buildCoachPrompt(documentAt([]));
  assert.match(system[1], /CURRENT STEP: Document/);
  assert.match(system[1], /five_cs \(5 Cs documentation\)/);
  assert.match(system[1], /CHALLENGE IN THIS STEP/);
  assert.match(system[1], /CARRY FORWARD:/);
});

test('a case file ready to write is named, and a written one says where and which version', () => {
  assert.match(buildCoachPrompt(documentAt([doneFiveCs()])).user, /CASE FILE: ready to write as "Kitchen rota case file 20261020 v1 Final"/);
  const written = documentAt([doneFiveCs()], { caseFile: { title: 'Kitchen rota case file 20261020 v1 Final', version: 1, target: { kind: 'project', id: 'p' }, writtenAt: '2026-10-20T09:00:00.000Z', sections: {}, history: [] } });
  assert.match(buildCoachPrompt(written).user, /CASE FILE: v1 "Kitchen rota case file 20261020 v1 Final" written 2026-10-20 to the linked project/);
  assert.match(buildCoachPrompt(written).user, /Changed since it was written: /);
});
