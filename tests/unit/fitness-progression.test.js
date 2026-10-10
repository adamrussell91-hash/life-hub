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

import {
  buildLastCircuits,
  circuitFamilyKey,
  compareCircuitGhost,
  isCircuitMember
} from '../../apps/life/js/app/fitness-progression.js';

test('Cindy family keys fold Pump & Dump nicknames onto one ghost lane', () => {
  assert.equal(circuitFamilyKey('Cindy'), 'cindy');
  assert.equal(circuitFamilyKey('Pump & Dump finisher'), 'cindy');
  assert.equal(circuitFamilyKey('Pump & Dump'), 'cindy');
});

test('circuit ghosts race whole-circuit score, not per-move reps', () => {
  assert.deepEqual(
    compareCircuitGhost({ rounds: 5, time_sec: 180 }, { rounds: 3, time_sec: 180 }, 'amrap'),
    { verdict: 'beat', label: '+2 rounds' }
  );
  assert.deepEqual(
    compareCircuitGhost({ rounds: 3, time_sec: 96 }, { rounds: 3, time_sec: 110 }, 'for_time'),
    { verdict: 'beat', label: '−14s' }
  );
  const cindy = [
    { name: 'Push Up', tracking: 'bodyweight_reps', superset_group: 1, superset_label: 'Cindy',
      block: { kind: 'circuit', format: 'amrap', time_cap_sec: 180, result: { rounds: 5, time_sec: 180 } },
      sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }] },
    { name: 'Bench Dip', tracking: 'bodyweight_reps', superset_group: 1, sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }] }
  ];
  assert.equal(isCircuitMember(cindy[0], cindy), true);
  assert.equal(isCircuitMember(cindy[1], cindy), true);
  const report = buildPumpReport({ title: 'Cindy night', exercises: cindy }, {
    lastPerformance: {
      'push up': { sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }] },
      'bench dip': { sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }] }
    },
    lastCircuits: {
      cindy: { label: 'Pump & Dump', date: '2026-10-06', format: 'amrap', result: { rounds: 3, time_sec: 180 } }
    }
  });
  assert.equal(report.ghostsRaced, 1, 'one circuit ghost, not ten fixed-rep set ghosts');
  assert.equal(report.ghostsBeaten, 1);
  assert.equal(report.circuits[0].ghost.verdict, 'beat');
});

test('buildLastCircuits keeps the latest Cindy score under the family key', () => {
  const circuits = buildLastCircuits([
    done('2026-10-04', {
      exercises: [{
        name: 'Push Up', superset_group: 1, superset_label: 'Cindy',
        block: { kind: 'circuit', format: 'for_time', result: { rounds: 3, time_sec: 96 } },
        sets: [{ reps: 5 }]
      }]
    }),
    done('2026-10-06', {
      exercises: [{
        name: 'Push Up', superset_group: 1, superset_label: 'Pump & Dump',
        block: { kind: 'circuit', format: 'amrap', time_cap_sec: 180, result: { rounds: 5, time_sec: 180 } },
        sets: [{ reps: 5 }]
      }]
    })
  ], '2026-10-10');
  assert.equal(circuits.cindy.result.rounds, 5);
  assert.equal(circuits.cindy.label, 'Pump & Dump');
});

test('chadwickLine falls back to honest, earned lines', () => {
  assert.match(chadwickLine({ ghostsRaced: 4, ghostsBeaten: 3 }), /3 of 4 sets/);
  assert.match(chadwickLine({ failureSets: 3 }), /3 sets taken to failure/);
  assert.match(chadwickLine({}), /showed up/);
});

import {
  buildBenchmarkWall,
  buildSeasonStatus,
  buildWeekStreak,
  focusCue,
  lighterLoad,
  readinessAdvice,
  restWins
} from '../../apps/life/js/app/fitness-progression.js';

const done = (date, extra = {}) => ({ record: { type: 'workout', status: 'completed', session_kind: 'strength', date, title: `S ${date}`, exercises: [], ...extra } });

test('week streak counts 3-session weeks and freezes an illness week instead of breaking', () => {
  const events = [
    // week of 14 Sep: 3 sessions
    done('2026-09-14'), done('2026-09-16'), done('2026-09-18'),
    // week of 21 Sep: sick — 1 session + a skipped-for-flu day
    done('2026-09-21'),
    { record: { type: 'workout', status: 'skipped', date: '2026-09-23', title: 'Push', notes: 'Skipped — flu, Sara cancelled training' } },
    // week of 28 Sep: 3 sessions (a walk doesn't count)
    done('2026-09-28'), done('2026-09-30'), done('2026-10-02'), done('2026-10-03', { session_kind: 'walk' }),
    // this week (5 Oct): 1 so far
    done('2026-10-05')
  ];
  const streak = buildWeekStreak(events, '2026-10-07');
  assert.equal(streak.current, 2, 'this week in progress, 28 Sep hit, 21 Sep frozen, 14 Sep hit');
  assert.equal(streak.protectedWeeks, 1);
  assert.equal(streak.thisWeek.sessions, 1);
  assert.equal(streak.thisWeek.remaining, 2);
  assert.equal(streak.thisWeek.daysLeft, 4);
  const broken = buildWeekStreak([done('2026-09-14'), done('2026-09-16'), done('2026-09-18'), done('2026-09-28')], '2026-10-07');
  assert.equal(broken.current, 0, 'a lazy week (not sick) breaks it');
  assert.equal(broken.longest, 1);
});

test('season status reads the stamped season and where we are in it', () => {
  const season = { name: 'Season 3: Operation V-Taper', start: '2026-09-28', weeks: 6, mission: 'Widen the lats' };
  const status = buildSeasonStatus([
    done('2026-09-28', { season: { ...season, benchmark: true } }),
    done('2026-10-02', { season })
  ], '2026-10-07');
  assert.equal(status.name, 'Season 3: Operation V-Taper');
  assert.equal(status.week, 2);
  assert.equal(status.sessions, 2);
  assert.equal(status.benchmarkSessions, 1);
  assert.equal(status.daysLeft, 32);
  assert.equal(buildSeasonStatus([done('2026-01-05', { season: { ...season, start: '2026-01-05' } })], '2026-10-07'), null, 'a long-finished season disappears');
});

test('benchmark wall tracks circuits by label, rep tests, flagged lifts and AEKE score', () => {
  const cindy = time => ({
    name: 'Push Up', superset_group: 1, superset_label: 'Cindy',
    block: { kind: 'circuit', format: 'for_time', result: { rounds: 3, time_sec: time } },
    sets: [{ reps: 5 }]
  });
  const wall = buildBenchmarkWall([
    done('2026-09-20', { exercises: [cindy(110), { name: 'Push-ups', tracking: 'reps_in_time', sets: [{ reps: 25, time_cap_sec: 60 }] }], aeke: { score: 90 } }),
    done('2026-10-04', { exercises: [cindy(96), { name: 'Bar Press', benchmark: true, sets: [{ weight_kg: 46, reps: 8 }] }], aeke: { score: 99 } })
  ], '2026-10-07');
  const circuit = wall.find(row => row.name.startsWith('Cindy'));
  assert.equal(circuit.better, 'lower');
  assert.equal(circuit.latest.label, '1:36');
  assert.equal(circuit.improved, true);
  assert.equal(circuit.isBest, true);
  assert.ok(wall.find(row => row.name === 'Push-ups in 60s'));
  assert.ok(wall.find(row => row.key === 'lift:bar press'));
  assert.equal(wall.find(row => row.key === 'aeke:score').latest.value, 99);
});

test('readiness advice and the lighter load', () => {
  assert.equal(readinessAdvice({ sleep: 2, soreness: 2, energy: 3 }).adjusted, 'lighter');
  assert.equal(readinessAdvice({ sleep: 5, soreness: 1, energy: 5 }).adjusted, 'lighter', 'any 1 means go easy');
  assert.equal(readinessAdvice({ sleep: 5, soreness: 4, energy: 5 }).adjusted, 'push');
  assert.equal(readinessAdvice({ sleep: 3, soreness: 4, energy: 3 }).adjusted, 'as_planned');
  assert.equal(readinessAdvice({ sleep: 3 }), null);
  assert.equal(lighterLoad(46), 41.5);
});

test('focus cues: Chadwick wins, isolation internal, compound external', () => {
  assert.deepEqual(focusCue({ name: 'Bar Curl', coach_cues: { focus: 'Pin the elbows.' } }), { kind: 'coach', text: 'Pin the elbows.' });
  assert.equal(focusCue({ name: 'Cable Bar Wide Grip Curl' }).kind, 'internal');
  assert.equal(focusCue({ name: 'Bar Press' }).kind, 'external');
  assert.equal(focusCue({ name: 'Bar Hip Thrust' }).kind, 'external');
  assert.equal(focusCue({ name: 'Downward Dog' }), null);
});

test('rest wins are built only from real numbers', () => {
  const wins = restWins({
    exercise: { name: 'Bar Press' },
    bests: { 'bar press': { firstDate: '2026-03-12', firstKg: 32, maxKg: 46 } },
    buildBoard: [{ label: 'Chest', done: 9, target: 12, today: 4, todayDone: 3 }],
    weekStreak: { current: 4 },
    ghostsBeaten: 2,
    prsToday: 1
  });
  assert.deepEqual(wins, [
    '1 personal best already today.',
    'Ghosts beaten so far: 2. Keep the run going.',
    'Bar Press: 32 kg → 46 kg since 12/03/26.',
    'Chest target for the week: done (12/12).',
    '4-week streak. This session protects it.'
  ]);
  assert.deepEqual(restWins({}), []);
});
