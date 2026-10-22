// tests/unit/get-things-done-eval-cases.test.js
// The Gear Shifter evaluation cases build the sessions they claim to (framing, Commit, a Quick
// start), with one discernment case per section, and the judge passes and fails as it should.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, judge, prepare } from '../../scripts/get-things-done-eval-cases.mjs';
import { activeRun } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { buildGearPrompt } from '../../netlify/functions/_shared/problem-solver/get-things-done-prompts.mjs';
import { currentEntry } from '../../packages/get-things-done/quick.mjs';
import { nextSlots } from '../../packages/problem-solver/machine.mjs';
import { ROUTE } from '../../packages/get-things-done/route.mjs';

const find = (words) => CASES.find((c) => c.name.includes(words));

test('every case builds its session with the answer last: framing, Commit or a Quick start', () => {
  for (const c of CASES) {
    const s = prepare(c);
    assert.equal(s.turns.at(-1).text, c.answer, c.name);
    if (c.quick) assert.ok(currentEntry(s.start), c.name);
    else assert.equal(s.kind, 'shift', c.name);
  }
  const discern = CASES.filter((c) => c.name.startsWith('Discern'));
  assert.deepEqual(discern.map((c) => prepare(c).frame.route), ROUTE.map((station) => station.id), 'one discernment case per section, in route order');
  for (const c of discern) {
    const s = prepare(c);
    assert.equal(s.phase, 'frame');
    assert.deepEqual(Object.keys(s.frame), ['need', 'route']);
  }
  const big = prepare(find('too big'));
  assert.equal(big.phase, 'commit');
  assert.equal(activeRun(big).tool, 'gt_commit');
  assert.deepEqual(nextSlots(activeRun(big)), ['next_action']);
  assert.doesNotMatch(buildGearPrompt(big).user, /AWAITING LEARNING/);
  assert.deepEqual(nextSlots(activeRun(prepare(find('no date')))), ['check_back']);
  assert.equal(currentEntry(prepare(find('timer')).start).node, 'how');
  assert.equal(currentEntry(prepare(find('whole project')).start).node, 'action');
});

test('judge: word limits, flattery, a technique with a sibling, the quick step and the route’s origin', () => {
  const long = 'word '.repeat(20).trim();
  const vague = find('vague');
  assert.equal(judge(vague, { verdict: 'challenge', message: long }), null);
  assert.match(judge(vague, { verdict: 'accept', message: long }), /should not be accept/);
  assert.match(judge(vague, { verdict: 'challenge', message: 'too short' }), /words/);
  assert.match(judge(vague, { verdict: 'challenge', message: `${long} What a great start.` }), /flatters/);
  const discern = find('doing it');
  const named = 'The obstacle is an avoided start. The Pomodoro Technique fits: short protected rounds. I passed over the 5-Second Rule because the start is not the hard part here.';
  assert.equal(judge(discern, { verdict: 'accept', message: named, suggestion: { kind: 'next_tool', tool: 'gt_pomodoro' } }), null);
  assert.match(judge(discern, { verdict: 'accept', message: named.replace('the 5-Second Rule', 'another one'), suggestion: { kind: 'next_tool', tool: 'gt_pomodoro' } }), /no sibling/);
  assert.match(judge(discern, { verdict: 'accept', message: named, suggestion: { kind: 'next_tool', tool: 'five_whys' } }), /Gear Shifter technique/);
  const action = find('records the first action');
  assert.equal(judge(action, { verdict: 'accept', message: long, quick: { node: 'action', note: 'Open the folder' } }), null);
  assert.match(judge(action, { verdict: 'accept', message: long, quick: null }), /want action/);
  assert.match(judge(find('timer'), { verdict: 'accept', message: long, quick: { node: 'how', answer: 'interval' } }), /should not settle how/);
  const own = find('not the book');
  assert.equal(judge(own, { verdict: 'clarify', message: `No, it is Gear Shifter's own route, built from two of the book's techniques. ${long}`, quick: null }), null);
  assert.match(judge(own, { verdict: 'clarify', message: `Yes, it comes straight from the book. ${long}`, quick: null }), /own/);
});
