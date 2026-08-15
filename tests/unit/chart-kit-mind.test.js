import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStreamPaths } from '../../js/app/chart-kit/stream.js';
import { buildSankeyFlow } from '../../js/app/chart-kit/sankey-flow.js';
import { buildBumpLines } from '../../js/app/chart-kit/bump.js';
import { buildRadialYear } from '../../js/app/chart-kit/radial-year.js';
import { buildHorizonBands } from '../../js/app/chart-kit/horizon.js';

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
