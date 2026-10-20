// tests/unit/problem-solver-lightning.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIGHTNING_EDGES, LIGHTNING_NODES, LIGHTNING_QUESTIONS, again, applyStep, currentEntry,
  escalationSeeds, isQuestion, newLightning, passes, questionOf, strategiesTried
} from '../../packages/problem-solver/lightning.mjs';

const AT = '2026-10-20T09:00:00.000Z';
const walk = (state, ...steps) => steps.reduce((s, step) => applyStep(s, step, AT), state);
const nodes = (state) => state.path.map((e) => e.node);

test('the graph: every link lands on a node, every question has yes and no', () => {
  for (const edge of LIGHTNING_EDGES) assert.ok(LIGHTNING_NODES[edge.to], `${edge.from} -> ${edge.to}`);
  for (const [id, def] of Object.entries(LIGHTNING_NODES)) {
    if (def.yes) assert.ok(def.no, id);
    if (['strategy', 'end', 'close'].includes(def.kind)) assert.equal(def.yes, undefined, id);
  }
  assert.deepEqual(LIGHTNING_QUESTIONS.map((q) => q.id), ['fix', 'do', 'learn', 'next']);
  assert.equal(questionOf('start'), 'fix');
  assert.equal(questionOf('make_list'), 'do');
  assert.equal(questionOf('learn'), 'learn');
});

test('accepting the status quo goes to Relax, then the two closing questions, then finishes', () => {
  let s = newLightning(AT);
  assert.equal(currentEntry(s).node, 'start');
  s = walk(s, { node: 'start', answer: 'yes' });
  assert.deepEqual(nodes(s), ['start', 'relax', 'learn']);
  s = walk(s, { node: 'learn', note: 'Not every snag needs fixing' });
  assert.equal(currentEntry(s).node, 'next');
  s = walk(s, { node: 'next', note: 'Notice it sooner next time' });
  assert.equal(currentEntry(s), null);
  assert.equal(s.finishedAt, AT);
});

test('a strategy can carry whether it worked; a no moves down the chain', () => {
  let s = walk(newLightning(AT), { node: 'start', answer: 'no' }, { node: 'goal', note: 'Leave the house by eight' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' });
  assert.equal(currentEntry(s).node, 'diagram');
  s = walk(s, { node: 'diagram', note: 'Sketched the morning', answer: 'no' });
  assert.deepEqual(nodes(s).slice(-3), ['diagram', 'solved_1', 'work_backwards']);
  s = walk(s, { node: 'work_backwards', note: 'Planned back from eight' });
  assert.equal(currentEntry(s).node, 'solved_2');
  s = walk(s, { node: 'solved_2', answer: 'yes' });
  assert.deepEqual(nodes(s).slice(-3), ['solved_2', 'relax', 'learn']);
  assert.deepEqual(strategiesTried(s).map((t) => [t.node, t.outcome]), [['diagram', 'not solved'], ['work_backwards', 'solved']]);
});

test('reframing loops back to the goal and counts passes', () => {
  let s = walk(newLightning(AT), { node: 'start', answer: 'no' }, { node: 'goal', note: 'g' }, { node: 'subtract', answer: 'yes' }, { node: 'via_negativa', answer: 'no' });
  for (const id of ['work_backwards', 'make_list', 'take_break', 'analogy']) s = walk(s, { node: id, answer: 'no' });
  assert.equal(currentEntry(s).node, 'reframing');
  assert.equal(passes(s), 1);
  s = walk(s, { node: 'reframing', answer: 'yes' });
  assert.equal(currentEntry(s).node, 'goal');
  assert.equal(passes(s), 2);
  s = walk(s, { node: 'goal', note: 'A smaller goal' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'yes' }, { node: 'guess_check', answer: 'no' });
  for (const id of ['work_backwards', 'make_list', 'take_break', 'analogy']) s = walk(s, { node: id, answer: 'no' });
  s = walk(s, { node: 'reframing', answer: 'no' });
  assert.equal(currentEntry(s).node, 'cannot');
  s = walk(s, { node: 'cannot' });
  assert.equal(currentEntry(s).node, 'learn');
});

test('a stale node or a missing answer is refused', () => {
  const s = newLightning(AT);
  assert.throws(() => applyStep(s, { node: 'goal' }, AT), (e) => e.code === 'stale_node');
  assert.throws(() => applyStep(s, { node: 'start' }, AT), (e) => e.code === 'invalid_answer');
  assert.throws(() => applyStep({ ...s, finishedAt: AT }, { node: 'start', answer: 'no' }, AT), (e) => e.code === 'stale_node');
  assert.equal(isQuestion('start'), true);
  assert.equal(isQuestion('goal'), false);
});

test('it came back: a finished run starts a new round, keeping the old path', () => {
  let s = walk(newLightning(AT), { node: 'start', answer: 'yes' }, { node: 'learn' }, { node: 'next' });
  assert.throws(() => again(newLightning(AT), AT), /still going/);
  s = again(s, AT);
  assert.equal(s.rounds, 2);
  assert.equal(s.finishedAt, null);
  assert.deepEqual(currentEntry(s), { node: 'start', round: 2, at: AT });
  assert.equal(s.path.filter((e) => e.round === 1).length, 4);
});

test('escalation seeds: the latest goal and what was tried, with outcomes', () => {
  const s = walk(newLightning(AT), { node: 'start', answer: 'no' }, { node: 'goal', note: 'Leave the house by eight' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' }, { node: 'diagram', note: 'Sketched the morning', answer: 'no' });
  const seeds = escalationSeeds(s);
  assert.equal(seeds.goal, 'Leave the house by eight');
  assert.equal(seeds.whatIsTrue, 'Tried draw a diagram (Sketched the morning): not solved.');
  assert.equal(seeds.tried.length, 1);
  assert.deepEqual(escalationSeeds(newLightning(AT)), { goal: null, whatIsTrue: null, tried: [] });
});
