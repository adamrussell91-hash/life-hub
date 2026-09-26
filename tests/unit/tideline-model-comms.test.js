import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';

const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];

const events = [
  { path: 'p:1', record: { type: 'professional_communication', id: 'c1', date: '2026-09-22', time: '08:40', duration_min: 15, title: 'Fletcher W. · session 7', pin: false } },
  { path: 'p:2', record: { type: 'professional_communication', id: 'c2', date: '2026-09-21', time: '09:10', duration_min: 1, title: 'Email Amy W.', pin: true, channel: 'email' } },
  { path: 'p:3', record: { type: 'professional_event', id: 'e1', date: '2026-09-25', time: '18:00', duration_min: 105, title: 'HALT medal ceremony', event_type: 'ceremony' } },
  { path: 'ledger:a', record: { type: 'ledger_item', id: 'ledger_a', date: '2026-09-23', title: 'You owe · Email Denielle · 3 days late', direction: 'you_owe', late: true } }
];

function build(inputEvents) {
  return buildTidelineModel({
    events: inputEvents,
    week: WEEK,
    today: '2026-09-26',
    nowHour: 12,
    terms: [
      { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
      { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
    ]
  });
}

test('comms are comm chips; pins stay short; non-PD events are event chips; promises are dues', () => {
  const model = build(events);
  const chips = model.days.flatMap((day) => day.chips);
  const session = chips.find((chip) => chip.id === 'c1');
  assert.equal(session.kind, 'comm');
  assert.equal(session.filterKey, 'comms');
  const pin = chips.find((chip) => chip.id === 'c2');
  assert.equal(pin.pin, true);
  assert.ok(pin.end - pin.start <= 0.4 + 1e-9);
  const ceremony = chips.find((chip) => chip.id === 'e1');
  assert.equal(ceremony.kind, 'event');
  assert.equal(ceremony.filterKey, 'events');
  const wed = model.days.find((day) => day.date === '2026-09-23');
  assert.deepEqual(wed.due.map((due) => [due.kind, due.filterKey, due.late]), [['promise', 'promises', true]]);
});
