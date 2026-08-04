import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProteinLineChart } from '../../js/app/nutrition-charts.js';

test('scales a 3-point series into SVG coordinates within the given viewport', () => {
  const week = [
    { date: '2026-07-28', protein_g: 0 },
    { date: '2026-07-29', protein_g: 50 },
    { date: '2026-07-30', protein_g: 100 }
  ];

  const chart = buildProteinLineChart(week, { width: 320, height: 120, padding: 12 });

  assert.equal(chart.width, 320);
  assert.equal(chart.height, 120);
  assert.deepEqual(chart.points, [
    { x: 12, y: 108, date: '2026-07-28', value: 0 },
    { x: 160, y: 60, date: '2026-07-29', value: 50 },
    { x: 308, y: 12, date: '2026-07-30', value: 100 }
  ]);
  assert.equal(chart.linePoints, '12.0,108.0 160.0,60.0 308.0,12.0');
  assert.equal(chart.areaPoints, '12,120 12.0,108.0 160.0,60.0 308.0,12.0 308,120');
  assert.deepEqual(chart.last, { x: 308, y: 12, date: '2026-07-30', value: 100 });
});

test('a single-point series places one point at the left padding without dividing by zero', () => {
  const chart = buildProteinLineChart([{ date: '2026-07-30', protein_g: 80 }], { width: 320, height: 120, padding: 12 });

  assert.equal(chart.points.length, 1);
  assert.equal(chart.points[0].x, 12);
  assert.equal(chart.last.date, '2026-07-30');
});

test('an all-zero series does not divide by zero and places every point at the baseline', () => {
  const week = [
    { date: '2026-07-29', protein_g: 0 },
    { date: '2026-07-30', protein_g: 0 }
  ];

  const chart = buildProteinLineChart(week, { width: 320, height: 120, padding: 12 });

  assert.equal(chart.points.every(point => point.y === 108), true);
});

test('an empty series produces no points and a null last point, without throwing', () => {
  const chart = buildProteinLineChart([], { width: 320, height: 120, padding: 12 });

  assert.deepEqual(chart.points, []);
  assert.equal(chart.linePoints, '');
  assert.equal(chart.last, null);
});

test('default dimensions are provided when omitted', () => {
  const chart = buildProteinLineChart([{ date: '2026-07-30', protein_g: 10 }]);

  assert.equal(chart.width, 320);
  assert.equal(chart.height, 120);
});
