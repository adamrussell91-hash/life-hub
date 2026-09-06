import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFitnessModel } from '../../apps/life/js/app/fitness-model.js';
import {
  acwrBand,
  buildE1rmVsBest,
  buildFitnessCharts,
  buildMonthRhythm,
  buildTrainWhen,
  buildYearMonths,
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

const volumeSession = (date, kg, overrides = {}) => workout({
  date,
  duration_min: 30,
  exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: kg / 10 }] }],
  ...overrides
});

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

test('trainWhen answers typical time of day instead of scattering clock dots', () => {
  const when = buildTrainWhen([
    volumeSession('2026-07-07', 200, { time: '07:10' }),
    volumeSession('2026-07-14', 200, { time: '07:20' }),
    volumeSession('2026-07-21', 200, { time: '18:40' }),
    volumeSession('2026-07-28', 200, { time: '19:00' }),
    volumeSession('2026-07-30', 200, { time: '19:10' })
  ]);
  assert.equal(when.count, 5);
  assert.equal(when.typicalTime, '18:40');
  assert.equal(when.typicalBand, 'evening');
  assert.equal(when.buckets.find(band => band.key === 'morning').value, 2);
  assert.equal(when.buckets.find(band => band.key === 'evening').value, 3);
  assert.match(when.read, /Usually evenings, around 18:40/);
  assert.match(when.read, /mostly Tue/);
  assert.equal(buildTrainWhen([volumeSession('2026-07-30', 200, { time: '19:00' })]), null);
  assert.equal(buildTrainWhen([volumeSession('2026-07-20', 200), volumeSession('2026-07-30', 200)]), null);
});

test('monthRhythm counts sessions by week and names the longest gap between them', () => {
  const dates = [];
  for (let day = 1; day <= 30; day += 1) dates.push(`2026-07-${String(day).padStart(2, '0')}`);
  const rhythm = buildMonthRhythm([
    volumeSession('2026-07-14', 200),
    volumeSession('2026-07-30', 200)
  ], dates, '2026-07-30');
  assert.equal(rhythm.count, 2);
  assert.equal(rhythm.longestGap, 15);
  assert.match(rhythm.read, /2 sessions in the last 30 days · longest gap 15 days/);
  assert.equal(rhythm.weeks.find(week => week.key === '2026-07-13').value, 1);
  assert.equal(rhythm.weeks.find(week => week.key === '2026-07-27').value, 1);
});

test('e1rmVsBest ranks latest estimate against each lift’s peak', () => {
  const best = buildE1rmVsBest([
    { name: 'Squat', series: [{ date: '2026-07-01', value: 100 }, { date: '2026-07-30', value: 90 }] },
    { name: 'Press', series: [{ date: '2026-07-01', value: 50 }, { date: '2026-07-30', value: 50 }] }
  ]);
  assert.equal(best.lifts[0].label, 'Press');
  assert.equal(best.lifts[0].value, 100);
  assert.equal(best.lifts[1].label, 'Squat');
  assert.equal(best.lifts[1].value, 90);
  assert.match(best.read, /Closest to best: Press · 100%/);
  assert.match(best.read, /furthest Squat · 90%/);
});

test('yearMonths totals completed sessions by calendar month', () => {
  const year = buildYearMonths(events([
    volumeSession('2026-07-24', 200),
    volumeSession('2026-07-30', 200)
  ]), '2026-07-30');
  assert.equal(year.count, 2);
  assert.equal(year.months.find(month => month.label === 'Jul').value, 2);
  assert.equal(year.read, '2 sessions in 2026');
});

test('acwrBand follows the 0.8–1.3 sweet spot', () => {
  assert.equal(acwrBand(0.7), 'low');
  assert.equal(acwrBand(0.8), 'medium');
  assert.equal(acwrBand(1), 'medium');
  assert.equal(acwrBand(1.3), 'medium');
  assert.equal(acwrBand(1.4), 'high');
  assert.equal(acwrBand(null), 'medium');
});

test('training load is weekly tonnage banded by ACWR against the prior 4 weeks', () => {
  const charts = buildFitnessCharts({
    events: events([
      volumeSession('2026-06-22', 200),
      volumeSession('2026-06-29', 200),
      volumeSession('2026-07-06', 200),
      volumeSession('2026-07-13', 200),
      volumeSession('2026-07-20', 200),
      volumeSession('2026-07-30', 400, { duration_min: 90 })
    ]),
    date: '2026-07-30'
  });
  const latest = charts.loadHorizon[0].points.at(-1);
  assert.equal(latest.date, '2026-07-27');
  assert.equal(latest.value, 400);
  assert.equal(latest.ratio, 2);
  assert.equal(latest.band, 'high');
});

test('session duration does not inflate weekly load', () => {
  const charts = buildFitnessCharts({
    events: events([
      volumeSession('2026-07-20', 200, { duration_min: 20 }),
      volumeSession('2026-07-30', 200, { duration_min: 90 })
    ]),
    date: '2026-07-30'
  });
  const points = charts.loadHorizon[0].points.filter(point => point.value > 0);
  assert.equal(points.length, 2);
  assert.equal(points[0].value, 200);
  assert.equal(points[1].value, 200);
});

test('session gauge compares the last session to other sessions in the last 4 weeks', () => {
  const charts = buildFitnessCharts({
    events: events([
      volumeSession('2026-07-02', 200),
      volumeSession('2026-07-16', 200),
      volumeSession('2026-07-30', 100, { duration_min: 90 })
    ]),
    date: '2026-07-30'
  });
  assert.equal(charts.sessionGauge.value, 100);
  assert.equal(charts.sessionGauge.average, 200);
  assert.equal(charts.sessionGauge.pct, 50);
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
