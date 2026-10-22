// tests/unit/get-things-done-start-prompts.test.js
// The Quick start coach: its prompt, its reply check, the model coach reading a start reply, the
// seeds a full session shows while framing, and the record's "Began as a Quick start" line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { START_INTENTS, START_RUBRIC, buildStartPrompt, checkStartTurn } from '../../netlify/functions/_shared/problem-solver/start-prompts.mjs';
import { applyStartTurn, createStartSession, escalateStart } from '../../netlify/functions/_shared/problem-solver/start-session.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { buildGearPrompt } from '../../netlify/functions/_shared/problem-solver/get-things-done-prompts.mjs';
import { applyCoachTurn } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { composeActionRecord } from '../../packages/get-things-done/record.mjs';
import { START_NODE_IDS, again } from '../../packages/get-things-done/quick.mjs';
import { committed, deps } from './gear-shifter-test-helpers.mjs';

const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });
const TASK = 'Book the car in for its service';
const walked = (...steps) => steps.reduce((s, step) => idle(applyStartTurn(s, turn({ quick: step }), deps)), idle(createStartSession({ text: TASK }, deps)));
const STEPS = [
  { node: 'action', note: 'Find the service booklet in the glovebox' },
  { node: 'how', answer: 'countdown' },
  { node: 'cue', note: 'When I park at work, count down and open the glovebox' },
  { node: 'check', note: '2026-10-23' },
  { node: 'happened', note: 'Found it and rang the garage at lunch' },
  { node: 'next', note: 'Drop the car off on Tuesday' }
];

test('every box has an intent; the rubric keeps the route ours, names both ways and when to go deeper', () => {
  assert.deepEqual(Object.keys(START_INTENTS), START_NODE_IDS);
  assert.match(START_RUBRIC, /The route itself is not in the book\. Never say or suggest that the book sets out these steps/);
  assert.match(START_RUBRIC, /The 5-Second Rule \(a countdown cue\)/);
  assert.match(START_RUBRIC, /The Pomodoro Technique \(one protected interval\)/);
  assert.match(START_RUBRIC, /never offer one/);
  assert.match(START_RUBRIC, /"kind":"escalate"/);
});

test('the prompt names the task, what is set, the current box and the next', () => {
  const first = buildStartPrompt(walked());
  assert.equal(first.system[0], START_RUBRIC);
  assert.match(first.user, /TASK: Book the car in for its service/);
  assert.match(first.user, /CURRENT BOX: action \(note\): The first small, safe action\./);
  assert.match(first.user, /NEXT: how/);
  const atCue = buildStartPrompt(walked(...STEPS.slice(0, 2)));
  assert.match(atCue.user, /HOW IT STARTS: countdown cue/);
  assert.match(atCue.user, /CURRENT BOX: cue \(note\): The cue\./);
  const done = buildStartPrompt(walked(...STEPS));
  assert.match(done.user, /The run is finished/);
});

test('round 2 offers last round\'s action and what happened, and says to think about a full session', () => {
  const s = walked(...STEPS);
  const back = { ...s, status: 'active', start: again(s.start, deps.now()) };
  const prompt = buildStartPrompt(back);
  assert.match(prompt.user, /ROUND: 2 \(it came back, so think about a full session\)/);
  assert.match(prompt.user, /LAST ROUND .*action "Find the service booklet in the glovebox"; started with a countdown cue; what happened: Found it/);
});

test('the reply check: the current box only, in its own form; escalate kept until it has gone deeper', () => {
  const s = walked(STEPS[0]);
  assert.match(checkStartTurn(s, { quick: { node: 'action', note: 'x' } }).error, /current box \(how\)/);
  assert.match(checkStartTurn(s, { quick: { node: 'how' } }).error, /countdown or interval/);
  assert.equal(checkStartTurn(s, { quick: { node: 'how', answer: 'interval' } }).ok, true);
  const atCue = walked(...STEPS.slice(0, 2));
  assert.match(checkStartTurn(atCue, { quick: { node: 'cue' } }).error, /needs their words/);
  const offer = { quick: null, suggestion: { kind: 'escalate', reason: 'A whole project.' } };
  assert.deepEqual(checkStartTurn(s, offer).value.suggestion, offer.suggestion);
  const { run } = escalateStart(s, 'full-1', deps);
  assert.equal(checkStartTurn(run, offer).value.suggestion, null);
  assert.equal(checkStartTurn(run, { quick: { node: 'how', answer: 'interval' } }).value.quick, null);
});

test('the model coach uses the start prompt and repairs a step for the wrong box once', async () => {
  const s = walked(STEPS[0]);
  const seen = [];
  const replies = [
    JSON.stringify({ verdict: 'accept', message: 'Good, that is small enough to start today. How will it start: a countdown cue or one protected interval?', quick: { node: 'action', note: 'x' } }),
    JSON.stringify({ verdict: 'accept', message: 'A countdown it is. What is the exact moment you will count down from five and move?', quick: { node: 'how', answer: 'countdown' } })
  ];
  const coach = createModelCoach(async (prompt) => {
    seen.push(prompt);
    return replies.shift();
  });
  const reply = await coach(s);
  assert.equal(seen[0].system[0], START_RUBRIC);
  assert.equal(seen.length, 2, 'one repair');
  assert.deepEqual(reply.quick, { node: 'how', answer: 'countdown' });
});

test('a shift from a Quick start shows its seeds while framing, then where it came from', () => {
  const s = walked(...STEPS.slice(0, 4));
  const { full } = escalateStart(s, 'full-2', deps);
  const framing = buildGearPrompt(full).user;
  assert.match(framing, /CARRIED FROM A QUICK START \(seeds, not answers/);
  assert.match(framing, /need: Book the car in for its service; known: First action: Find the service booklet/);
  let framed = full;
  for (const frame of [{ need: TASK }, { route: 'doing' }, { known: 'The garage is booked out a week ahead' }]) {
    framed = applyCoachTurn(framed, validateCoachTurn({ verdict: 'accept', message: 'Noted.', frame }).value, deps);
  }
  assert.notEqual(framed.phase, 'frame');
  assert.match(buildGearPrompt(framed).user, /CAME FROM A QUICK START: First action: Find the service booklet/);
  const plain = buildGearPrompt(committed()).user;
  assert.doesNotMatch(plain, /QUICK START/);
});

test('the action record says it began as a Quick start only when it did', () => {
  const plain = composeActionRecord(committed());
  assert.equal(plain.sections.some((section) => section.key === 'quick_start'), false);
  const seeded = composeActionRecord({ ...committed(), escalatedFrom: 'run-1', frameSeeds: { from: 'start', need: TASK, known: null, action: 'Find the service booklet', way: 'interval', cue: 'Nine to nine fifteen' } });
  const section = seeded.sections.find((item) => item.key === 'quick_start');
  assert.equal(section.heading, 'Began as a Quick start');
  assert.deepEqual(section.lines, ['First action: Find the service booklet', 'Started with a protected interval: Nine to nine fifteen']);
});
