import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProteinClimb, formatClock } from '../../apps/life/js/app/chart-kit/protein-climb.js';

const meals = [
  { minutes: 750, protein_g: 22, label: 'Lunch', timeKnown: true },
  { minutes: 930, protein_g: 8.4, label: 'Snack', timeKnown: true }
];

const lastPoint = path => path.split(' L').at(-1).split(' ').map(Number);

test('the step line ends at the y of the cumulative total (C2)', () => {
  const chart = buildProteinClimb({ meals, goal: 120 });
  const [, endY] = lastPoint(chart.stepPath);
  assert.equal(chart.total, 30.4);
  assert.ok(Math.abs(endY - chart.y(30.4)) < 0.11);
});

test('meal times move the line, list order does not (C5)', () => {
  const early = buildProteinClimb({ meals, goal: 120 });
  const late = buildProteinClimb({ meals: meals.map(meal => ({ ...meal, minutes: meal.minutes + 120 })), goal: 120 });
  const reversed = buildProteinClimb({ meals: [...meals].reverse(), goal: 120 });
  assert.notEqual(early.stepPath, late.stepPath);
  assert.equal(early.stepPath, reversed.stepPath);
});

test('the default domain is 6 am to 11 pm and widens for early meals', () => {
  assert.deepEqual(buildProteinClimb({ meals, goal: 120 }).domain, { start: 360, end: 1380 });
  assert.equal(buildProteinClimb({ meals: [{ minutes: 290, protein_g: 10, label: 'Breakfast' }], goal: 120 }).domain.start, 240);
});

test('meals under 30 minutes apart share one marker', () => {
  const chart = buildProteinClimb({
    meals: [
      { minutes: 720, protein_g: 10, label: 'Lunch' },
      { minutes: 740, protein_g: 5, label: 'Snack' },
      { minutes: 760, protein_g: 5, label: 'Dessert' }
    ],
    goal: 120
  });
  assert.equal(chart.markers.length, 2);
  assert.equal(chart.markers[0].label, '2 meals · 15 g');
  assert.equal(chart.markers[1].label, 'Dessert · 5 g');
});

test('today projects from now to the goal at day end; past days do not', () => {
  const today = buildProteinClimb({ meals, goal: 120, nowMinutes: 1206 });
  assert.equal(today.now.minutes, 1206);
  assert.equal(today.projection.x2, today.x(1380));
  assert.equal(today.projection.y2, today.y(120));
  assert.ok(Math.abs(today.projection.remaining - 89.6) < 1e-9);
  const past = buildProteinClimb({ meals, goal: 120 });
  assert.equal(past.now, null);
  assert.equal(past.projection, null);
});

test('no projection once the goal is hit, and the crossing meal time is kept', () => {
  const chart = buildProteinClimb({
    meals: [{ minutes: 480, protein_g: 60, label: 'Breakfast' }, { minutes: 1140, protein_g: 70, label: 'Dinner' }],
    goal: 120,
    nowMinutes: 1260
  });
  assert.equal(chart.projection, null);
  assert.equal(chart.goalHitMinutes, 1140);
});

test('an empty day keeps the goal band and reports empty', () => {
  const chart = buildProteinClimb({ meals: [], goal: 120 });
  assert.equal(chart.empty, true);
  assert.ok(chart.goalBand);
});

test('the y scale leaves headroom above both goal and total', () => {
  assert.ok(Math.abs(buildProteinClimb({ meals, goal: 120 }).yMax - 134.4) < 1e-9);
  assert.ok(Math.abs(buildProteinClimb({ meals: [{ minutes: 600, protein_g: 200, label: 'Lunch' }], goal: 120 }).yMax - 210) < 1e-9);
});

test('formatClock reads like a person wrote it', () => {
  assert.equal(formatClock(1206), '8:06 pm');
  assert.equal(formatClock(720), '12 pm');
  assert.equal(formatClock(480), '8 am');
});
