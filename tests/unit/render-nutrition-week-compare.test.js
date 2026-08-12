import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekCompareBars } from '../../js/app/render-nutrition.js';

function day(date, protein_g) {
  return { date, protein_g };
}

test('buildWeekCompareBars yields 14 slots: prior then this with series tags', () => {
  const previousWeek = [
    day('2026-07-17', 10),
    day('2026-07-18', 20),
    day('2026-07-19', 30),
    day('2026-07-20', 40),
    day('2026-07-21', 50),
    day('2026-07-22', 60),
    day('2026-07-23', 70)
  ];
  const week = [
    day('2026-07-24', 15),
    day('2026-07-25', 25),
    day('2026-07-26', 35),
    day('2026-07-27', 45),
    day('2026-07-28', 55),
    day('2026-07-29', 65),
    day('2026-07-30', 75)
  ];

  const slots = buildWeekCompareBars(week, previousWeek);
  assert.equal(slots.length, 14);
  assert.deepEqual(slots.map(slot => slot.series), [
    ...Array(7).fill('prior'),
    ...Array(7).fill('this')
  ]);
  assert.equal(slots[0].date, '2026-07-17');
  assert.equal(slots[0].value, 10);
  assert.equal(slots[0].series, 'prior');
  assert.equal(slots[7].date, '2026-07-24');
  assert.equal(slots[7].value, 15);
  assert.equal(slots[7].series, 'this');
  assert.equal(slots[13].date, '2026-07-30');
  assert.ok(slots.every(slot => typeof slot.label === 'string' && slot.label.length > 0));
});

test('buildWeekCompareBars tolerates short weeks without inventing days', () => {
  const slots = buildWeekCompareBars(
    [day('2026-07-30', 40)],
    [day('2026-07-20', 20), day('2026-07-21', 30)]
  );
  assert.equal(slots.length, 3);
  assert.deepEqual(slots.map(slot => slot.series), ['prior', 'prior', 'this']);
});
