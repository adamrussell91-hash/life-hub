import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';

const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];

const events = [
  { path: 'p:1', record: { type: 'professional_communication', id: 'c1', date: '2026-09-22', time: '08:40', duration_min: 15, title: 'Sam K. · session 7', pin: false } },
  { path: 'p:2', record: { type: 'professional_communication', id: 'c2', date: '2026-09-21', time: '09:10', duration_min: 1, title: 'Email Nadia K.', pin: true, channel: 'email' } },
  { path: 'p:3', record: { type: 'professional_event', id: 'e1', date: '2026-09-25', time: '18:00', duration_min: 105, title: 'HALT medal ceremony', event_type: 'ceremony' } },
  { path: 'ledger:a', record: { type: 'ledger_item', id: 'ledger_a', date: '2026-09-23', title: 'You owe · Email Grace · 3 days late', direction: 'you_owe', late: true } }
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

test('covering Life visual still keeps Professional overlays and ledger promises', () => {
  const visual = {
    ITEMS: [{ id: 'life-meds', date: '2026-09-22', start: '07:00', end: '07:15', kind: 'health', title: 'Meds' }],
    DUE: [],
    WALLS: [],
    FREE: []
  };
  const model = buildTidelineModel({
    events: [
      ...events,
      {
        path: 'p:meet',
        record: {
          type: 'professional_meeting',
          id: 'm1',
          date: '2026-09-22',
          time: '10:00',
          duration_min: 45,
          title: 'Seth planning'
        }
      },
      {
        path: 'p:pd',
        record: {
          type: 'professional_event',
          id: 'e2',
          date: '2026-09-22',
          time: '15:00',
          duration_min: 60,
          title: 'Warlight PL',
          event_type: 'professional_development'
        }
      }
    ],
    visual,
    week: WEEK,
    today: '2026-09-26',
    nowHour: 12,
    terms: [
      { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
      { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
    ]
  });
  assert.ok(model.visual, 'visual covers the week');
  const chips = model.days.flatMap((day) => day.chips);
  assert.equal(chips.some((chip) => chip.id === 'life-meds'), true);
  assert.equal(chips.find((chip) => chip.id === 'c1')?.filterKey, 'comms');
  assert.equal(chips.find((chip) => chip.id === 'm1')?.filterKey, 'meetings');
  assert.equal(chips.find((chip) => chip.id === 'e1')?.filterKey, 'events');
  assert.equal(chips.find((chip) => chip.id === 'e2')?.filterKey, 'pd');
  const wed = model.days.find((day) => day.date === '2026-09-23');
  assert.deepEqual(wed.due.map((due) => [due.kind, due.filterKey]), [['promise', 'promises']]);
});
