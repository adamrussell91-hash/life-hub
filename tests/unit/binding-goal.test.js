import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBindingGoal } from '../../apps/life/js/app/binding-goal.js';

function event(record) {
  return { record };
}

test('body fat outside the band is binding and is not treated as a lift plan', () => {
  const goal = buildBindingGoal({
    date: '2026-08-11',
    events: [
      event({ type: 'composition', date: '2026-08-01', weight_kg: 80, body_fat_pct: 14 }),
      event({
        type: 'measurements',
        date: '2026-07-01',
        shoulders: 48,
        waist: 32
      }),
      event({
        type: 'workout',
        date: '2026-08-02',
        status: 'completed',
        exercises: [{ name: 'Bar Press', sets: [{ reps: 10, weight_kg: 40 }] }]
      })
    ]
  });

  assert.match(goal.verdict, /^Body fat is binding/);
  assert.equal(goal.bindingId, 'fat');
  assert.match(goal.verdict, /serves the fat band, not the 31 October lifts/);
  assert.match(goal.rows.find(row => row.id === 'fat').detail, /14% on 01\/08\/26, 4 points above 10/);
  assert.match(goal.rows.find(row => row.id === 'weight').detail, /inside 78–82 kg/);
  assert.match(goal.rows.find(row => row.id === 'ratio').detail, /Frozen until the next tape/);
  assert.match(goal.rows.find(row => row.id === 'lift').detail, /short of 65/);
});

test('in-band weight and fat leave shoulder:waist binding', () => {
  const goal = buildBindingGoal({
    date: '2026-08-11',
    events: [
      event({ type: 'composition', date: '2026-08-01', weight_kg: 80, body_fat_pct: 9 }),
      event({ type: 'measurements', date: '2026-06-01', shoulders: 45, waist: 30 })
    ]
  });

  assert.match(goal.verdict, /^Shoulder:waist is binding/);
  assert.equal(goal.bindingId, 'ratio');
  assert.doesNotMatch(goal.verdict, /31 October/);
  assert.equal(goal.rows.find(row => row.id === 'ratio').status, 'outside');
  assert.equal(goal.rows.find(row => row.id === 'lift').status, 'unread');
});

test('a full set of in-band readings is not called binding', () => {
  const goal = buildBindingGoal({
    date: '2026-08-11',
    events: [
      event({ type: 'composition', date: '2026-08-01', weight_kg: 80, body_fat_pct: 9 }),
      event({ type: 'measurements', date: '2026-08-01', shoulders: 50, waist: 30 }),
      event({
        type: 'workout',
        date: '2026-08-02',
        status: 'completed',
        exercises: [
          { name: 'Bar Press', sets: [{ reps: 1, weight_kg: 65 }] },
          { name: 'Cable Bar Wide Grip Curl', sets: [{ reps: 1, weight_kg: 60 }] },
          { name: 'Reverse Wide Grip Bent Over Row', sets: [{ reps: 1, weight_kg: 47 }] }
        ]
      })
    ]
  });

  assert.equal(goal.verdict, 'All four goals are inside their targets.');
  assert.equal(goal.bindingId, null);
  assert.ok(goal.rows.every(row => row.status === 'inside'));
});

test('weight outside the band is binding when body fat is already inside', () => {
  const goal = buildBindingGoal({
    date: '2026-08-11',
    events: [
      event({ type: 'weight', date: '2026-08-01', weight_kg: 88 }),
      event({ type: 'composition', date: '2026-07-15', weight_kg: 88, body_fat_pct: 9 })
    ]
  });

  assert.match(goal.verdict, /^Weight is binding/);
  assert.equal(goal.bindingId, 'weight');
  assert.doesNotMatch(goal.verdict, /31 October/);
});

test('missing readings stay missing and a future weigh-in is ignored', () => {
  const goal = buildBindingGoal({
    date: '2026-08-11',
    events: [
      event({ type: 'composition', date: '2026-08-12', weight_kg: 70, body_fat_pct: 20 }),
      event({ type: 'workout', date: '2026-08-02', status: 'planned', exercises: [
        { name: 'Bar Press', sets: [{ reps: 5, weight_kg: 80 }] }
      ] })
    ]
  });

  assert.match(goal.verdict, /^No binding goal yet/);
  assert.equal(goal.bindingId, null);
  assert.ok(goal.rows.every(row => row.status === 'unread'));
});
