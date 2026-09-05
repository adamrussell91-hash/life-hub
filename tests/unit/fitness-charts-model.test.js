import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFitnessModel } from '../../apps/life/js/app/fitness-model.js';
import {
  buildFitnessCharts,
  classifyPushPull,
  classifyRepRange,
  longestCompletedStreak,
  setCount
} from '../../apps/life/js/app/fitness-charts-model.js';

const workout = (overrides) => ({
  type: 'workout',
  date: '2026-07-30',
  title: 'Chest and Curls',
  focus: ['chest', 'arms'],
  duration_min: 26,
  status: 'completed',
  recovery_flag_next_day: false,
  exercises: [
    { name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32 }, { reps: 8, weight_kg: 34 }] },
    { name: 'Bicep Curl', sets: [{ reps: 12, weight_kg: 12 }] }
  ],
  pain_flags: [],
  ...overrides
});

const events = records => records.map(record => ({ record, body: '', path: '', legacy: false }));

test('classifyRepRange buckets working sets', () => {
  assert.equal(classifyRepRange(5).key, '1-5');
  assert.equal(classifyRepRange(8).key, '6-8');
  assert.equal(classifyRepRange(10).key, '9-12');
  assert.equal(classifyRepRange(15).key, '13+');
  assert.equal(classifyRepRange(0), null);
});

test('classifyPushPull uses name before region', () => {
  assert.equal(classifyPushPull({ name: 'Chest Press' }), 'push');
  assert.equal(classifyPushPull({ name: 'Bicep Curl' }), 'pull');
  assert.equal(classifyPushPull({ name: 'Seated Row' }), 'pull');
  assert.equal(classifyPushPull({ name: 'Mystery' }, ['chest']), 'push');
});

test('longestCompletedStreak counts consecutive calendar days', () => {
  assert.equal(longestCompletedStreak(['2026-07-28', '2026-07-29', '2026-07-30']), 3);
  assert.equal(longestCompletedStreak(['2026-07-20', '2026-07-30']), 1);
  assert.equal(longestCompletedStreak([]), 0);
});

test('one completed session fills pies and rings, not empty trend cards', () => {
  const model = buildFitnessModel({
    events: events([workout()]),
    date: '2026-07-30'
  });
  const charts = model.charts;
  assert.equal(charts.weekRing.value, 1);
  assert.equal(charts.weekRing.target, 4);
  assert.equal(charts.longestStreak, 1);
  assert.equal(charts.uniqueLifts, 2);
  assert.equal(setCount(workout()), 3);
  assert.ok(charts.volumePerSetKg > 0);
  assert.equal(charts.skipRing.missed, 0);
  assert.equal(charts.skipRing.completed, 1);
  assert.equal(charts.recoveryRing.flagged, 0);
  assert.ok(charts.repRanges.some(item => item.key === '9-12' && item.value === 2));
  assert.ok(charts.repRanges.some(item => item.key === '6-8' && item.value === 1));
  assert.equal(charts.repRead, 'Mostly Hypertrophy');
  assert.ok(!charts.repRanges.some(item => String(item.colour).includes('--navy-2') || String(item.colour).includes('--high-sea)')));
  assert.ok(charts.focusChord.length >= 1);
  assert.ok(charts.libraryMap?.nodes?.length >= 2);
  assert.ok(charts.libraryMap.edges.some(edge => edge.count >= 1));
  assert.ok(charts.regionVolume.some(item => item.key === 'chest' && item.value > 0));
  assert.ok(charts.regionVolume.some(item => item.key === 'arms' && item.value > 0));
  assert.deepEqual(charts.pushPull.map(item => item.key).sort(), ['pull', 'push']);
  assert.equal(charts.restCounts.trained, 1);
  assert.equal(charts.restCounts.rest, 29);
  assert.equal(charts.e1rmTrends.length, 0);
  assert.equal(charts.volumePerSetWeeks.length, 0);
  assert.equal(charts.durationSeries.length, 0);
  assert.equal(charts.distanceSeries.length, 0);
  assert.equal(charts.hrSeries.length, 0);
  assert.equal(charts.painBySite.length, 0);
});

test('e1RM trend and pain flags appear only when history exists', () => {
  const charts = buildFitnessCharts({
    events: events([
      workout({
        date: '2026-07-20',
        pain_flags: [{ site: 'right AC', note: 'twinge' }],
        exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 30 }] }]
      }),
      workout({
        date: '2026-07-30',
        recovery_flag_next_day: true,
        exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 34 }] }]
      }),
      workout({ date: '2026-07-18', status: 'skipped', exercises: [] }),
      workout({ date: '2026-07-19', status: 'planned', title: 'Missed', exercises: [] })
    ]),
    date: '2026-07-30',
    weekCompletedCount: 1,
    weekTarget: 4
  });
  assert.equal(charts.e1rmTrends.length, 1);
  assert.equal(charts.e1rmTrends[0].name, 'Chest Press');
  assert.equal(charts.e1rmTrends[0].series.length, 2);
  assert.equal(charts.e1rmTrends[0].current, charts.e1rmTrends[0].series[1].value);
  assert.equal(charts.e1rmTrends[0].previous, charts.e1rmTrends[0].series[0].value);
  assert.ok(charts.e1rmTrends[0].delta > 0);
  assert.equal(charts.painBySite[0].site, 'right AC');
  assert.equal(charts.recoveryRing.flagged, 1);
  assert.equal(charts.recoveryFlags.length, 1);
  assert.equal(charts.recoveryFlags[0].title, 'Chest and Curls');
  assert.equal(charts.skipRing.skipped, 1);
  assert.equal(charts.skipRing.pastDue, 1);
  assert.equal(charts.skipRing.missed, 2);
  assert.equal(charts.trainedMarks.length, 30);
  assert.equal(charts.trainedMarks.filter(day => day.trained).length, 2);
});

test('longest streak uses history outside the 30-day pie window', () => {
  const model = buildFitnessModel({
    events: events([workout({ date: '2026-07-30' })]),
    date: '2026-09-05'
  });
  assert.equal(model.streak, 1);
  assert.equal(model.charts.longestStreak, 1);
  assert.equal(model.charts.repRanges.length, 0);
  assert.equal(model.charts.restRatio.length, 0);
});

test('distance, pace, and HR series stay empty without those fields', () => {
  const charts = buildFitnessCharts({
    events: events([
      workout({ date: '2026-07-20', distance_km: 3, duration_min: 36, avg_hr: 120 }),
      workout({ date: '2026-07-30', distance_km: 4, duration_min: 40, avg_hr: 128 })
    ]),
    date: '2026-07-30'
  });
  assert.equal(charts.distanceSeries.length, 2);
  assert.equal(charts.paceSeries.length, 2);
  assert.equal(charts.hrSeries.length, 2);
  assert.equal(charts.durationSeries.length, 2);
  assert.deepEqual(charts.sessionReadings.map(row => row.key), ['duration', 'distance', 'pace', 'hr']);
  assert.equal(charts.sessionReadings.find(row => row.key === 'hr').current, 128);
  assert.equal(charts.sessionReadings.find(row => row.key === 'hr').delta, 8);
});
