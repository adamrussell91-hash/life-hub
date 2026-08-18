import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStreamPaths } from '../../js/app/chart-kit/stream.js';
import { buildSankeyFlow } from '../../js/app/chart-kit/sankey-flow.js';
import { buildBumpLines } from '../../js/app/chart-kit/bump.js';
import { buildRadialYear } from '../../js/app/chart-kit/radial-year.js';
import { buildHorizonBands } from '../../js/app/chart-kit/horizon.js';
import { buildMoodRadial } from '../../js/app/chart-kit/mood-radial.js';
import { buildThemeOrbit } from '../../js/app/chart-kit/theme-orbit.js';

test('buildStreamPaths returns one path per theme', () => {
  const paths = buildStreamPaths({
    weeks: ['2026-08-03'],
    series: [{ key: 'work', values: [2] }, { key: 'other', values: [1] }]
  }, { width: 320, height: 80 });
  assert.equal(paths.length, 2);
  assert.ok(paths[0].d.startsWith('M') || paths[0].d.includes('L'));
});

test('buildSankeyFlow returns links with width', () => {
  const chart = buildSankeyFlow(
    [{ from: 'low', to: 'good', count: 3 }],
    { width: 320, height: 80 }
  );
  assert.ok(chart.links[0].width > 0);
});

test('buildBumpLines uses rank as y', () => {
  const lines = buildBumpLines(
    [{ week: '2026-08-03', rankByTheme: { work: 1, sleep: 2 } }],
    ['work', 'sleep'],
    { width: 320, height: 80 }
  );
  assert.equal(lines.length, 2);
});

test('buildRadialYear has 365 ticks', () => {
  const ticks = buildRadialYear({ year: 2026, byDate: { '2026-03-01': 'low' } });
  assert.equal(ticks.length, 365);
  assert.equal(ticks[59].mood, 'low');
});

test('buildHorizonBands one band per metric', () => {
  const bands = buildHorizonBands([
    { key: 'mood', points: [{ date: '2026-08-01', value: 6 }] }
  ], { width: 320, height: 24 });
  assert.equal(bands.length, 1);
});

function distanceFromCentre(chart, point) {
  return Math.hypot(point.x - chart.cx, point.y - chart.cy);
}

test('buildMoodRadial is a large square polar chart, four times the old line chart height', () => {
  const chart = buildMoodRadial([], { bounds: { from: '2026-08-10', to: '2026-08-16', days: 7 }, range: 'weekly' });
  assert.equal(chart.width, 592);
  assert.equal(chart.height, 592);
});

test('buildMoodRadial puts a better mood closer to the centre on a fixed 1-10 domain', () => {
  const bounds = { from: '2026-08-10', to: '2026-08-16', days: 7 };
  const mixed = buildMoodRadial(
    [
      { date: '2026-08-10', value: 9, mood: 'great', energy: 'low' },
      { date: '2026-08-11', value: 3, mood: 'bad', energy: 'low' }
    ],
    { bounds, range: 'weekly' }
  );
  const alone = buildMoodRadial(
    [{ date: '2026-08-10', value: 9, mood: 'great', energy: 'low' }],
    { bounds, range: 'weekly' }
  );
  const great = mixed.points.find(point => point.value === 9);
  const rough = mixed.points.find(point => point.value === 3);
  assert.ok(distanceFromCentre(mixed, great) < distanceFromCentre(mixed, rough));
  assert.equal(distanceFromCentre(mixed, great), distanceFromCentre(alone, alone.points[0]));
});

test('buildMoodRadial sizes bubbles by energy and colours by mood', () => {
  const chart = buildMoodRadial(
    [
      { date: '2026-08-10', value: 6, mood: 'good', energy: 'low' },
      { date: '2026-08-11', value: 6, mood: 'good', energy: 'medium' },
      { date: '2026-08-12', value: 6, mood: 'bad', energy: 'high' }
    ],
    { bounds: { from: '2026-08-10', to: '2026-08-16', days: 7 }, range: 'weekly' }
  );
  assert.ok(chart.points[0].r < chart.points[1].r);
  assert.ok(chart.points[1].r < chart.points[2].r);
  assert.equal(chart.points[0].mood, 'good');
  assert.equal(chart.points[2].mood, 'bad');
});

test('buildMoodRadial year view is a calendar clock: Jan at 12 o’clock, July opposite', () => {
  const bounds = { from: '2026-01-01', to: '2026-08-18', days: 230 };
  const chart = buildMoodRadial(
    [
      { date: '2026-01-01', value: 5, mood: 'neutral', energy: 'low' },
      { date: '2026-07-02', value: 5, mood: 'neutral', energy: 'low' }
    ],
    { bounds, range: 'year' }
  );
  const jan = chart.points.find(point => point.date === '2026-01-01');
  const jul = chart.points.find(point => point.date === '2026-07-02');
  assert.ok(Math.abs(jan.x - chart.cx) < 1, 'Jan 1 should sit on the 12 o’clock axis');
  assert.ok(jan.y < chart.cy, 'Jan 1 should sit above centre');
  assert.ok(Math.abs(jul.x - chart.cx) < 2, 'early July should sit on the 6 o’clock axis');
  assert.ok(jul.y > chart.cy, 'early July should sit below centre');
  assert.deepEqual(chart.angleTicks.map(tick => tick.label), [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]);
});

test('buildMoodRadial weekly, monthly, and six-month views label the window around the rim', () => {
  const weekly = buildMoodRadial([], {
    bounds: { from: '2026-08-10', to: '2026-08-16', days: 7 },
    range: 'weekly'
  });
  assert.deepEqual(weekly.angleTicks.map(tick => tick.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

  const monthly = buildMoodRadial([], {
    bounds: { from: '2026-07-20', to: '2026-08-18', days: 30 },
    range: 'monthly'
  });
  assert.ok(monthly.angleTicks.length >= 4);
  assert.equal(monthly.angleTicks[0].label, '20 Jul');

  const sixMonth = buildMoodRadial([], {
    bounds: { from: '2026-02-18', to: '2026-08-18', days: 182 },
    range: 'six_month'
  });
  assert.ok(sixMonth.angleTicks.map(tick => tick.label).includes('Mar'));
  assert.ok(sixMonth.angleTicks.map(tick => tick.label).includes('Aug'));
});

test('buildMoodRadial draws a dashed average ring from the scores in range', () => {
  const chart = buildMoodRadial(
    [
      { date: '2026-08-10', value: 4, mood: 'low', energy: 'low' },
      { date: '2026-08-12', value: 8, mood: 'good', energy: 'medium' }
    ],
    { bounds: { from: '2026-08-10', to: '2026-08-16', days: 7 }, range: 'weekly' }
  );
  assert.equal(chart.averageScore, 6);
  const mid = buildMoodRadial(
    [{ date: '2026-08-10', value: 6, mood: 'neutral', energy: 'low' }],
    { bounds: { from: '2026-08-10', to: '2026-08-16', days: 7 }, range: 'weekly' }
  );
  assert.equal(chart.averageRadius, mid.points[0].radius);
});

test('buildMoodRadial keeps rings and ticks when the series is empty', () => {
  const chart = buildMoodRadial([], { bounds: { from: '2026-08-01', to: '2026-08-10', days: 10 }, range: 'monthly' });
  assert.equal(chart.points.length, 0);
  assert.equal(chart.averageRadius, null);
  assert.ok(chart.rings.length >= 4);
  assert.ok(chart.angleTicks.length >= 2);
});

function orbitStar(chart, key) {
  return chart.stars.find(star => star.key === key);
}

test('buildThemeOrbit puts more-mentioned themes closer to the centre on the same arm', () => {
  const chart = buildThemeOrbit([
    { key: 'work', label: 'Work', value: 14, prevValue: 12, meanMood: 4 },
    { key: 'health', label: 'Health', value: 6, prevValue: 5, meanMood: 4 }
  ]);
  const work = orbitStar(chart, 'work');
  const health = orbitStar(chart, 'health');
  assert.equal(work.arm, 'weighing');
  assert.equal(health.arm, 'weighing');
  assert.ok(work.radiusFromCentre < health.radiusFromCentre);
  assert.ok(work.r > health.r);
});

test('buildThemeOrbit marks rising and falling against the previous window', () => {
  const chart = buildThemeOrbit([
    { key: 'gratitude', label: 'Gratitude', value: 8, prevValue: 3, meanMood: 8 },
    { key: 'stress', label: 'Stress', value: 2, prevValue: 6, meanMood: 3 },
    { key: 'school', label: 'School', value: 4, prevValue: 4, meanMood: 6 }
  ]);
  assert.equal(orbitStar(chart, 'gratitude').arm, 'lifting');
  assert.equal(orbitStar(chart, 'gratitude').rising, true);
  assert.equal(orbitStar(chart, 'stress').falling, true);
  assert.equal(orbitStar(chart, 'school').arm, 'mixed');
  assert.equal(orbitStar(chart, 'school').rising, false);
  assert.equal(orbitStar(chart, 'school').falling, false);
  assert.equal(chart.total, 14);
  assert.equal(chart.top.key, 'gratitude');
});

test('buildThemeOrbit keeps three arms and an empty chart still has rings', () => {
  const empty = buildThemeOrbit([]);
  assert.equal(empty.empty, true);
  assert.equal(empty.stars.length, 0);
  assert.equal(empty.arms.length, 3);
  assert.ok(empty.rings.length >= 3);
});
