// tests/unit/thinking-briefs.test.js
// Brief -> frame for each engine tool, Thought Starter's chapter and questions, a protocol's
// intake, and result -> packet for every tool. Invented records only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  digestText, ENGINE_TOOLS, frameFromBrief, intakeFromBrief, KIND_TOOL, QUESTION_CHAPTER_IDS, questionsFromBrief, TOOL_KIND
} from '../../netlify/functions/_shared/thinking-threads/briefs.mjs';
import { PACKET_TOOLS, packetFrom } from '../../netlify/functions/_shared/thinking-threads/adapters.mjs';
import { catalog } from '../../config/knowledge/cognitive/definitions.mjs';

const BRIEF = {
  threadId: 't1',
  situation: 'The community garden has two plots and three groups want them.',
  question: 'Which group should get the second plot?',
  digest: { facts: ['Two plots', 'Three groups'], choices: ['Share by season', 'Draw lots'], restsOn: ['Everyone wants fairness'], openQuestions: ['Will the council add a plot?'] },
  from: { sessionId: 'home-1', stepId: 'options', stepTitle: 'Options', workSoFar: 'Listed four ways to share.' }
};

const FRAME_KEYS = {
  'problem-solver': ['goal', 'whatIsTrue', 'whatCanBeDone'],
  'decision-book': ['decision', 'compass', 'known'],
  'get-things-done': ['need', 'route', 'known'],
  'rules-book': ['situation', 'group', 'known'],
  'change-book': ['change', 'group', 'stay'],
  'collaboration-book': ['situation', 'group', 'outcome'],
  'communication-book': ['situation', 'group', 'outcome']
};

test('frameFromBrief drafts each engine tool’s frame; placement keys are left for the coach', () => {
  assert.deepEqual([...ENGINE_TOOLS].sort(), Object.keys(FRAME_KEYS).sort());
  for (const tool of ENGINE_TOOLS) {
    const f = frameFromBrief(tool, BRIEF);
    assert.equal(f.kind, TOOL_KIND[tool]);
    assert.equal(KIND_TOOL[f.kind], tool);
    assert.deepEqual(Object.keys(f.frame), FRAME_KEYS[tool], tool);
    for (const key of ['compass', 'route', 'group']) if (key in f.frame) assert.equal(f.frame[key], '', `${tool} ${key}`);
    assert.equal(f.title, 'Which group should get the second plot?');
    assert.match(f.text, /The question for this detour/);
    assert.match(f.text, /"Options"/);
  }
  assert.equal(frameFromBrief('problem-solver', BRIEF).frame.goal, 'Answer: Which group should get the second plot?');
  assert.equal(frameFromBrief('problem-solver', BRIEF).frame.whatCanBeDone, 'Share by season; Draw lots');
  assert.equal(frameFromBrief('change-book', BRIEF).frame.stay, 'Everyone wants fairness');
  assert.match(frameFromBrief('rules-book', BRIEF).frame.known, /Two plots; Three groups; Everyone wants fairness; Listed four ways/);
  assert.throws(() => frameFromBrief('question-book', BRIEF), { status: 400 });
  assert.equal(frameFromBrief('rules-book', { situation: '' }).text, 'A detour from another tool.');
});

test('questionsFromBrief keeps a chapter option, else picks one; up to three questions by overlap, in order', () => {
  const questions = [
    { id: 'q1', prompt: 'What does the weather do in spring?' },
    { id: 'q2', prompt: 'Which group has waited longest for a plot?' },
    { id: 'q3', prompt: 'What would a fair second plot share look like?' },
    { id: 'q4', prompt: 'Who else should be asked about the garden?' },
    { id: 'q5', prompt: 'Is there tea?' }
  ];
  const picked = questionsFromBrief(BRIEF, 'qb_making_decisions', questions);
  assert.equal(picked.chapterId, 'qb_making_decisions');
  assert.deepEqual(picked.questionIds, ['q2', 'q3', 'q4']);
  const chosen = questionsFromBrief(BRIEF, 'tool:question-book');
  assert.ok(QUESTION_CHAPTER_IDS.includes(chosen.chapterId));
  assert.deepEqual(chosen.questionIds, []);
});

test('intakeFromBrief fills every protocol’s required fields and passes the digest as context', () => {
  for (const def of catalog) {
    const intake = intakeFromBrief(def.id, BRIEF);
    for (const field of def.intake.filter((f) => f.required)) assert.ok(intake[field.id], `${def.id}.${field.id}`);
    for (const key of Object.keys(intake)) assert.ok(def.intake.some((f) => f.id === key), `${def.id} has no ${key}`);
  }
  assert.equal(intakeFromBrief('fates', BRIEF).task, 'Which group should get the second plot?');
  assert.ok(intakeFromBrief('tribunal', { situation: 'Stuck again.' }).entrenchment);
  assert.match(digestText(BRIEF.digest), /^Facts: Two plots; Three groups\.\nChoices:/);
  assert.throws(() => intakeFromBrief('nope', BRIEF), { status: 400 });
});

const node = (slot, text, extra = {}) => ({ id: `n_${slot}_${text.length}`, slot, text, ...extra });
const commitSession = (commitId, kind) => ({
  id: 's-commit', kind, title: 'Garden plots', summary: 'Worked it through.',
  steps: { commit: { runs: [{ id: 'r1', tool: commitId, status: 'done', nodes: [
    node('result', 'Both plots in use by spring'),
    node('rests_on', 'A shared rota'),
    node('next_action', 'Email the three groups'),
    node('change_course', 'If nobody signs the rota')
  ] }] } }
});

test('packetFrom: one shape for every tool, composed from placed nodes', () => {
  const shape = ['answer', 'detail', 'restsOn', 'openQuestions', 'actions', 'source'];
  const decision = packetFrom('decision-book', {
    id: 's-dec', kind: 'decision', title: 'Plot two',
    steps: { decide: { runs: [{ id: 'r1', tool: 'dm_record', status: 'done', nodes: [
      node('decision', 'Share the second plot by season'), node('reason', 'Each group gets a growing season'), node('trigger', 'A third plot opens'), node('first_step', 'Tell the groups on Saturday')
    ] }] } }
  });
  assert.deepEqual(Object.keys(decision), shape);
  assert.equal(decision.answer, 'Share the second plot by season');
  assert.deepEqual(decision.openQuestions, ['Rethink if: A third plot opens']);
  assert.deepEqual(decision.actions, ['Tell the groups on Saturday']);
  assert.deepEqual(decision.source, { tool: 'decision-book', sessionId: 's-dec' });

  for (const [tool, commitId, kind] of [['rules-book', 'rb_commit', 'rules'], ['change-book', 'ch_commit', 'change'], ['collaboration-book', 'cb_commit', 'collab'], ['communication-book', 'cm_commit', 'talk'], ['get-things-done', 'gt_commit', 'shift']]) {
    const p = packetFrom(tool, commitSession(commitId, kind));
    assert.equal(p.answer, 'Both plots in use by spring', tool);
    assert.deepEqual(p.restsOn, ['A shared rota']);
    assert.deepEqual(p.actions, ['Email the three groups']);
    assert.deepEqual(p.openQuestions, ['If nobody signs the rota']);
  }
  assert.equal(packetFrom('rules-book', { id: 's', title: 'Bare', summary: 'Only a summary.' }).answer, 'Only a summary.');

  const ps = packetFrom('problem-solver', { id: 's-ps', title: 'Plots', summary: 'Two ways forward.', frame: { goal: 'Use both plots' }, steps: { options: { runs: [{ id: 'r', tool: 'brainstorm', nodes: [node('idea', 'Season swap', { title: 'Season swap' })] }] } } });
  assert.equal(ps.answer, 'Season swap');
  assert.deepEqual(ps.restsOn, ['Use both plots']);

  const qb = packetFrom('question-book', { id: 'qb-1', lines: ['Fairness matters more than speed.', 'Ask the newest group first.'] });
  assert.equal(qb.answer, 'Fairness matters more than speed.');
  assert.deepEqual(qb.restsOn, ['Ask the newest group first.']);

  const proto = packetFrom('knowledge-protocols', { id: 'p-1', summary: { keyFinding: 'Seasons split cleanly.', summary: 'Spring and autumn suit different crops.', openQuestions: ['Who waters in summer?'] } });
  assert.equal(proto.answer, 'Seasons split cleanly.');
  assert.deepEqual(proto.actions, [], 'protocols never suggest actions');
  assert.deepEqual([...PACKET_TOOLS].sort(), [...ENGINE_TOOLS, 'question-book', 'knowledge-protocols'].sort());
  assert.throws(() => packetFrom('nope', {}), { status: 400 });
});
