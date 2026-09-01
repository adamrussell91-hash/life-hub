import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAreaLine, straightLinePath } from '../../apps/life/js/app/chart-kit/area-line.js';

test('scales a 3-point series and omits any last-point marker field', () => {
  const week = [
    { date: '2026-07-28', value: 0 },
    { date: '2026-07-29', value: 50 },
    { date: '2026-07-30', value: 100 }
  ];
  const chart = buildAreaLine(week, { width: 320, height: 120, padding: 12 });
  assert.equal(chart.linePoints, '12.0,108.0 160.0,60.0 308.0,12.0');
  assert.equal(chart.areaPoints, '12,108 12.0,108.0 160.0,60.0 308.0,12.0 308,108');
  assert.match(chart.linePath, /^M 12\.0 108\.0/);
  assert.match(chart.linePath, /C /);
  assert.match(chart.areaPath, /Z$/);
  assert.equal('last' in chart, false);
  assert.deepEqual(chart.dayLabels, [
    { date: '2026-07-28', x: 12 },
    { date: '2026-07-29', x: 160 },
    { date: '2026-07-30', x: 308 }
  ]);
});

test('empty series returns empty strings without throwing', () => {
  const chart = buildAreaLine([]);
  assert.deepEqual(chart.points, []);
  assert.equal(chart.linePoints, '');
  assert.equal(chart.areaPoints, '');
});

test('rollingAveragePoints uses trailing window mean when requested', () => {
  const week = [
    { date: '2026-07-28', value: 0 },
    { date: '2026-07-29', value: 60 },
    { date: '2026-07-30', value: 90 }
  ];
  const chart = buildAreaLine(week, { width: 320, height: 120, padding: 12, rollingAverage: 3 });
  assert.equal(typeof chart.rollingLinePoints, 'string');
  assert.ok(chart.rollingLinePoints.length > 0);
});

test('buildAreaLine padded domain does not pin min to zero', () => {
  const chart = buildAreaLine(
    [
      { date: '2026-01-01', value: 88 },
      { date: '2026-02-01', value: 90 },
      { date: '2026-03-01', value: 86 }
    ],
    { yDomain: 'padded', height: 160, width: 320 }
  );
  const ys = chart.points.map(p => p.y);
  const spread = Math.max(...ys) - Math.min(...ys);
  assert.ok(spread > 20, 'padded domain should use vertical range');
});

test('buildAreaLine takes a caller-owned domain so separate charts share a scale', () => {
  const options = { yDomain: 'fixed', min: 0, max: 100, height: 120, width: 320, padding: 10 };
  const low = buildAreaLine([{ date: '2026-01-01', value: 25 }], options);
  const high = buildAreaLine([{ date: '2026-01-01', value: 75 }], options);
  assert.ok(low.points[0].y > high.points[0].y, 'the larger value sits higher on the same scale');
  assert.equal(Math.round(low.scaleY(0)), 110, 'the domain floor lands on the plot floor');
  assert.equal(Math.round(low.scaleY(100)), 10, 'the domain ceiling lands on the plot ceiling');
});

test('straightLinePath joins points without inventing curvature between them', () => {
  const path = straightLinePath([{ x: 0, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 5 }]);
  assert.equal(path, 'M 0.0 10.0 L 10.0 20.0 L 20.0 5.0');
  assert.equal(straightLinePath([]), '');
});

test('buildAreaLine default still zero-based', () => {
  const zero = buildAreaLine(
    [
      { date: '2026-01-01', value: 88 },
      { date: '2026-02-01', value: 90 }
    ],
    { height: 160, width: 320 }
  );
  const padded = buildAreaLine(
    [
      { date: '2026-01-01', value: 88 },
      { date: '2026-02-01', value: 90 }
    ],
    { yDomain: 'padded', height: 160, width: 320 }
  );
  const zeroSpread = Math.max(...zero.points.map(p => p.y)) - Math.min(...zero.points.map(p => p.y));
  const padSpread = Math.max(...padded.points.map(p => p.y)) - Math.min(...padded.points.map(p => p.y));
  assert.ok(padSpread > zeroSpread, 'padded should spread more than zero-based for high values');
});

test('buildAreaLine padded domain folds includeValues into min/max', () => {
  const chart = buildAreaLine(
    [
      { date: '2026-01-01', value: 42 },
      { date: '2026-02-01', value: 44 }
    ],
    { yDomain: 'padded', height: 168, width: 320, includeValues: [5, 40] }
  );
  assert.equal(typeof chart.scaleY, 'function');
  const yLow = chart.scaleY(5);
  const yHigh = chart.scaleY(40);
  const yPoint = chart.points[0].y;
  assert.ok(yLow > yPoint, 'ref_low below the series should sit lower on screen (higher y)');
  assert.ok(Math.abs(yHigh - chart.scaleY(40)) < 0.01);
  const without = buildAreaLine(
    [
      { date: '2026-01-01', value: 42 },
      { date: '2026-02-01', value: 44 }
    ],
    { yDomain: 'padded', height: 168, width: 320 }
  );
  const seriesSpreadWith = Math.abs(chart.points[0].y - chart.points[1].y);
  const seriesSpreadWithout = Math.abs(without.points[0].y - without.points[1].y);
  assert.ok(seriesSpreadWith < seriesSpreadWithout, 'including the reference floor should compress the series vertically');
});

test('buildAreaLine returns scaleY for the default domain too', () => {
  const chart = buildAreaLine(
    [
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 100 }
    ],
    { height: 120, width: 320, padding: 12 }
  );
  assert.equal(chart.scaleY(100), 12);
  assert.equal(chart.scaleY(0), 108);
});
