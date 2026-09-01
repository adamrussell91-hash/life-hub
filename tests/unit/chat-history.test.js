import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keepNewestHistory,
  MAX_HISTORY_ENTRY_CHARS,
  MAX_HISTORY_TOTAL_CHARS,
  truncateHistoryEntry
} from '../../apps/life/js/core/chat-history.js';

const PLAN_TAIL = [
  '1. Bar Press (Chest) — 10x30kg, 10x32kg, 8x34kg — cable: constant force',
  '2. Alt Incline Press (Chest) — 10x12kg, 10x15kg — cable: concentric',
  '3. Bar Row (Back) — 10x27kg, 10x27kg, 8x29kg — cable: constant force',
  '4. Single Arm Row with Chest Supported (Back) — 12x14kg — cable: constant force',
  '5. Bar Squat (Legs) — 10x25kg, 10x25kg — cable: none',
  '6. Goblet Squat (Legs) — 12x14kg — cable: none',
  '7. Seated Curl (Biceps) — 12x8kg, 12x9kg — cable: constant force',
  '8. One Handle Arm Triceps (Triceps) — 12x8kg — cable: constant force',
  '9. Bent Leg Reverse Crunch (Core) — 15x0kg — cable: none',
  '10. One Grip Russian Twist (Core) — 20x6kg — cable: none'
].join('\n');

test('truncateHistoryEntry keeps the numbered plan at the end of a long Chadwick lecture', () => {
  const lecture = `HEAD_MARKER ${'x'.repeat(800)} MIDDLE_DROPPED ${'x'.repeat(4000)} Here's the full session:\n${PLAN_TAIL}`;
  assert.ok(lecture.length > MAX_HISTORY_ENTRY_CHARS);
  const truncated = truncateHistoryEntry(lecture);
  assert.ok(truncated.length <= MAX_HISTORY_ENTRY_CHARS);
  assert.match(truncated, /HEAD_MARKER/);
  assert.match(truncated, /One Grip Russian Twist/);
  assert.match(truncated, /Seated Curl/);
  assert.match(truncated, /\n…\n/);
  assert.doesNotMatch(truncated, /MIDDLE_DROPPED/);
});

test('keepNewestHistory prefers the most recent plan when earlier lectures fill the budget', () => {
  const oldPlan = `OLD PLAN\n${'x'.repeat(3500)}\n1. Ski Pull — skip me`;
  const latestPlan = `Comeback Full Body Burn\n${PLAN_TAIL}`;
  const history = keepNewestHistory([
    { role: 'user', content: 'welcome back workout' },
    { role: 'assistant', content: oldPlan },
    { role: 'user', content: 'option b' },
    { role: 'assistant', content: latestPlan },
    { role: 'user', content: 'ok lets put it into action' }
  ], { maxTotalChars: 2000, maxEntryChars: 2000 });

  const joined = history.map(entry => entry.content).join('\n');
  assert.match(joined, /ok lets put it into action/);
  assert.match(joined, /Comeback Full Body Burn|One Grip Russian Twist/);
  assert.doesNotMatch(joined, /Ski Pull/);
});

test('keepNewestHistory drops malformed entries and empty content', () => {
  assert.deepEqual(keepNewestHistory([
    { role: 'user', content: 'fine' },
    { role: 'system', content: 'nope' },
    { role: 'assistant', content: '' },
    'not an object',
    { role: 'assistant', content: 'also fine' }
  ]), [
    { role: 'user', content: 'fine' },
    { role: 'assistant', content: 'also fine' }
  ]);
});

test('keepNewestHistory total budget stays at or under the shared cap', () => {
  const entries = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `block ${i} ${'y'.repeat(2000)}`
  }));
  const kept = keepNewestHistory(entries);
  const total = kept.reduce((sum, entry) => sum + entry.content.length, 0);
  assert.ok(total <= MAX_HISTORY_TOTAL_CHARS);
  assert.ok(kept.length >= 2);
  assert.equal(kept.at(-1).content.startsWith('block 11'), true);
});
