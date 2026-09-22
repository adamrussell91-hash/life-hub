import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBodyChartData,
  buildCarvedData,
  buildShedStackData,
  buildStairsData,
  compositionReadings,
  squaresFor
} from '../../apps/life/js/app/body-chart-data.js';
import { rangeWindow } from '../../apps/life/js/app/body-model.js';
import { buildShedStack } from '../../apps/life/js/app/chart-kit/shed-stack.js';
import { buildStairsDown } from '../../apps/life/js/app/chart-kit/stairs-down.js';
import { buildCarvedAway } from '../../apps/life/js/app/chart-kit/carved-away.js';
import { buildRecompScissors } from '../../apps/life/js/app/chart-kit/recomp-scissors.js';
import { buildHundredSquares, squareKinds } from '../../apps/life/js/app/chart-kit/hundred-squares.js';

const AS_OF = '2026-09-22';
const TARGETS_CONFIG = {
  forecast: {
    body_composition: {
      weight_kg_min: 78, weight_kg_max: 82, body_fat_pct_min: 8, body_fat_pct_max: 10,
      body_fat_pct_tight: 8, shoulder_waist_ratio: 1.6
    }
  }
};
const BAND = { low: 78, high: 82 };

const weigh = (date, weight_kg) => ({ record: { type: 'weight', date, weight_kg } });
const comp = (date, fields) => ({ record: { type: 'composition', date, ...fields } });

function events() {
  return [
    weigh('2024-01-10', 118.0),
    weigh('2024-04-12', 130.2),
    weigh('2024-07-01', 121.4),
    weigh('2024-10-01', 112.0),
    weigh('2025-04-01', 96.5),
    weigh('2025-05-19', 95.9),
    weigh('2025-10-01', 90.0),
    weigh('2026-08-11', 87.4),
    weigh('2026-09-01', 87.0),
    weigh('2026-09-19', 86.9),
    weigh('2026-09-22', 86.3),
    comp('2023-11-04', { body_fat_pct: 59.2 }),
    comp('2025-05-20', { body_fat_pct: 24.8, skeletal_muscle_kg: 36.0 }),
    comp('2026-08-10', { body_fat_pct: 20.0, skeletal_muscle_kg: 39.9 }),
    comp('2026-09-01', { body_fat_pct: 19.6, skeletal_muscle_kg: 39.9 }),
    comp('2026-09-20', { body_fat_pct: 18.9, skeletal_muscle_kg: 40.2, weight_kg: 86.5 })
  ];
}

const weights = () => events().filter(e => e.record.type === 'weight').map(e => ({ date: e.record.date, value: e.record.weight_kg }));

test('shed stack: one block per whole kilogram between today and the heaviest, dated by first crossing', () => {
  const data = buildShedStackData(weights(), BAND);
  assert.equal(data.status, 'ready');
  assert.equal(data.peak.kg, 130.2);
  assert.equal(data.current.kg, 86.3);
  assert.equal(data.blocks.length, 130 - 86);
  assert.equal(data.shedKg, 43.9);
  assert.equal(data.aboveBandKg, 4.3);
  const below120 = data.blocks.find(b => b.kg === 120);
  assert.equal(below120.date, '2024-10-01', '121.4 in July is not below 120; October is');
  const below87 = data.blocks.find(b => b.kg === 87);
  assert.equal(below87.date, '2026-09-19');
  assert.deepEqual(data.years, ['2024', '2025', '2026']);
  // chronological order, never before the heaviest
  for (let i = 1; i < data.blocks.length; i += 1) assert.ok(data.blocks[i].date >= data.blocks[i - 1].date);
  assert.ok(data.blocks.every(b => b.date > data.peak.date));
});

test('shed stack: no pile when today is the heaviest', () => {
  const data = buildShedStackData([{ date: '2026-01-01', value: 80 }, { date: '2026-02-01', value: 82 }], BAND);
  assert.equal(data.status, 'none');
  assert.match(data.reason, /heaviest/);
});

test('stairs: bucket per range and report the biggest drop', () => {
  const bounds = rangeWindow(AS_OF, 'five_year');
  const data = buildStairsData(weights(), bounds, 'five_year', BAND);
  assert.equal(data.mode, 'quarter');
  assert.equal(data.status, 'ready');
  assert.equal(data.steps[0].date, '2024-01-01');
  assert.equal(data.steps.find(s => s.date === '2024-04-01').kg, 130.2);
  assert.equal(data.biggestDrop.date, '2025-04-01');
  assert.equal(data.toGoKg, 4.9);
  const month = buildStairsData(weights(), rangeWindow(AS_OF, 'monthly'), 'monthly', BAND);
  assert.equal(month.mode, 'reading');
  assert.deepEqual(month.steps.map(s => s.kg), [87.0, 86.9, 86.3]);
});

test('carved away: only carves below a high actually reached', () => {
  const rows = [
    { date: '2026-01-01', fatPct: 20 },
    { date: '2026-02-01', fatPct: 24 },
    { date: '2026-03-01', fatPct: 21 },
    { date: '2026-04-01', fatPct: 19 }
  ];
  const data = buildCarvedData(rows, { from: '2026-01-01', to: '2026-12-31' }, { low: 8, high: 10 });
  assert.deepEqual(data.points.map(p => p.carved), [0, 0, 3, 5]);
  assert.equal(data.high.date, '2026-02-01');
  assert.equal(data.carvedPts, 5);
  assert.equal(data.toGoPts, 9);
});

test('composition readings join by date and borrow a weigh-in within a week', () => {
  const rows = compositionReadings(events());
  const may = rows.find(r => r.date === '2025-05-20');
  assert.equal(may.weightKg, 95.9);
  assert.equal(rows.find(r => r.date === '2026-09-20').weightKg, 86.5, 'composition weight wins');
  assert.equal(rows.find(r => r.date === '2023-11-04').weightKg, null, 'no weigh-in within 7 days');
});

test('100 squares: fat and muscle round to whole squares and the rest fills 100', () => {
  assert.deepEqual(squaresFor({ fatPct: 18.9, muscleKg: 40.2, weightKg: 86.5 }), { fat: 19, muscle: 46, rest: 35 });
  const kinds = squareKinds({ fat: 19, muscle: 46, rest: 35 });
  assert.equal(kinds.length, 100);
  assert.equal(kinds.filter(k => k === 'fat').length, 19);
  assert.equal(kinds[0], 'fat');
  assert.equal(kinds[99], 'muscle');
});

test('buildBodyChartData wires targets and ranges for every chart', () => {
  const charts = buildBodyChartData({ events: events(), date: AS_OF, range: 'year', targetsConfig: TARGETS_CONFIG });
  assert.equal(charts.weight.stack.status, 'ready');
  assert.deepEqual(charts.weight.stack.band, BAND);
  assert.equal(charts.weight.stairs.mode, 'month');
  assert.equal(charts.fat.carved.status, 'ready');
  assert.deepEqual(charts.fat.carved.band, { low: 8, high: 10 });
  assert.equal(charts.muscle.scissors.status, 'ready');
  assert.equal(charts.muscle.scissors.points.length, 3, 'year range drops May 2025');
  assert.equal(charts.muscle.squares.readings.length, 4, 'squares use every reading');
  const noTargets = buildBodyChartData({ events: events(), date: AS_OF });
  assert.equal(noTargets.weight.stack.band, null);
});

function hitsResolve(scene) {
  const walk = list => list.flatMap(n => [n, ...walk(n.children ?? [])]);
  for (const n of walk(scene.nodes)) {
    if (n.hit) assert.ok(scene.hits[n.hit], `hit ${n.hit} has an entry`);
  }
}

test('every Body scene builds at phone and desktop widths with resolvable hits', () => {
  const charts = buildBodyChartData({ events: events(), date: AS_OF, range: 'five_year', targetsConfig: TARGETS_CONFIG });
  const builds = [
    [buildShedStack, charts.weight.stack],
    [buildStairsDown, charts.weight.stairs],
    [buildCarvedAway, charts.fat.carved],
    [buildRecompScissors, charts.muscle.scissors],
    [buildHundredSquares, charts.muscle.squares]
  ];
  for (const width of [300, 620]) {
    for (const [build, data] of builds) {
      const scene = build(data, { width });
      assert.equal(scene.width, width);
      assert.ok(scene.height > 60 && scene.height < 260, `${build.name} stays compact (${scene.height})`);
      assert.ok(scene.nodes.length > 5, build.name);
      assert.ok(scene.readout.length > 10, build.name);
      hitsResolve(scene);
      assert.ok(!JSON.stringify(scene.nodes).includes('NaN'), `${build.name} has no NaN geometry`);
    }
  }
});

test('stairs ball rests on today and carries an entrance path', () => {
  const charts = buildBodyChartData({ events: events(), date: AS_OF, range: 'five_year', targetsConfig: TARGETS_CONFIG });
  const scene = buildStairsDown(charts.weight.stairs, { width: 520 });
  const ball = scene.nodes.find(n => n.cls === 'bc-ball');
  assert.ok(ball.motion.path.startsWith('M'));
  assert.equal((ball.motion.path.match(/Q/g) ?? []).length, charts.weight.stairs.steps.length - 1);
});

test('shed stack blocks fall from where they sat in the stack', () => {
  const charts = buildBodyChartData({ events: events(), date: AS_OF, targetsConfig: TARGETS_CONFIG });
  const scene = buildShedStack(charts.weight.stack, { width: 520 });
  const falling = scene.nodes.filter(n => n.anim === 'fall');
  assert.equal(falling.length, charts.weight.stack.blocks.length);
  assert.ok(falling.every(n => /--hc-dx:-?[\d.]+px;--hc-dy:-?[\d.]+px/.test(n.attrs.style)));
});

test('scenes explain themselves when there is not enough data', () => {
  for (const build of [buildShedStack, buildStairsDown, buildCarvedAway, buildRecompScissors, buildHundredSquares]) {
    const scene = build({ status: 'none', reason: 'Needs more readings.' }, { width: 400 });
    assert.equal(scene.readout, 'Needs more readings.');
  }
});
