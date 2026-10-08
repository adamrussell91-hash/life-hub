import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMoneyFlow, spaceLabels } from '../../apps/life/js/app/chart-kit/money-flow.js';
import { buildDivergingBars } from '../../apps/life/js/app/chart-kit/diverging-bars.js';
import { buildEquityWedge, yearAtX } from '../../apps/life/js/app/chart-kit/equity-wedge.js';

test('money flow fills targets in order so ribbons never cross', () => {
  const layout = buildMoneyFlow(
    [{ id: 'rent', value: 500 }, { id: 'pocket', value: 300 }],
    [{ id: 'fees', value: 50 }, { id: 'interest', value: 500 }, { id: 'principal', value: 250 }],
    { height: 300 }
  );
  assert.deepEqual(layout.ribbons.map(ribbon => `${ribbon.source}>${ribbon.target}:${ribbon.value}`), [
    'rent>fees:50',
    'rent>interest:450',
    'pocket>interest:50',
    'pocket>principal:250'
  ]);
  const right = layout.nodes.filter(node => node.side === 'right');
  for (let i = 1; i < right.length; i++) assert.ok(right[i].y >= right[i - 1].y + right[i - 1].h);
  assert.deepEqual(buildMoneyFlow([], [{ id: 'x', value: 1 }]).ribbons, []);
});

test('money flow drops zero nodes and labels keep their distance', () => {
  const layout = buildMoneyFlow([{ id: 'rent', value: 100 }], [{ id: 'a', value: 0 }, { id: 'b', value: 100 }]);
  assert.equal(layout.nodes.some(node => node.id === 'a'), false);
  const ys = spaceLabels([{ y: 0, h: 4 }, { y: 6, h: 4 }, { y: 200, h: 40 }], { minGap: 38 });
  assert.ok(ys[1] - ys[0] >= 38);
  assert.equal(ys[2], 220);
});

test('diverging bars sit either side of zero with a ghost for the move', () => {
  const layout = buildDivergingBars([{ key: 'recorded', value: 12000 }, { key: 'corrected', value: -3000, from: 12000 }], { width: 560, left: 150 });
  const [recorded, corrected] = layout.bars;
  assert.equal(recorded.x, layout.zeroX);
  assert.ok(recorded.positive);
  assert.equal(corrected.positive, false);
  assert.ok(Math.abs(corrected.x + corrected.width - layout.zeroX) < 1e-9);
  assert.ok(Math.abs(corrected.ghost.x - layout.zeroX) < 1e-9, 'ghost starts at zero, not over the solid bar');
  assert.ok(layout.ticks.some(tick => tick.value === 0));
});

test('equity wedge scales years to width and maps the cursor back', () => {
  const series = Array.from({ length: 31 }, (_, index) => ({ year: 2026 + index, worth: 800000 * 1.05 ** index, loan: Math.max(0, 600000 - index * 30000) }));
  const wedge = buildEquityWedge(series, { width: 900, height: 260, sample: 1 });
  assert.equal(wedge.sx(2026), wedge.padLeft);
  assert.equal(wedge.sx(2056), 900 - wedge.padRight);
  assert.ok(Math.abs(yearAtX(wedge, wedge.sx(2040)) - 2040) < 1e-9);
  assert.equal(yearAtX(wedge, -50), 2026);
  assert.ok(wedge.wedgePath.endsWith('Z'));
  assert.ok(wedge.xTicks.every(tick => tick.year % 5 === 0));
  assert.equal(buildEquityWedge([]), null);
});
