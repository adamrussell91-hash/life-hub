import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompletionRing,
  weekHorizonMetrics,
  parseCrossAgentEdges,
  focusCrossAgentEdges,
  recordDomain,
  buildDomainWeekly,
  hitMapFromSeries,
  buildGovernanceHeatSeries,
  scanTrendBlocks
} from '../../apps/life/js/app/central-node-charts.js';
import { buildHorizonBands } from '../../apps/life/js/app/chart-kit/horizon.js';
import { buildChordLayout } from '../../apps/life/js/app/chart-kit/chord-layout.js';
import { buildThemeTopography } from '../../apps/life/js/app/chart-kit/stream.js';
import { buildWatchlistHeat } from '../../apps/life/js/app/chart-kit/watchlist-heat.js';
import { getSydneyWeekStart } from '../../apps/life/js/core/time.js';

test('computes stroke-dasharray geometry for a partial ring using default dimensions', () => {
  const ring = buildCompletionRing({ complete: 3, total: 5 });

  assert.equal(ring.size, 64);
  assert.equal(ring.strokeWidth, 8);
  assert.equal(ring.center, 32);
  assert.equal(ring.radius, 28);
  assert.equal(Math.round(ring.circumference * 100) / 100, 175.93);
  assert.equal(Math.round(ring.dashoffset * 100) / 100, 70.37);
});

test('a full ring (complete === total) has a zero dashoffset', () => {
  const ring = buildCompletionRing({ complete: 5, total: 5 });
  assert.equal(ring.dashoffset, 0);
});

test('an empty ring (total is zero) does not divide by zero and renders as fully unfilled', () => {
  const ring = buildCompletionRing({ complete: 0, total: 0 });
  assert.equal(ring.dashoffset, ring.circumference);
});

test('a complete value exceeding total is clamped to a full ring instead of overshooting', () => {
  const ring = buildCompletionRing({ complete: 7, total: 5 });
  assert.equal(ring.dashoffset, 0);
});

test('custom dimensions override the defaults', () => {
  const ring = buildCompletionRing({ complete: 1, total: 2 }, { size: 100, strokeWidth: 10 });
  assert.equal(ring.size, 100);
  assert.equal(ring.center, 50);
  assert.equal(ring.radius, 45);
});

test('weekHorizonMetrics feeds buildHorizonBands from protein_g', () => {
  const metrics = weekHorizonMetrics([
    { date: '2026-07-24', protein_g: 40 },
    { date: '2026-07-25', protein_g: 80 }
  ]);
  assert.deepEqual(metrics, [{
    key: 'protein',
    points: [
      { date: '2026-07-24', value: 40 },
      { date: '2026-07-25', value: 80 }
    ]
  }]);
  const bands = buildHorizonBands(metrics, { width: 320, height: 24 });
  assert.equal(bands.length, 1);
  assert.equal(bands[0].rects.length, 2);
  assert.ok(bands[0].rects[1].opacity > bands[0].rects[0].opacity);
});

test('parseCrossAgentEdges counts Sender→Recipient and drops Clementine and arrowless lines', () => {
  const markdown = [
    '- Chadwick→Sara: AC flag.',
    '- Hammond→Ann: teaching handoff.',
    '- **Vera → Penelope:** weekend framed as escape.',
    '- Chadwick programming: no arrow here.',
    '- Clementine→Hammond: drop me.',
    '- Hammond→Clementine: drop me too.'
  ].join('\n');
  const { edges, details } = parseCrossAgentEdges(markdown);
  assert.equal(edges.length, 3);
  assert.deepEqual(
    edges.map(edge => `${edge.themeA}→${edge.themeB}:${edge.count}`).sort(),
    ['Chadwick→Sara:1', 'Hammond→Ann:1', 'Vera→Penelope:1']
  );
  const vera = details.find(row => row.themeA === 'Vera' && row.themeB === 'Penelope');
  assert.match(vera.lines.join(' '), /weekend framed/);
  const layout = buildChordLayout(edges);
  assert.ok(layout.themes.includes('Hammond'));
  assert.ok(layout.themes.includes('Ann'));
  assert.equal(layout.themes.includes('Clementine'), false);
});

test('focusCrossAgentEdges keeps the busiest nodes up to 8', () => {
  const edges = [];
  for (let i = 0; i < 10; i += 1) {
    edges.push({ themeA: 'Hammond', themeB: `Agent${i}`, count: 10 - i });
  }
  const focused = focusCrossAgentEdges(edges, { maxNodes: 8 });
  const nodes = new Set(focused.flatMap(edge => [edge.themeA, edge.themeB]));
  assert.ok(nodes.size <= 8);
  assert.ok(focused.every(edge => nodes.has(edge.themeA) && nodes.has(edge.themeB)));
});

test('buildDomainWeekly counts Life domains by Sydney week and omits empty keys', () => {
  const events = [
    { record: { type: 'meal', date: '2026-07-24' } },
    { record: { type: 'meal', date: '2026-07-24' } },
    { record: { type: 'workout', date: '2026-07-24' } },
    { record: { type: 'diary', date: '2026-07-30' } },
    { record: { type: 'mind_session', date: '2026-07-30' } },
    { record: { type: 'weight', date: '2026-07-24' } },
    { record: { type: 'skincare', date: '2026-07-24' } },
    { record: { type: 'goal', date: '2026-07-24' } }
  ];
  assert.equal(recordDomain('meal'), 'nutrition');
  assert.equal(recordDomain('mind_session'), 'diary');
  assert.equal(recordDomain('goal'), null);
  const weekly = buildDomainWeekly(events, '2026-07-30');
  assert.equal(weekly.weeks[0], getSydneyWeekStart('2026-01-01'));
  assert.equal(weekly.weeks.at(-1), getSydneyWeekStart('2026-07-30'));
  const byKey = Object.fromEntries(weekly.series.map(item => [item.key, item.values]));
  assert.equal(byKey.nutrition[weekly.weeks.indexOf(getSydneyWeekStart('2026-07-24'))], 2);
  assert.equal(byKey.diary[weekly.weeks.indexOf(getSydneyWeekStart('2026-07-30'))], 2);
  assert.equal(Object.hasOwn(byKey, 'fitness'), true);
  const chart = buildThemeTopography(weekly);
  assert.equal(chart.empty, false);
});

test('hitMapFromSeries keeps only predicate hits', () => {
  const map = hitMapFromSeries(
    [{ date: '2026-07-24', complete: true }, { date: '2026-07-25', complete: false }],
    day => day.complete
  );
  assert.deepEqual(map, { '2026-07-24': 'hit' });
});

test('buildGovernanceHeatSeries marks 1 on every week an item has already been open', () => {
  const series = buildGovernanceHeatSeries([
    { title: 'Sleep goal', entryType: 'Drift Detection', dateKey: '2026-07-13' },
    { title: 'No date', entryType: 'Escalation' }
  ], '2026-07-30', { weekCount: 4 });
  assert.equal(series.length, 2);
  const sleep = series.find(row => row.term === 'Sleep goal');
  assert.equal(sleep.points.length, 4);
  assert.equal(sleep.points.at(-1).date, getSydneyWeekStart('2026-07-30'));
  assert.ok(sleep.points.filter(point => point.count === 1).length >= 2);
  assert.ok(sleep.points[0].count === 0 || sleep.points[0].date >= '2026-07-13');
  const undated = series.find(row => row.term === 'No date');
  assert.equal(undated.points.every(point => point.count === 1), true);
  const heat = buildWatchlistHeat(series);
  assert.equal(heat.empty, false);
  assert.equal(heat.rows.length, 2);
});

test('scanTrendBlocks returns the first three **Label:** blocks', () => {
  const markdown = [
    '**Nutrition:**',
    '- Protein rising.',
    '**Exercise:**',
    '- EP is the anchor.',
    '**Health Trajectory:**',
    '- Entocort taper.',
    '**Work/Energy:**',
    '- Holidays.'
  ].join('\n');
  const scan = scanTrendBlocks(markdown);
  assert.equal(scan.total, 4);
  assert.equal(scan.preview.length, 3);
  assert.equal(scan.preview[0].label, 'Nutrition');
  assert.match(scan.preview[0].line, /Protein rising/);
  assert.equal(scan.rest.length, 1);
  assert.equal(scan.rest[0].label, 'Work/Energy');
});
