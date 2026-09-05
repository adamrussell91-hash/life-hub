import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStreamPaths, buildThemeTopography } from '../../apps/life/js/app/chart-kit/stream.js';
import { buildSankeyFlow } from '../../apps/life/js/app/chart-kit/sankey-flow.js';
import { buildBumpLines, buildBumpChart } from '../../apps/life/js/app/chart-kit/bump.js';
import { buildRadialYear } from '../../apps/life/js/app/chart-kit/radial-year.js';
import { buildHorizonBands, buildMetricStrip, buildGroupedMetricBars } from '../../apps/life/js/app/chart-kit/horizon.js';
import { buildMoodRadial } from '../../apps/life/js/app/chart-kit/mood-radial.js';
import { buildEnergyOrbit } from '../../apps/life/js/app/chart-kit/energy-orbit.js';
import { CLINICAL_CHART_SLOTS } from '../../apps/life/js/app/chart-kit/clinical-slots.js';
import { buildWatchlistHeat } from '../../apps/life/js/app/chart-kit/watchlist-heat.js';
import { buildThemeOrbit } from '../../apps/life/js/app/chart-kit/theme-orbit.js';
import { buildThemeConstellation } from '../../apps/life/js/app/chart-kit/theme-constellation.js';

test('Clinical Glass chart slots stay on the approved Life Hub tokens', () => {
  assert.deepEqual(CLINICAL_CHART_SLOTS, [
    'var(--wave)',
    'var(--marine)',
    'var(--success)',
    'var(--danger)',
    'var(--high-sea-ink)',
    'var(--pastel-sage-ink)',
    'var(--pastel-peach-ink)',
    'var(--muted)'
  ]);
  assert.ok(!CLINICAL_CHART_SLOTS.includes('var(--high-sea)'));
  assert.ok(!CLINICAL_CHART_SLOTS.includes('var(--navy-2)'));
});

test('buildStreamPaths returns one path per theme', () => {
  const paths = buildStreamPaths({
    weeks: ['2026-08-03'],
    series: [{ key: 'work', values: [2] }, { key: 'other', values: [1] }]
  }, { width: 320, height: 80 });
  assert.equal(paths.length, 2);
  assert.ok(paths[0].d.startsWith('M') || paths[0].d.includes('L'));
});

test('buildThemeTopography adds more contours where a theme swells', () => {
  const chart = buildThemeTopography({
    weeks: ['2026-07-20', '2026-07-27', '2026-08-03'],
    series: [
      { key: 'work', values: [1, 8, 2] },
      { key: 'sleep', values: [1, 1, 1] }
    ]
  });
  const work = chart.bands.find(band => band.key === 'work');
  const sleep = chart.bands.find(band => band.key === 'sleep');
  assert.ok(work.contours.length > sleep.contours.length);
  const peak = work.samples.find(sample => sample.week === '2026-07-27');
  assert.equal(peak.peak, true);
  assert.equal(peak.dir, 'up');
  assert.ok(chart.weeks.at(-1).now);
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

test('buildBumpChart puts rank 1 at the top and sizes dots by weekly count', () => {
  const chart = buildBumpChart({
    ranks: [
      { week: '2026-07-27', rankByTheme: { work: 2, sleep: 1 } },
      { week: '2026-08-03', rankByTheme: { work: 1, sleep: 2 } }
    ],
    weekly: {
      weeks: ['2026-07-27', '2026-08-03'],
      themes: ['work', 'sleep'],
      series: [
        { key: 'work', values: [1, 4] },
        { key: 'sleep', values: [3, 1] }
      ]
    },
    themes: ['work', 'sleep']
  });
  const work = chart.lines.find(line => line.key === 'work');
  const sleep = chart.lines.find(line => line.key === 'sleep');
  assert.ok(work.points[1].y < work.points[0].y);
  assert.ok(work.points[1].r > work.points[0].r);
  assert.equal(work.dir, 'up');
  assert.equal(sleep.dir, 'down');
  assert.ok(chart.ranks[0].y < chart.ranks[1].y);
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

test('buildGroupedMetricBars pairs mood and energy per day and buckets year to weeks', () => {
  const daily = buildGroupedMetricBars({
    bounds: { from: '2026-08-10', to: '2026-08-12', days: 3 },
    range: 'weekly',
    mood: [{ date: '2026-08-10', value: 9, mood: 'great' }],
    energy: [{ date: '2026-08-10', energy: 'high' }, { date: '2026-08-11', energy: 'low' }]
  });
  assert.equal(daily.bucket, 'day');
  assert.equal(daily.columns.length, 2);
  const first = daily.columns[0];
  assert.equal(first.date, '2026-08-10');
  assert.ok(first.mood.height > 0);
  assert.ok(first.energy.height > 0);
  assert.equal(first.mood.key, 'great');

  const year = buildGroupedMetricBars({
    bounds: { from: '2026-01-05', to: '2026-01-18', days: 14 },
    range: 'year',
    mood: [
      { date: '2026-01-06', value: 8, mood: 'good' },
      { date: '2026-01-13', value: 3, mood: 'low' }
    ],
    energy: [
      { date: '2026-01-06', energy: 'high' },
      { date: '2026-01-13', energy: 'low' }
    ]
  });
  assert.equal(year.bucket, 'week');
  assert.ok(year.columns.length <= 3);
});

test('buildMetricStrip maps mood score and energy onto high/medium/low day ticks', () => {
  const chart = buildMetricStrip({
    bounds: { from: '2026-08-10', to: '2026-08-16', days: 7 },
    range: 'weekly',
    mood: [
      { date: '2026-08-10', value: 9 },
      { date: '2026-08-12', value: 3 }
    ],
    energy: [
      { date: '2026-08-10', energy: 'high' },
      { date: '2026-08-12', energy: 'low' }
    ]
  });
  assert.equal(chart.days.length, 7);
  const mood = chart.bands.find(band => band.key === 'mood');
  const energy = chart.bands.find(band => band.key === 'energy');
  const highMood = mood.ticks.find(tick => tick.date === '2026-08-10');
  const lowMood = mood.ticks.find(tick => tick.date === '2026-08-12');
  assert.equal(highMood.level, 'high');
  assert.equal(lowMood.level, 'low');
  assert.ok(highMood.height > lowMood.height);
  assert.ok(highMood.opacity > lowMood.opacity);
  const highEnergy = energy.ticks.find(tick => tick.date === '2026-08-10');
  const lowEnergy = energy.ticks.find(tick => tick.date === '2026-08-12');
  assert.ok(highEnergy.height > lowEnergy.height);
  assert.equal(mood.ticks.filter(tick => tick.date === '2026-08-11').length, 0);
});

test('buildMetricStrip summarises mood stability and energy vs the previous window', () => {
  const chart = buildMetricStrip({
    bounds: { from: '2026-08-10', to: '2026-08-16', days: 7 },
    range: 'weekly',
    mood: [
      { date: '2026-08-10', value: 6 },
      { date: '2026-08-11', value: 6 },
      { date: '2026-08-12', value: 6 }
    ],
    energy: [
      { date: '2026-08-10', energy: 'low' },
      { date: '2026-08-11', energy: 'low' }
    ],
    previousMood: [
      { date: '2026-08-03', value: 6 },
      { date: '2026-08-04', value: 6 }
    ],
    previousEnergy: [
      { date: '2026-08-03', energy: 'high' },
      { date: '2026-08-04', energy: 'high' }
    ]
  });
  assert.equal(chart.summary.mood, 'Mostly stable');
  assert.equal(chart.summary.energy, 'Lower than last period');
  assert.equal(chart.summary.energyDir, 'down');
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

test('buildEnergyOrbit parks high energy on the outer ring and low on the inner', () => {
  const bounds = { from: '2026-08-10', to: '2026-08-16', days: 7 };
  const chart = buildEnergyOrbit(
    [
      { date: '2026-08-10', energy: 'high' },
      { date: '2026-08-11', energy: 'medium' },
      { date: '2026-08-12', energy: 'low' }
    ],
    { bounds, range: 'weekly' }
  );
  const high = chart.points.find(point => point.energy === 'high');
  const medium = chart.points.find(point => point.energy === 'medium');
  const low = chart.points.find(point => point.energy === 'low');
  assert.ok(distanceFromCentre(chart, high) > distanceFromCentre(chart, medium));
  assert.ok(distanceFromCentre(chart, medium) > distanceFromCentre(chart, low));
  assert.deepEqual(chart.rings.map(ring => ring.key), ['high', 'medium', 'low']);
});

test('buildEnergyOrbit summarises the dominant level against the previous window', () => {
  const bounds = { from: '2026-08-10', to: '2026-08-16', days: 7 };
  const chart = buildEnergyOrbit(
    [
      { date: '2026-08-10', energy: 'low' },
      { date: '2026-08-11', energy: 'low' },
      { date: '2026-08-12', energy: 'medium' }
    ],
    {
      bounds,
      range: 'weekly',
      previous: [
        { date: '2026-08-03', energy: 'high' },
        { date: '2026-08-04', energy: 'high' }
      ]
    }
  );
  assert.equal(chart.headline.status, 'Mostly Low');
  assert.equal(chart.headline.period, 'Past 7 days');
  assert.equal(chart.headline.trend, 'Lower than last period');
  assert.equal(chart.legend, 'A week in motion. Each day lands on the level that best reflects your energy.');
});

test('buildEnergyOrbit paints shaded sectors for the longest high and low runs', () => {
  const series = [];
  for (let day = 11; day <= 22; day += 1) {
    series.push({ date: `2026-01-${day}`, energy: 'high' });
  }
  for (let day = 18; day <= 30; day += 1) {
    series.push({ date: `2026-04-${String(day).padStart(2, '0')}`, energy: 'low' });
  }
  for (let day = 7; day <= 20; day += 1) {
    series.push({ date: `2026-08-${String(day).padStart(2, '0')}`, energy: 'high' });
  }
  const chart = buildEnergyOrbit(series, {
    bounds: { from: '2026-01-01', to: '2026-08-20', days: 232 },
    range: 'year'
  });
  assert.equal(chart.callouts, undefined);
  const titles = chart.sectors.map(item => item.title);
  assert.ok(titles.includes('High period'));
  assert.ok(titles.includes('Low streak'));
  assert.ok(titles.includes('Elevated stretch'));
  const high = chart.sectors.find(item => item.title === 'High period');
  assert.match(high.when, /Jan 11/);
  assert.match(high.when, /Jan 22/);
  assert.ok(high.d.startsWith('M'));
  assert.ok(Number.isFinite(high.thetaStart));
  assert.ok(high.thetaEnd > high.thetaStart);
  const streakDays = chart.points.filter(point => point.r > 4);
  assert.ok(streakDays.length >= 3);
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

test('buildThemeConstellation keeps a single co-occurrence when minEdgeCount is 1', () => {
  const dropped = buildThemeConstellation({
    nodes: [
      { key: 'chest-press', count: 1, colour: 'var(--wave)' },
      { key: 'curl', count: 1, colour: 'var(--marine)' }
    ],
    edges: [{ themeA: 'chest-press', themeB: 'curl', count: 1 }]
  });
  assert.equal(dropped.edges.length, 0);
  assert.equal(dropped.nodes.find(node => node.key === 'chest-press').colour, 'var(--wave)');

  const kept = buildThemeConstellation({
    nodes: [
      { key: 'chest-press', count: 1, colour: 'var(--wave)' },
      { key: 'curl', count: 1, colour: 'var(--marine)' }
    ],
    edges: [{ themeA: 'chest-press', themeB: 'curl', count: 1 }],
    minEdgeCount: 1
  });
  assert.equal(kept.edges.length, 1);
  assert.equal(kept.nodes.find(node => node.key === 'curl').colour, 'var(--marine)');
});

test('buildThemeConstellation lays themes on a baseline and raises stronger arcs', () => {
  const chart = buildThemeConstellation({
    nodes: [
      { key: 'work', count: 12 },
      { key: 'sleep', count: 3 }
    ],
    edges: [{ themeA: 'sleep', themeB: 'work', count: 3 }]
  });
  const work = chart.nodes.find(node => node.key === 'work');
  const sleep = chart.nodes.find(node => node.key === 'sleep');
  assert.equal(work.y, sleep.y);
  assert.ok(work.r > sleep.r);
  assert.equal(chart.edges.length, 1);
  assert.match(chart.edges[0].d, /^M.+Q.+/);
  assert.ok(Math.abs(chart.edges[0].controlY - work.y) > 20);
});

test('buildThemeConstellation recentres a focus theme and keeps stronger neighbours closer', () => {
  const chart = buildThemeConstellation({
    nodes: [
      { key: 'work', count: 10 },
      { key: 'stress', count: 8 },
      { key: 'gratitude', count: 4 }
    ],
    edges: [
      { themeA: 'stress', themeB: 'work', count: 8 },
      { themeA: 'gratitude', themeB: 'work', count: 2 }
    ],
    focus: 'work'
  });
  const work = chart.nodes.find(node => node.key === 'work');
  const stress = chart.nodes.find(node => node.key === 'stress');
  const gratitude = chart.nodes.find(node => node.key === 'gratitude');
  assert.ok(Math.abs(work.x - chart.cx) < 1);
  assert.ok(Math.abs(stress.x - work.x) < Math.abs(gratitude.x - work.x));
});

test('buildThemeConstellation two-hop neighbourhood hides unrelated themes', () => {
  const chart = buildThemeConstellation({
    nodes: [
      { key: 'work', count: 8 },
      { key: 'stress', count: 6 },
      { key: 'burnout', count: 5 },
      { key: 'gardening', count: 4 }
    ],
    edges: [
      { themeA: 'stress', themeB: 'work', count: 5 },
      { themeA: 'burnout', themeB: 'stress', count: 4 }
    ],
    focus: 'work',
    hops: 2
  });
  assert.deepEqual(chart.nodes.map(node => node.key).sort(), ['burnout', 'stress', 'work']);
});

test('buildThemeConstellation compare keeps vanished pairings as faint ghosts', () => {
  const chart = buildThemeConstellation({
    nodes: [
      { key: 'work', count: 6 },
      { key: 'stress', count: 5 },
      { key: 'sleep', count: 4 }
    ],
    edges: [{ themeA: 'stress', themeB: 'work', count: 4 }],
    previousEdges: [
      { themeA: 'stress', themeB: 'work', count: 2 },
      { themeA: 'sleep', themeB: 'work', count: 3 }
    ],
    compare: true
  });
  assert.equal(chart.edges[0].change, 'up');
  assert.equal(chart.ghosts.length, 1);
  assert.equal(chart.ghosts[0].themeA, 'sleep');
  assert.equal(chart.ghosts[0].change, 'ghost');
});

test('buildThemeConstellation marks pairings that were absent last period', () => {
  const chart = buildThemeConstellation({
    nodes: [
      { key: 'teaching', count: 6 },
      { key: 'workload', count: 5 },
      { key: 'sleep', count: 4 }
    ],
    edges: [
      { themeA: 'sleep', themeB: 'teaching', count: 2 },
      { themeA: 'teaching', themeB: 'workload', count: 4 }
    ],
    previousEdges: [
      { themeA: 'sleep', themeB: 'teaching', count: 2 }
    ]
  });
  const next = chart.edges.find(edge => edge.themeA === 'teaching' && edge.themeB === 'workload');
  const kept = chart.edges.find(edge => edge.themeA === 'sleep' && edge.themeB === 'teaching');
  assert.equal(next.newer, true);
  assert.equal(kept.newer, false);
  assert.equal(chart.nodes.find(node => node.key === 'workload').rising, true);
  assert.equal(chart.nodes.find(node => node.key === 'sleep').rising, false);
});

test('buildWatchlistHeat scales each term to its own busiest week', () => {
  const chart = buildWatchlistHeat([
    {
      term: 'should',
      points: [
        { date: '2026-05-04', count: 2 },
        { date: '2026-05-11', count: 8 },
        { date: '2026-05-18', count: 0 }
      ]
    },
    {
      term: 'flake',
      points: [
        { date: '2026-05-04', count: 1 },
        { date: '2026-05-11', count: 1 },
        { date: '2026-05-18', count: 1 }
      ]
    }
  ]);
  const should = chart.rows.find(row => row.term === 'should');
  const flake = chart.rows.find(row => row.term === 'flake');
  assert.equal(should.cells[2].zero, true);
  assert.equal(should.cells[2].mix, 0);
  assert.ok(should.cells[1].mix > should.cells[0].mix);
  assert.equal(should.cells[1].mix, 100);
  assert.equal(flake.cells[0].mix, flake.cells[1].mix);
  assert.equal(should.colour, 'var(--wave)');
  assert.equal(chart.weeks.length, 3);
});

test('buildWatchlistHeat marks a drop across the window as down', () => {
  const chart = buildWatchlistHeat([
    {
      term: 'just',
      points: [
        { date: '2026-06-01', count: 8 },
        { date: '2026-06-08', count: 7 },
        { date: '2026-06-15', count: 2 },
        { date: '2026-06-22', count: 1 }
      ]
    }
  ]);
  assert.equal(chart.rows[0].delta.dir, 'down');
  assert.equal(chart.rows[0].last, 1);
  assert.ok(chart.axis[0].show);
  assert.ok(chart.axis.at(-1).show);
});
