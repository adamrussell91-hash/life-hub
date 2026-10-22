// tests/unit/decision-book-quick.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUICK_NODES, SUGGESTED_TESTS, TEST_IDS, again, answersOf, applyStep, currentEntry, decisionOf, isCheckDate,
  newQuick, outcomeOf, quickSeeds, stopRuleOf, testLabel, testsOf
} from '../../packages/decision-book/quick.mjs';

const AT = '2026-10-21T09:00:00.000Z';
const walk = (state, ...steps) => steps.reduce((s, step) => applyStep(s, step, AT), state);
const nodes = (state) => state.path.map((e) => e.node);
const TESTS = { node: 'tests', tests: ['Do I want the course?', 'Can I fit it in?', 'Is it worth the fee?'] };
const yes = (node) => ({ node, answer: 'yes' });

test('the flow: every link lands on a box, and only tests branch', () => {
  for (const [id, def] of Object.entries(QUICK_NODES)) {
    for (const to of [def.next, def.yes, def.no].filter(Boolean)) assert.ok(QUICK_NODES[to], `${id} -> ${to}`);
    assert.equal(Boolean(def.yes), def.kind === 'test', id);
  }
  assert.deepEqual(TEST_IDS.map((id) => QUICK_NODES[id].no), ['stop', 'stop', 'stop']);
  assert.equal(SUGGESTED_TESTS.length, 3);
});

test('a new run holds the decision and waits for the tests', () => {
  const s = newQuick('  Take the weekend course?  ', AT);
  assert.equal(decisionOf(s), 'Take the weekend course?');
  assert.equal(currentEntry(s).node, 'tests');
  assert.equal(testsOf(s), null);
  assert.equal(testLabel(s, 'test_one'), 'First test');
});

test('the tests are set together, three of them, before any is answered', () => {
  const s = newQuick('Take the course?', AT);
  assert.throws(() => applyStep(s, { node: 'tests', tests: ['One?', 'Two?'] }, AT), { code: 'invalid_answer' });
  assert.throws(() => applyStep(s, yes('test_one'), AT), { code: 'stale_node' });
  const set = walk(s, TESTS);
  assert.deepEqual(testsOf(set), TESTS.tests);
  assert.equal(currentEntry(set).node, 'test_one');
  assert.equal(testLabel(set, 'test_two'), 'Can I fit it in?');
});

test('any no ends at Do not proceed, then the closing questions, then finishes', () => {
  let s = walk(newQuick('Take the course?', AT), TESTS, yes('test_one'), { node: 'test_two', answer: 'no', note: 'Weekends are full' });
  assert.deepEqual(nodes(s).slice(-2), ['stop', 'learn']);
  assert.equal(outcomeOf(s), 'stop');
  assert.deepEqual(answersOf(s), ['yes', 'no', null]);
  assert.throws(() => applyStep(s, { node: 'test_three', answer: 'yes' }, AT), { code: 'stale_node' });
  s = walk(s, { node: 'learn', note: 'I say yes before checking the calendar' }, { node: 'next' });
  assert.equal(s.finishedAt, AT);
  assert.equal(currentEntry(s), null);
});

test('three yeses proceed to the Stop Rule, an optional check, and the close', () => {
  let s = walk(newQuick('Take the course?', AT), TESTS, yes('test_one'), yes('test_two'), yes('test_three'));
  assert.deepEqual(nodes(s).slice(-2), ['proceed', 'trigger']);
  assert.equal(outcomeOf(s), 'proceed');
  assert.throws(() => applyStep(s, { node: 'trigger' }, AT), { code: 'invalid_answer' }, 'a trigger needs words');
  s = walk(s, { node: 'trigger', note: 'I miss two sessions' }, { node: 'action', note: 'Ask for a transfer to the spring run' });
  assert.deepEqual(stopRuleOf(s), { trigger: 'I miss two sessions', action: 'Ask for a transfer to the spring run' });
  assert.throws(() => applyStep(s, { node: 'check', note: 'next week' }, AT), { code: 'invalid_answer' });
  s = walk(s, { node: 'check', note: '2027-01-21' });
  assert.deepEqual(s.check, { due: '2027-01-21', taskId: null, dismissed: false });
  assert.equal(currentEntry(s).node, 'learn');
});

test('no check leaves the check unset', () => {
  const s = walk(newQuick('Take the course?', AT), TESTS, yes('test_one'), yes('test_two'), yes('test_three'),
    { node: 'trigger', note: 'I miss two sessions' }, { node: 'action', note: 'Transfer' }, { node: 'check', answer: 'no' });
  assert.equal(s.check, null);
  assert.equal(currentEntry(s).node, 'learn');
});

test('check dates are real dates', () => {
  assert.equal(isCheckDate('2027-01-21'), true);
  assert.equal(isCheckDate('2027-13-40'), false);
  assert.equal(isCheckDate('21/01/2027'), false);
});

test('It came back starts a new round at the tests, keeping the first round on the path', () => {
  const done = walk(newQuick('Take the course?', AT), TESTS, { node: 'test_one', answer: 'no' }, { node: 'learn' }, { node: 'next' });
  assert.throws(() => again(newQuick('x', AT), AT), { code: 'invalid_answer' });
  const s = again(done, AT);
  assert.equal(s.rounds, 2);
  assert.equal(s.finishedAt, null);
  assert.equal(currentEntry(s).node, 'tests');
  assert.equal(testsOf(s), null);
  assert.deepEqual(testsOf(s, 1), TESTS.tests);
  assert.equal(outcomeOf(s, 1), 'stop');
  assert.equal(outcomeOf(s), null);
});

test('going deeper seeds the decision, the tests with their answers and the Stop Rule', () => {
  const s = walk(newQuick('Take the course?', AT), TESTS, yes('test_one'), yes('test_two'), yes('test_three'),
    { node: 'trigger', note: 'I miss two sessions' });
  assert.deepEqual(quickSeeds(s), {
    from: 'quick',
    decision: 'Take the course?',
    known: 'Yes/No tests: Do I want the course? yes; Can I fit it in? yes; Is it worth the fee? yes. Stop Rule: if I miss two sessions, then no action agreed yet.',
    tests: TESTS.tests.map((test) => ({ test, answer: 'yes' })),
    stopRule: { trigger: 'I miss two sessions', action: null }
  });
  assert.equal(quickSeeds(newQuick('Take the course?', AT)).known, null);
});
