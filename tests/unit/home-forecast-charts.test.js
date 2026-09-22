import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeForecastCards } from '../../apps/life/js/app/home-forecast.js';
import { traceBodyScenario, simulateBodyScenario, LEAN_PRESERVATION_GATE } from '../../apps/life/js/core/forecast-body.js';
import { buildGateRings } from '../../apps/life/js/app/chart-kit/gate-rings.js';
import { buildRegionRose } from '../../apps/life/js/app/chart-kit/region-rose.js';
import { buildGlideSlope } from '../../apps/life/js/app/chart-kit/glide-slope.js';
import { buildTwinClocks } from '../../apps/life/js/app/chart-kit/twin-clocks.js';
import { buildRecompPlane } from '../../apps/life/js/app/chart-kit/recomp-plane.js';
import { arcPath, legend, monthStarts } from '../../apps/life/js/app/chart-kit/scene.js';

const TARGETS_CONFIG = {
  target_sets: [{
    valid_from: '2020-01-01',
    calories: { movement: 1660, workout_30: 1900, workout_45_60: 2200, recovery_bonus: 200 },
    protein: { daily: 120, recovery_daily: 140 },
    fat_ceiling_g: 50
  }],
  forecast: {
    body_composition: {
      weight_kg_min: 78, weight_kg_max: 82, body_fat_pct_min: 8, body_fat_pct_max: 10,
      body_fat_pct_tight: 8, shoulder_waist_ratio: 1.6
    },
    strength: { deadline: '2026-10-31', lifts: [] }
  }
};
const TARGETS = TARGETS_CONFIG.forecast.body_composition;
const AS_OF = '2026-09-22';

const plus = (start, days) => {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function history({ locked = false } = {}) {
  const start = plus(AS_OF, -55);
  const records = [];
  const weights = [89.3, 88.6, 88.9, 88.0, 87.9, 87.2, 87.1, 86.8, 86.6, 86.3];
  const offsets = [0, 7, 15, 21, 29, 36, 43, 49, 52, 55];
  const keep = locked ? offsets.length - 2 : 0;
  offsets.forEach((offset, i) => {
    if (i < keep) return;
    const last = i === offsets.length - 1;
    records.push({
      type: last ? 'composition' : 'weight',
      date: plus(start, offset),
      weight_kg: weights[i],
      ...(last ? { body_fat_pct: 18.9 } : {})
    });
  });
  if (!locked) {
    for (let i = 0; i < 56; i++) {
      if (i % 5 === 3) continue;
      const date = plus(start, i);
      records.push({ type: 'meal', date, meal: 'breakfast', calories: 450, protein_g: 35 });
      records.push({ type: 'meal', date, meal: 'lunch', calories: 600, protein_g: 45 });
      records.push({ type: 'meal', date, meal: 'dinner', calories: 800, protein_g: 65 });
    }
  }
  for (let i = 0; i < 56; i++) {
    const date = plus(start, i);
    if ([1, 3, 6].includes(i % 7)) {
      records.push({
        type: 'workout', date, status: 'completed', session_kind: 'strength', day_type: 'workout_45_60',
        exercises: [
          { name: 'Bar Press', target_area: 'chest', sets: Array.from({ length: 5 }, (_, k) => ({ weight_kg: 30 + k, reps: 10 })) },
          { name: 'Goblet Squat', target_area: 'legs', sets: [{ weight_kg: 20, reps: 10 }] }
        ]
      });
    } else if (i % 7 === 0) {
      records.push({ type: 'workout', date, status: 'completed', session_kind: 'walk', exercises: [] });
    }
  }
  return records.map(record => ({ record }));
}

function walk(nodes, visit) {
  for (const n of nodes) {
    visit(n);
    if (n.children) walk(n.children, visit);
  }
}

function assertSceneSound(scene) {
  assert.ok(scene.width > 0 && scene.height > 0, 'scene has a size');
  assert.equal(typeof scene.readout, 'string');
  let numeric = 0;
  walk(scene.nodes, n => {
    assert.ok(n.tag, 'node has a tag');
    for (const [name, value] of Object.entries(n.attrs ?? {})) {
      if (typeof value === 'number') {
        assert.ok(Number.isFinite(value), `${n.tag}.${name} is finite`);
        numeric++;
      }
      if (typeof value === 'string') assert.doesNotMatch(value, /NaN|Infinity|undefined/, `${n.tag}.${name}`);
    }
    if (n.text != null) assert.doesNotMatch(String(n.text), /NaN|undefined/);
    if (n.hit) assert.ok(scene.hits[n.hit], `hit ${n.hit} is described`);
  });
  assert.ok(numeric > 0);
  for (const hit of Object.values(scene.hits)) {
    assert.ok(hit.title && Array.isArray(hit.lines) && hit.detail, `hit ${hit.id} has tooltip and detail`);
    for (const line of hit.lines) assert.doesNotMatch(line, /NaN|undefined|null/);
    assert.doesNotMatch(hit.detail, /NaN|undefined|null/);
  }
}

test('trace is display-only: forecast dates are unchanged by tracing', () => {
  const body = { status: 'ready', weight_kg: 86.3, body_fat_pct: 18.9, fat_mass_kg: 16.311, fat_free_mass_kg: 69.989 };
  const scenario = simulateBodyScenario({
    asOf: AS_OF, body, intakeKcalDay: 1850, expenditureKcalDay: 2350,
    expenditureRangeKcalDay: [2200, 2500], partitionMode: 'preserve_ffm', targets: TARGETS
  });
  assert.equal(scenario.status, 'will_not_arrive');
  assert.ok(scenario.trace.points.length > 40);
  assert.equal(scenario.trace.points[0].day, 0);
  // Holding 70.0 kg lean, weight leaves 78 kg before fat reaches 10 %.
  assert.ok(scenario.trace.weight_band.to_day < scenario.trace.body_fat_band.from_day);
  assert.equal(scenario.trace.overlap, null);
  assert.ok(scenario.trace.miss_days > 0);
  assert.ok(scenario.trace_range.low_expenditure && scenario.trace_range.high_expenditure);
});

test('trace finds an overlap when lean mass is high enough for the box', () => {
  const body = { status: 'ready', weight_kg: 88, body_fat_pct: 18, fat_mass_kg: 15.84, fat_free_mass_kg: 72.16 };
  const trace = traceBodyScenario({
    asOf: AS_OF, body, intakeKcalDay: 1850, expenditureKcalDay: 2350, partitionMode: 'preserve_ffm', targets: TARGETS
  });
  assert.ok(trace.overlap, 'box window exists');
  assert.equal(trace.miss_days, null);
  const dated = simulateBodyScenario({
    asOf: AS_OF, body, intakeKcalDay: 1850, expenditureKcalDay: 2350, partitionMode: 'preserve_ffm', targets: TARGETS
  });
  assert.equal(dated.status, 'dated');
  assert.equal(dated.date, trace.overlap.from);
});

test('home cards carry chart data for every card, ready and locked', () => {
  for (const locked of [false, true]) {
    const cards = buildHomeForecastCards({ events: history({ locked }), date: AS_OF, targetsConfig: TARGETS_CONFIG });
    const stim = cards.stimulus.chart;
    assert.equal(stim.keys.length, 3);
    assert.deepEqual(stim.keys.map(k => k.threshold), [
      LEAN_PRESERVATION_GATE.resistance_sessions_week,
      LEAN_PRESERVATION_GATE.upper_body_loaded_sets_week_proxy,
      LEAN_PRESERVATION_GATE.protein_g_kg_day
    ]);
    assert.equal(stim.regions.length, 7);
    assert.ok(cards.scale.chart.points.length >= 2);
    assert.equal(cards.recomp.scenarios.length, 2);
    assert.deepEqual(cards.recomp.leanBand, { low: 70.2, high: 75.44 });
    if (locked) {
      assert.equal(stim.keys[2].status, 'unscored');
      assert.equal(cards.scale.chart.trendReady, false);
      assert.ok(cards.recomp.scenarios.every(s => s.status === 'locked' && s.trace == null));
    } else {
      assert.equal(cards.scale.chart.trendReady, true);
      assert.ok(cards.scale.chart.projection.entry_date > AS_OF);
      assert.ok(cards.recomp.scenarios.every(s => s.trace?.points?.length));
    }
  }
});

test('upper-body copy never reports total sets as upper-body sets', () => {
  const cards = buildHomeForecastCards({ events: history({ locked: true }), date: AS_OF, targetsConfig: TARGETS_CONFIG });
  const upper = cards.stimulus.chart.keys.find(k => k.key === 'upper_sets').value;
  const legs = cards.stimulus.chart.regions.find(r => r.key === 'legs').setsPerWeek;
  assert.ok(legs > 0, 'fixture has leg sets');
  assert.match(cards.stimulus.detail, new RegExp(`^${upper} upper-body`));
});

test('every chart builds a sound scene at desktop and phone widths, ready and locked', () => {
  for (const locked of [false, true]) {
    const cards = buildHomeForecastCards({ events: history({ locked }), date: AS_OF, targetsConfig: TARGETS_CONFIG });
    for (const width of [300, 360, 520, 900]) {
      assertSceneSound(buildGateRings(cards.stimulus.chart, { width }));
      assertSceneSound(buildRegionRose(cards.stimulus.chart, { width }));
      assertSceneSound(buildGlideSlope(cards.scale.chart, { width }));
      assertSceneSound(buildTwinClocks(cards.recomp, { width, lockText: 'Need 3 more readings.' }));
      assertSceneSound(buildRecompPlane(cards.recomp, { width }));
    }
  }
});

test('charts survive an empty history', () => {
  const cards = buildHomeForecastCards({ events: [], date: AS_OF, targetsConfig: TARGETS_CONFIG });
  for (const width of [320, 640]) {
    assertSceneSound(buildGateRings(cards.stimulus.chart, { width }));
    assertSceneSound(buildTwinClocks(cards.recomp, { width }));
    const glide = buildGlideSlope(cards.scale.chart, { width });
    assert.match(glide.readout, /No weigh-ins/);
    const plane = buildRecompPlane(cards.recomp, { width });
    assert.ok(plane.nodes.length > 0);
  }
});

test('glide slope splits each weigh-in against the trend', () => {
  const cards = buildHomeForecastCards({ events: history(), date: AS_OF, targetsConfig: TARGETS_CONFIG });
  for (const point of cards.scale.chart.points) {
    assert.ok(Math.abs(point.weight_kg - point.trend_kg - point.split_kg) < 0.011);
  }
  const scene = buildGlideSlope(cards.scale.chart, { width: 520 });
  const obsHits = Object.keys(scene.hits).filter(id => id.startsWith('obs-'));
  assert.equal(obsHits.length, cards.scale.chart.points.length);
  assert.ok(scene.hits['glide-entry']);
});

test('gate rings put every threshold on the shared gate spoke', () => {
  const chart = {
    keys: [
      { key: 'sessions', label: 'S', short: 'S', value: 2, threshold: 2, unit: '', status: 'met', ratio: 1, note: '' },
      { key: 'upper_sets', label: 'U', short: 'U', value: 40, threshold: 10, unit: '', status: 'met', ratio: 4, note: '' },
      { key: 'protein', label: 'P', short: 'P', value: null, threshold: 1.62, unit: '', status: 'unscored', ratio: null, reason: 'Needs food logs.', note: '' }
    ],
    metCount: 2,
    scoredCount: 2
  };
  const scene = buildGateRings(chart, { width: 520 });
  assert.equal(scene.hits['gate-upper_sets'].action, 'open-regions');
  const fills = [];
  walk(scene.nodes, n => { if (String(n.cls).includes('hc-gate-fill')) fills.push(n); });
  assert.equal(fills.length, 2, 'unscored key draws no fill');
});

test('scene helpers', () => {
  assert.match(arcPath(0, 0, 10, -90, 180), /^M0 -10 A10 10 0 1 1 -10 0$/);
  assert.deepEqual(monthStarts('2026-09-22', '2026-12-01'), ['2026-10-01', '2026-11-01', '2026-12-01']);
  const one = legend([['a', 'Alpha'], ['b', 'Beta']], { width: 400 });
  const two = legend([['a', 'Alpha'], ['b', 'Beta']], { width: 40 });
  assert.ok(two.height > one.height);
});
