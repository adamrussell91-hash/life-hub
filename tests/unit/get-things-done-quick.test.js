// tests/unit/get-things-done-quick.test.js
// Quick start as data (packages/get-things-done/quick.mjs): the flow for one stalled task, its
// transitions, It came back and the seeds a full session starts from. Invented tasks only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  START_NODES, START_WAYS, again, applyStep, checkPointOf, currentEntry, cueLabel, isCheckDate, latestNote, newStart, startSeeds, taskOf, wayOf
} from '../../packages/get-things-done/quick.mjs';

const AT = '2026-10-22T09:00:00.000Z';
const TASK = 'Clear out the garage before the skip bin comes';

function walk(steps, state = newStart(TASK, AT)) {
  return steps.reduce((s, step) => applyStep(s, step, AT), state);
}

const TO_DONE = [
  { node: 'action', note: 'Carry the broken chairs to the kerb' },
  { node: 'how', answer: 'countdown' },
  { node: 'cue', note: 'After my morning coffee, count down and pick up the first chair' },
  { node: 'check', note: '2026-10-24' },
  { node: 'happened', note: 'Moved four chairs and a table, then kept going' },
  { node: 'next', note: 'Sort the paint tins on Saturday' }
];

test('the run opens at the first action with the task filled from the opening message', () => {
  const s = newStart(`  ${TASK}  `, AT);
  assert.equal(taskOf(s), TASK);
  assert.deepEqual(currentEntry(s), { node: 'action', round: 1, at: AT });
  assert.equal(s.rounds, 1);
  assert.equal(s.finishedAt, null);
  assert.equal(s.escalatedTo, null);
  assert.equal(s.check, null);
  assert.deepEqual(Object.keys(START_NODES), ['task', 'action', 'how', 'cue', 'check', 'happened', 'next']);
});

test('a note box needs words; how it starts takes only the two ways', () => {
  const s = newStart(TASK, AT);
  assert.throws(() => applyStep(s, { node: 'action', note: '  ' }, AT), { code: 'invalid_answer' });
  const at = walk([{ node: 'action', note: 'Carry the broken chairs to the kerb' }]);
  assert.equal(currentEntry(at).node, 'how');
  assert.throws(() => applyStep(at, { node: 'how', answer: 'yes' }, AT), { code: 'invalid_answer' });
  assert.throws(() => applyStep(at, { node: 'how', note: 'a timer on my phone' }, AT), { code: 'invalid_answer' });
  const picked = applyStep(at, { node: 'how', answer: 'interval', note: 'one block' }, AT);
  assert.equal(wayOf(picked), 'interval');
  assert.equal(currentEntry(picked).node, 'cue');
  assert.deepEqual(Object.keys(START_WAYS), ['countdown', 'interval']);
  assert.equal(START_WAYS.countdown.after, 'gt_five_second_rule');
  assert.equal(START_WAYS.interval.after, 'gt_pomodoro');
});

test('the cue box is labelled for the way picked', () => {
  const countdown = walk(TO_DONE.slice(0, 2));
  const interval = walk([TO_DONE[0], { node: 'how', answer: 'interval' }]);
  assert.equal(cueLabel(newStart(TASK, AT)), START_NODES.cue.label);
  assert.equal(cueLabel(countdown), 'The cue');
  assert.equal(cueLabel(interval), 'The protected interval');
});

test('a dated check-back sets the check; words are kept as the point; there is no "no check"', () => {
  const atCheck = walk(TO_DONE.slice(0, 3));
  const dated = applyStep(atCheck, { node: 'check', note: '2026-10-24' }, AT);
  assert.deepEqual(dated.check, { due: '2026-10-24', taskId: null, dismissed: false });
  assert.equal(checkPointOf(dated), '2026-10-24');
  const words = applyStep(atCheck, { node: 'check', note: 'after lunch today' }, AT);
  assert.equal(words.check, null);
  assert.equal(checkPointOf(words), 'after lunch today');
  assert.throws(() => applyStep(atCheck, { node: 'check', answer: 'no' }, AT), { code: 'invalid_answer' });
  assert.equal(isCheckDate('2026-02-30'), true, 'format only, as Decision Maker');
  assert.equal(isCheckDate('24 Oct'), false);
});

test('What next? finishes the run; a stale box is refused', () => {
  const done = walk(TO_DONE);
  assert.equal(done.finishedAt, AT);
  assert.equal(currentEntry(done), null);
  assert.equal(latestNote(done, 'happened'), 'Moved four chairs and a table, then kept going');
  assert.throws(() => applyStep(walk(TO_DONE.slice(0, 1)), { node: 'action', note: 'again' }, AT), { code: 'stale_node' });
  assert.throws(() => applyStep(done, { node: 'next', note: 'more' }, AT), { code: 'stale_node' });
});

test('It came back starts round 2 at the first action with the task kept', () => {
  assert.throws(() => again(walk(TO_DONE.slice(0, 2)), AT), { code: 'invalid_answer' });
  const back = again(walk(TO_DONE), AT);
  assert.equal(back.rounds, 2);
  assert.equal(back.finishedAt, null);
  assert.deepEqual(currentEntry(back), { node: 'action', round: 2, at: AT });
  assert.equal(taskOf(back), TASK);
  assert.equal(wayOf(back), null, 'round 2 has no way yet');
  assert.equal(wayOf(back, 1), 'countdown');
  assert.equal(latestNote(back, 'action', 1), 'Carry the broken chairs to the kerb');
  assert.equal(latestNote(back, 'action'), null);
});

test('the seeds a full session starts from', () => {
  const seeds = startSeeds(walk(TO_DONE));
  assert.equal(seeds.from, 'start');
  assert.equal(seeds.need, TASK);
  assert.equal(seeds.action, 'Carry the broken chairs to the kerb');
  assert.equal(seeds.way, 'countdown');
  assert.match(seeds.known, /First action: Carry the broken chairs to the kerb\./);
  assert.match(seeds.known, /Started with a countdown cue: After my morning coffee/);
  assert.match(seeds.known, /Check back: 2026-10-24\./);
  assert.match(seeds.known, /What happened: Moved four chairs/);
  const early = startSeeds(newStart(TASK, AT));
  assert.equal(early.known, null);
  assert.equal(early.way, null);
});
