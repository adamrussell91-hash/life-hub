import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_WORKOUT_TOKEN,
  expandLiveTokens,
  formatLiveWorkoutCompare
} from '../../netlify/functions/_shared/knowledge-live.mjs';

const COMPARE = {
  ok: true,
  weeks: 8,
  current: { from: '2026-07-13', to: '2026-09-06', count: 11 },
  previous: { from: '2026-05-18', to: '2026-07-12', count: 8 },
  delta: 3
};

test('expandLiveTokens leaves ordinary Knowledge bodies alone', () => {
  assert.equal(expandLiveTokens('# Hello\n\nStatic note.', COMPARE), '# Hello\n\nStatic note.');
});

test('expandLiveTokens replaces the workout compare token with the computed counts', () => {
  const body = `Completed workouts:\n\n${LIVE_WORKOUT_TOKEN}\n`;
  const expanded = expandLiveTokens(body, COMPARE);
  assert.doesNotMatch(expanded, /\{\{life:compare_workout_windows\}\}/);
  assert.match(expanded, /11 completed workouts/);
  assert.match(expanded, /8 completed workouts/);
  assert.match(expanded, /\+3/);
  assert.match(expanded, /13\/07\/26/);
  assert.match(expanded, /06\/09\/26/);
});

test('expandLiveTokens is fail-visible when the compare is missing', () => {
  const expanded = expandLiveTokens(`Pulse\n\n${LIVE_WORKOUT_TOKEN}`, { ok: false });
  assert.match(expanded, /unavailable/i);
  assert.doesNotMatch(expanded, /0 completed/);
});

test('formatLiveWorkoutCompare names the windows without raw ISO dates', () => {
  const text = formatLiveWorkoutCompare(COMPARE);
  assert.doesNotMatch(text, /2026-07-13/);
  assert.match(text, /13\/07\/26/);
});
