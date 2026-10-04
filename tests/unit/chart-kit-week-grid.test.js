import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekGrid } from '../../apps/life/js/app/chart-kit/week-grid.js';

const targets = { protein_g: 120, fat_ceiling_g: 50, calories: 2200 };
const day = (date, protein_g, fat_g, calories, carbs_g, logged = true) => ({
  date, logged, totals: { protein_g, fat_g, calories, carbs_g }, targets
});
const week = [
  day('2026-09-28', 85, 108, 2147, 208),
  day('2026-09-29', 84, 104, 2008, 194),
  day('2026-09-30', 125, 51, 1534, 110),
  day('2026-10-01', 165, 40, 1528, 115),
  day('2026-10-02', 112, 121, 2435, 225),
  day('2026-10-03', 0, 0, 0, 0, false),
  day('2026-10-04', 30.4, 31, 1024, 155)
];

test('protein hits, fat overs and energy within ±10% are coloured by rule', () => {
  const [protein, fat, energy, carbs] = buildWeekGrid(week);
  assert.deepEqual(protein.cells.map(cell => cell.state), ['under', 'under', 'hit', 'hit', 'under', 'none', 'under']);
  assert.deepEqual(fat.cells.map(cell => cell.state), ['over', 'over', 'over', 'ok', 'over', 'none', 'ok']);
  assert.deepEqual(energy.cells.map(cell => cell.state), ['ok', 'ok', 'off', 'off', 'off', 'none', 'off']);
  assert.ok(carbs.cells.filter(cell => cell.logged).every(cell => cell.state === 'neutral'));
});

test('summaries count logged days only and say what they mean', () => {
  const [protein, fat, energy, carbs] = buildWeekGrid(week);
  assert.equal(protein.summary.text, 'hit 2/7');
  assert.equal(fat.summary.text, 'over 4/7');
  assert.equal(fat.summary.tone, 'danger');
  assert.equal(energy.summary.text, 'on target 2/7');
  assert.equal(carbs.summary.text, 'no target');
});

test('an unlogged day is a stub, never a zero bar', () => {
  const [protein] = buildWeekGrid(week);
  assert.deepEqual(protein.cells[5], { date: '2026-10-03', logged: false, value: null, pct: 0, state: 'none', target: 120 });
});

test('row max includes the target so the target line stays inside the cell', () => {
  const low = week.map(entry => ({ ...entry, totals: { ...entry.totals, protein_g: 10 } }));
  const [protein] = buildWeekGrid(low);
  assert.equal(protein.max, 120);
  assert.equal(protein.targetPct, 100);
  const [, , , carbs] = buildWeekGrid(week);
  assert.equal(carbs.targetPct, null);
});
