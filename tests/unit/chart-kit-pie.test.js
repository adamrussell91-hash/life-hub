import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMealProteinPie } from '../../js/app/chart-kit/pie.js';

test('buildMealProteinPie returns empty when all meal protein is zero', () => {
  const pie = buildMealProteinPie({
    breakfast: { protein_g: 0 },
    lunch: { protein_g: 0 },
    dinner: { protein_g: 0 },
    snack: { protein_g: 0 }
  });
  assert.equal(pie.empty, true);
  assert.equal(pie.total, 0);
  assert.equal(pie.slices.length, 0);
});

test('buildMealProteinPie builds slices with paths, colours, and labels', () => {
  const pie = buildMealProteinPie({
    breakfast: { protein_g: 30 },
    lunch: { protein_g: 40 },
    dinner: { protein_g: 30 },
    snack: { protein_g: 0 }
  }, { size: 72 });
  assert.equal(pie.empty, false);
  assert.equal(pie.total, 100);
  assert.equal(pie.slices.length, 3);
  assert.equal(pie.slices[0].meal, 'breakfast');
  assert.equal(pie.slices[0].value, 30);
  assert.match(pie.slices[0].path, /^M /);
  assert.ok(pie.slices[0].colour);
  assert.equal(pie.slices[1].meal, 'lunch');
  assert.equal(pie.slices[2].meal, 'dinner');
});

test('single meal becomes a full circle path', () => {
  const pie = buildMealProteinPie({
    breakfast: { protein_g: 0 },
    lunch: { protein_g: 0 },
    dinner: { protein_g: 55 },
    snack: { protein_g: 0 }
  });
  assert.equal(pie.slices.length, 1);
  assert.equal(pie.slices[0].meal, 'dinner');
  assert.equal(pie.total, 55);
});
