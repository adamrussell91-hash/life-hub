// tests/unit/problem-solver-lightning-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLightningTurn, createLightningSession, escalateLightning, lightningAgain, lightningAnswer } from '../../netlify/functions/_shared/problem-solver/lightning-session.mjs';
import { currentEntry } from '../../packages/problem-solver/lightning.mjs';
import { migrateSession } from '../../netlify/functions/_shared/problem-solver/migrate.mjs';
import { summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let counter = 0;
const deps = { now: () => '2026-10-20T09:00:00.000Z', newId: () => `id${(counter += 1)}` };
const turn = (fields) => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const run = () => idle(createLightningSession({ text: 'I keep missing the 8.05 bus.' }, deps));

test('a Lightning run starts at the first box, queued for the coach', () => {
  const s = createLightningSession({ text: 'I keep missing the 8.05 bus.' }, deps);
  assert.equal(s.kind, 'lightning');
  assert.equal(s.phase, 'lightning');
  assert.equal(s.model, null);
  assert.equal(currentEntry(s.lightning).node, 'start');
  assert.equal(s.runner.status, 'queued');
  assert.equal(s.escalatedFrom, null);
  assert.equal(migrateSession(s), s, 'a fresh run needs no migration');
});

test('the coach answers the current box; a stale step is dropped and the turn kept', () => {
  let s = applyLightningTurn(run(), turn({ lightning: { node: 'start', answer: 'no' } }), deps);
  assert.equal(currentEntry(s.lightning).node, 'goal');
  s = applyLightningTurn(idle(s), turn({ lightning: { node: 'subtract', answer: 'no' } }), deps);
  assert.equal(currentEntry(s.lightning).node, 'goal');
  assert.equal(s.turns.at(-1).role, 'coach');
});

test('the last closing answer finishes the run', () => {
  let s = run();
  for (const step of [{ node: 'start', answer: 'yes' }, { node: 'learn', note: 'It was not worth the worry' }, { node: 'next', note: 'Leave five minutes earlier' }]) s = idle(applyLightningTurn(s, turn({ lightning: step }), deps));
  assert.equal(s.status, 'finished');
  assert.equal(currentEntry(s.lightning), null);
});

test('an escalate suggestion is kept while the run is open', () => {
  let s = applyLightningTurn(run(), turn({ suggestion: { kind: 'escalate', reason: 'Three people are involved.' } }), deps);
  assert.deepEqual(s.suggestion, { kind: 'escalate', reason: 'Three people are involved.' });
  s = applyLightningTurn(idle(s), turn({}), deps);
  assert.equal(s.suggestion.kind, 'escalate');
  s = applyLightningTurn(idle(s), turn({ suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }), deps);
  assert.equal(s.suggestion.kind, 'escalate', 'only escalate suggestions mean anything here');
});

test('the person answers a yes/no box; a box that moved on is a conflict', () => {
  const s = lightningAnswer(run(), { node: 'start', answer: 'no' }, deps);
  assert.equal(currentEntry(s.lightning).node, 'goal');
  assert.equal(s.turns.at(-1).text, 'No.');
  assert.equal(s.runner.status, 'queued');
  assert.throws(() => lightningAnswer(idle(s), { node: 'start', answer: 'no' }, deps), (e) => e.code === 'conflict');
  assert.throws(() => lightningAnswer(idle(s), { node: 'goal', answer: 'yes' }, deps), /yes or no/);
});

test('it came back: only a finished, unescalated run starts a new round', () => {
  let s = run();
  assert.throws(() => lightningAgain(s, deps), /still going/);
  for (const step of [{ node: 'start', answer: 'yes' }, { node: 'learn' }, { node: 'next' }]) s = idle(applyLightningTurn(s, turn({ lightning: step }), deps));
  s = lightningAgain(s, deps);
  assert.equal(s.status, 'active');
  assert.equal(s.lightning.rounds, 2);
  assert.equal(currentEntry(s.lightning).node, 'start');
  assert.equal(s.turns.at(-1).text, 'It came back.');
});

test('escalate: a full session seeded from the run; the run is marked and finished', () => {
  let s = run();
  for (const step of [{ node: 'start', answer: 'no' }, { node: 'goal', note: 'Catch the 8.05 every weekday' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' }, { node: 'diagram', note: 'Mapped the morning', answer: 'no' }]) s = idle(applyLightningTurn(s, turn({ lightning: step }), deps));
  const { full, lightning } = escalateLightning(s, 'full-1', deps);
  assert.equal(full.id, 'full-1');
  assert.equal(full.kind, 'full');
  assert.equal(full.phase, 'frame');
  assert.deepEqual(full.frame, {}, 'seeds are not answers until the coach confirms them');
  assert.equal(full.escalatedFrom, s.id);
  assert.equal(full.frameSeeds.goal, 'Catch the 8.05 every weekday');
  assert.match(full.frameSeeds.whatIsTrue, /Tried draw a diagram \(Mapped the morning\): not solved\./);
  assert.equal(full.turns[0].text, 'I keep missing the 8.05 bus.');
  assert.equal(lightning.lightning.escalatedTo, 'full-1');
  assert.equal(lightning.status, 'finished');
  assert.throws(() => escalateLightning(lightning, 'full-2', deps), /already went/);
  assert.throws(() => lightningAgain(lightning, deps), /went to the full process/);
});

test('summary rows say a run is Lightning, and where it went', () => {
  const row = summaryRow(run());
  assert.equal(row.kind, 'lightning');
  assert.equal(row.escalatedTo, null);
});
