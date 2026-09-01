import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDistributionPie, buildMealProteinPie } from '../../apps/life/js/app/chart-kit/pie.js';
import { buildMoodMixDonut } from '../../apps/life/js/app/chart-kit/mood-mix.js';

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

test('buildDistributionPie returns empty when every category is zero', () => {
  const pie = buildDistributionPie([
    { key: 'great', label: 'Great', value: 0, colour: 'var(--mood-great)' },
    { key: 'good', label: 'Good', value: 0, colour: 'var(--mood-good)' }
  ]);
  assert.equal(pie.empty, true);
  assert.equal(pie.total, 0);
  assert.equal(pie.slices.length, 0);
});

test('buildDistributionPie builds a full circle for a single category', () => {
  const pie = buildDistributionPie([
    { key: 'good', label: 'Good', value: 4, colour: 'var(--mood-good)' }
  ]);
  assert.equal(pie.empty, false);
  assert.equal(pie.total, 4);
  assert.equal(pie.slices.length, 1);
  assert.equal(pie.slices[0].key, 'good');
  assert.match(pie.slices[0].path, /A .+ A /);
});

test('buildDistributionPie five-way split sums to a full circle', () => {
  const items = [
    { key: 'great', label: 'Great', value: 1, colour: 'a' },
    { key: 'good', label: 'Good', value: 1, colour: 'b' },
    { key: 'neutral', label: 'Neutral', value: 1, colour: 'c' },
    { key: 'low', label: 'Low', value: 1, colour: 'd' },
    { key: 'bad', label: 'Bad', value: 1, colour: 'e' }
  ];
  const pie = buildDistributionPie(items);
  assert.equal(pie.empty, false);
  assert.equal(pie.total, 5);
  assert.equal(pie.slices.length, 5);
  const sweep = pie.slices.reduce((sum, slice) => sum + (slice.endAngle - slice.startAngle), 0);
  assert.ok(Math.abs(sweep - Math.PI * 2) < 1e-9);
});

const MIX_ITEMS = [
  { key: 'great', label: 'Great', value: 62, colour: 'var(--mood-great)' },
  { key: 'good', label: 'Good', value: 88, colour: 'var(--mood-good)' },
  { key: 'neutral', label: 'Neutral', value: 54, colour: 'var(--mood-neutral)' },
  { key: 'low', label: 'Low', value: 40, colour: 'var(--mood-low)' },
  { key: 'bad', label: 'Bad', value: 24, colour: 'var(--mood-bad)' }
];

test('buildMoodMixDonut returns empty when every mood is zero', () => {
  const donut = buildMoodMixDonut([
    { key: 'great', label: 'Great', value: 0 },
    { key: 'good', label: 'Good', value: 0 }
  ]);
  assert.equal(donut.empty, true);
  assert.equal(donut.total, 0);
  assert.equal(donut.dominant, null);
});

test('buildMoodMixDonut largest-remainder percents are integers that sum to 100', () => {
  const donut = buildMoodMixDonut(MIX_ITEMS);
  assert.equal(donut.empty, false);
  assert.equal(donut.total, 268);
  assert.equal(donut.segments.length, 5);
  const percents = donut.segments.map(segment => segment.pct);
  assert.equal(percents.reduce((sum, pct) => sum + pct, 0), 100);
  assert.ok(percents.every(pct => Number.isInteger(pct)));
  assert.equal(donut.dominant.key, 'good');
  assert.equal(donut.dominant.value, 88);
});

test('buildMoodMixDonut keeps zero moods in the legend but not as visible arcs', () => {
  const donut = buildMoodMixDonut([
    { key: 'great', label: 'Great', value: 0, colour: 'a' },
    { key: 'good', label: 'Good', value: 3, colour: 'b' },
    { key: 'neutral', label: 'Neutral', value: 1, colour: 'c' },
    { key: 'low', label: 'Low', value: 0, colour: 'd' },
    { key: 'bad', label: 'Bad', value: 0, colour: 'e' }
  ]);
  assert.equal(donut.total, 4);
  assert.equal(donut.segments.length, 5);
  const great = donut.segments.find(segment => segment.key === 'great');
  const good = donut.segments.find(segment => segment.key === 'good');
  assert.equal(great.pct, 0);
  assert.equal(great.visible, 0);
  assert.ok(good.visible > 0);
  assert.equal(good.pct, 75);
});

test('buildMoodMixDonut stroke offsets walk the circumference clockwise from 12 o’clock', () => {
  const donut = buildMoodMixDonut(MIX_ITEMS, { radius: 90, gap: 7 });
  const circ = 2 * Math.PI * 90;
  assert.equal(donut.circumference, circ);
  assert.equal(donut.segments[0].dashoffset, 0);
  let offset = 0;
  for (const segment of donut.segments) {
    assert.ok(Math.abs(segment.dashoffset + offset) < 1e-9);
    offset += (segment.pct / 100) * circ;
    const [visible, rest] = segment.dasharray.split(' ').map(Number);
    assert.ok(Math.abs(visible + rest - circ) < 1e-6);
  }
});
