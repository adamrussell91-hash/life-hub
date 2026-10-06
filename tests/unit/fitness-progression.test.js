import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBuildBoard,
  buildExerciseBests,
  buildPumpReport,
  chadwickLine,
  compareToGhost,
  detectPersonalBest,
  ghostForSet,
  loadIncrement,
  projectBuildBoard,
  suggestTarget
} from '../../apps/life/js/app/fitness-progression.js';

const set = (weight_kg, reps, extra = {}) => ({ weight_kg, reps, cable_type: 'constant_force', ...extra });
const event = record => ({ record: { type: 'workout', status: 'completed', ...record } });

test('ghost is the same set number last time, else the last set', () => {
  const previous = { sets: [set(30, 10), set(35, 8)] };
  assert.deepEqual(ghostForSet(previous, 1), set(35, 8));
  assert.deepEqual(ghostForSet(previous, 3), set(35, 8));
  assert.equal(ghostForSet(null, 0), null);
});

test('compareToGhost reads weighted, bodyweight and timed sets', () => {
  assert.deepEqual(compareToGhost(set(46, 8), set(46, 7)), { verdict: 'beat', label: '+1 rep' });
  assert.deepEqual(compareToGhost(set(48, 7), set(46, 7)), { verdict: 'beat', label: '+2 kg' });
  assert.deepEqual(compareToGhost(set(46, 7), set(46, 7)), { verdict: 'matched', label: 'matched' });
  assert.equal(compareToGhost(set(46, 5), set(46, 7)).verdict, 'below');
  assert.equal(compareToGhost(set(40, 12), set(46, 6)).verdict, 'beat', 'higher e1RM counts');
  assert.deepEqual(compareToGhost({ reps: 12, weight_kg: 0 }, { reps: 10, weight_kg: 0 }, 'bodyweight_reps'), { verdict: 'beat', label: '+2 reps' });
  assert.deepEqual(compareToGhost({ duration_sec: 40 }, { duration_sec: 30 }, 'timed'), { verdict: 'beat', label: '+10s' });
});

test('bests come from completed sessions before today and catch a PR', () => {
  const bests = buildExerciseBests([
    event({ date: '2026-10-01', exercises: [{ name: 'Bar Press', sets: [set(44, 8), set(46, 6)] }] }),
    event({ date: '2026-10-07', exercises: [{ name: 'Bar Press', sets: [set(60, 10)] }] })
  ], '2026-10-07');
  assert.equal(bests['bar press'].maxKg, 46);
  assert.equal(detectPersonalBest(set(48, 5), bests['bar press']).kind, 'weight');
  assert.equal(detectPersonalBest(set(46, 8), bests['bar press']).kind, 'e1rm');
  assert.equal(detectPersonalBest(set(44, 8), bests['bar press']), null);
});

test('auto-target: owned clean → go up; failed early → come down; failure at top → hold', () => {
  const plan = { name: 'Bar Press', sets: [set(46, 10), set(46, 10)] };
  assert.deepEqual(suggestTarget({ sets: [set(46, 10), set(46, 10)] }, plan), {
    action: 'up', weight_kg: 48, reps: 10, reason: 'You owned 46 kg × 10 clean — add 2 kg'
  });
  assert.equal(suggestTarget({ sets: [set(46, 10), set(46, 6, { failed: true })] }, plan).action, 'down');
  const hold = suggestTarget({ sets: [set(46, 10), set(46, 9, { failed: true })] }, plan);
  assert.equal(hold.action, 'hold');
  assert.equal(hold.weight_kg, 46);
  const reps = suggestTarget({ sets: [set(46, 8), set(46, 8)] }, plan);
  assert.deepEqual([reps.action, reps.reps], ['reps', 9]);
  assert.equal(loadIncrement(10), 0.5);
  assert.equal(loadIncrement(30), 1);
});

test('Build Board counts this Monday-start week and projects today', () => {
  const board = buildBuildBoard([
    event({ date: '2026-10-06', exercises: [{ name: 'Bench Press', sets: [set(40, 10), set(40, 10)] }] }),
    event({ date: '2026-10-04', exercises: [{ name: 'Bench Press', sets: [set(40, 10)] }] })
  ], '2026-10-07');
  assert.equal(board.weekStart, '2026-10-05');
  const chest = board.regions.find(row => row.region === 'chest');
  assert.equal(chest.done, 2, 'Sunday before the week does not count');
  const projected = projectBuildBoard(board, {
    exercises: [{ name: 'Bench Press', sets: [set(40, 10, { done: true }), set(40, 10)] }]
  });
  const chestToday = projected.find(row => row.region === 'chest');
  assert.deepEqual([chestToday.today, chestToday.todayDone], [2, 1]);
});

test('Pump Report tallies ghosts, PRs, failure, volume delta and a Chadwick line', () => {
  const report = buildPumpReport({
    title: 'Glow Up',
    exercises: [
      { name: 'Bar Press', sets: [set(46, 10), set(48, 8, { failed: true })] },
      { name: 'Bar Curl', sets: [set(10, 12)] }
    ]
  }, {
    lastPerformance: {
      'bar press': { sets: [set(46, 9), set(46, 8)] },
      'bar curl': { sets: [set(10, 12)] }
    },
    exerciseBests: { 'bar press': { maxKg: 46, maxE1rm: 46 * (1 + 9 / 30), maxReps: 10, maxSec: 0 } },
    previousVolume: 900,
    elapsedMs: 20 * 60_000
  });
  assert.equal(report.ghostsRaced, 3);
  assert.equal(report.ghostsBeaten, 2);
  assert.equal(report.ghostsMatched, 1);
  assert.equal(report.failureSets, 1);
  assert.equal(report.volume, 460 + 384 + 120);
  assert.equal(report.volumeDeltaPct, 7);
  assert.equal(report.density, 48);
  assert.deepEqual(report.prs.map(pr => pr.name), ['Bar Press']);
  assert.match(report.chadwick, /Bar Press/);
});

test('chadwickLine falls back to honest, earned lines', () => {
  assert.match(chadwickLine({ ghostsRaced: 4, ghostsBeaten: 3 }), /3 of 4 sets/);
  assert.match(chadwickLine({ failureSets: 3 }), /3 sets taken to failure/);
  assert.match(chadwickLine({}), /showed up/);
});
