import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanWritingLog, diffText, emptyWritingLog, recordChange, replayText, summariseWriting, writingLine } from '../../netlify/functions/_shared/quiz-core.mjs';

/** Types `text` one letter at a time, `gap` ms apart, from `at`. */
function type(log, before, text, at, gap = 200) {
  let current = before;
  for (const ch of text) {
    at += gap;
    const next = current + ch;
    recordChange(log, current, next, at);
    current = next;
  }
  return { text: current, at };
}

test('diffText finds the one edit between two texts', () => {
  assert.deepEqual(diffText('the cat', 'the black cat'), { at: 4, cut: 0, put: 'black ' });
  assert.deepEqual(diffText('the black cat', 'the cat'), { at: 4, cut: 6, put: '' });
  assert.deepEqual(diffText('abc', 'axc'), { at: 1, cut: 1, put: 'x' });
});

test('typing folds into few steps and the replay rebuilds the text', () => {
  const t0 = 1_000_000;
  const log = emptyWritingLog('', t0);
  let { text, at } = type(log, '', 'Romeo dies', t0);
  // A pause, then a fix: delete "dies", type "falls".
  at += 10_000;
  recordChange(log, text, 'Romeo ', at);
  ({ text, at } = type(log, 'Romeo ', 'falls', at));
  assert.equal(replayText(log), 'Romeo falls');
  assert.ok(log.steps.length <= 4, `${log.steps.length} steps`);
  assert.equal(log.jumps, 0);
  assert.ok(log.ms > 10_000 && log.ms < 15_000, 'pauses under a minute count as writing time');
});

test('a big chunk with no paste counts as a jump; a pasted one does not double count', () => {
  const log = emptyWritingLog('', 0);
  const chunk = 'x'.repeat(60);
  recordChange(log, '', chunk, 100);
  recordChange(log, chunk, chunk + chunk, 200, true);
  assert.equal(log.jumps, 1);
});

test('summary flags say what happened, in plain words', () => {
  const answer = 'word '.repeat(80);
  const log = { ...emptyWritingLog('', 0), ms: 30_000, pastes: 1, away: 4, jumps: 2, steps: [[0, 0, 0, answer]] };
  const s = summariseWriting(log, answer, 'block');
  assert.deepEqual(s.flags, ['Tried to paste once', '2 chunks of text appeared at once', 'Left the page 4 times', 'Typed faster than most people write', 'Almost no edits']);
  assert.equal(writingLine(s), 'Typed 30 s · 1 paste attempt · 2 big jumps · left the page 4 times');
  const calm = summariseWriting({ ...emptyWritingLog('', 0), ms: 600_000, steps: [[0, 0, 0, 'Short answer.']] }, 'Short answer.');
  assert.deepEqual(calm.flags, []);
});

test('cleanWritingLog trims what a browser sends', () => {
  assert.equal(cleanWritingLog(null), null);
  assert.equal(cleanWritingLog([1, 2]), null);
  const huge = cleanWritingLog({ start: 5, base: 'b', ms: -4, pastes: 'x', steps: [[1, 2, 3, 'ok'], ['bad'], ...Array.from({ length: 4000 }, () => [1, 0, 0, 'a'])] });
  assert.equal(huge.ms, 0);
  assert.equal(huge.pastes, 0);
  assert.equal(huge.steps.length, 3000);
  assert.equal(huge.full, true);
});
