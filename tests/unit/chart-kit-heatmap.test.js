import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeatmapRow } from '../../js/app/chart-kit/heatmap.js';
import { rangeWindow } from '../../js/app/mind-model.js';

test('buildHeatmapRow uses 7 tiles for the weekly range', () => {
  const bounds = rangeWindow('2026-08-13', 'weekly');
  const tiles = buildHeatmapRow({
    from: bounds.from,
    to: bounds.to,
    today: '2026-08-13',
    hitDates: []
  });
  assert.equal(tiles.length, 7);
  assert.equal(tiles[0].date, bounds.from);
  assert.equal(tiles.at(-1).date, '2026-08-13');
});

test('buildHeatmapRow uses 30 tiles for the monthly range', () => {
  const bounds = rangeWindow('2026-08-13', 'monthly');
  const tiles = buildHeatmapRow({ ...bounds, today: '2026-08-13', hitDates: [] });
  assert.equal(tiles.length, 30);
});

test('buildHeatmapRow uses 182 tiles for the six-month range', () => {
  const bounds = rangeWindow('2026-08-13', 'six_month');
  const tiles = buildHeatmapRow({ ...bounds, today: '2026-08-13', hitDates: [] });
  assert.equal(tiles.length, 182);
});

test('buildHeatmapRow marks hits and today on the matching dates', () => {
  const tiles = buildHeatmapRow({
    from: '2026-08-10',
    to: '2026-08-13',
    today: '2026-08-13',
    hitDates: ['2026-08-10', '2026-08-12']
  });
  assert.deepEqual(tiles.map(tile => [tile.date, tile.hit, tile.today]), [
    ['2026-08-10', true, false],
    ['2026-08-11', false, false],
    ['2026-08-12', true, false],
    ['2026-08-13', false, true]
  ]);
});
