import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRiverCapacity, buildRiverCommitments, riverInputFingerprint } from '../../packages/design-kit/js/calendar/term-river-capacity.js';
import { capacityForDates } from '../../packages/design-kit/js/calendar/capacity-model.js';
import { withCheckins, resetCheckins } from '../../packages/design-kit/js/calendar/readiness-checkins.js';
import { weeklyLoad } from '../../packages/design-kit/js/calendar/term-river.js';
import { isHoliday } from '../../packages/design-kit/js/school-time.js';

const terms = [{ term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }];
const dates = ['2026-10-14', '2026-10-15', '2026-10-16'];
const events = [{ path: 'sleep/a', record: { id: 'a', type: 'sleep', date: dates[0], duration_h: 5 } }];

test('live river capacity equals Day and Week with forecast flags and explanations intact', () => {
  resetCheckins();
  const input = { events, today: dates[1], terms };
  const actual = buildRiverCapacity(input, dates);
  const expected = capacityForDates(withCheckins(events, { today: input.today }), dates, { today: input.today, isHoliday: date => isHoliday(date, terms) });
  assert.deepEqual(actual, expected);
  assert.equal(actual.get(dates[0]).forecast, false);
  assert.equal(actual.get(dates[2]).forecast, true);
});

test('fixture capacity yields to live workload, sleep, diary and check-in input', () => {
  const input = { events, today: dates[1], terms, visual: { RIVER: { LOGGED: { [dates[0]]: 99 } } } };
  assert.notEqual(buildRiverCapacity(input, dates).get(dates[0]).pct, 99);
});

test('fingerprint sees changed records and visual items even with same ids/count', () => {
  const input = { today: dates[1], events, visual: { RIVER: { ITEMS: [{ id: 'same', title: 'Before', date: dates[0] }] } } };
  const stamp = riverInputFingerprint(input);
  assert.notEqual(stamp, riverInputFingerprint({ ...input, events: [{ ...events[0], record: { ...events[0].record, duration_h: 9 } }] }));
  assert.notEqual(stamp, riverInputFingerprint({ ...input, visual: { RIVER: { ITEMS: [{ id: 'same', title: 'After', date: dates[0] }] } } }));
  assert.equal(stamp, riverInputFingerprint(structuredClone(input)));
});


test('sleep and prior workload edits change river readiness immediately', () => {
  const input = { events, today: dates[1], terms };
  const before = buildRiverCapacity(input, dates);
  const rested = buildRiverCapacity({ ...input, events: [{ ...events[0], record: { ...events[0].record, duration_h: 9 } }] }, dates);
  assert.notEqual(before.get(dates[0]).pct, rested.get(dates[0]).pct);
  const worked = buildRiverCapacity({ ...input, events: [...events, { path: 'work/a', record: { id: 'work-a', type: 'work_session', date: dates[0], time: '08:00', end_time: '18:00' } }] }, dates);
  assert.notEqual(before.get(dates[1]).pct, worked.get(dates[1]).pct);
});


const commitment = record => ({ path: `${record.type}:${record.id}`, record: { date: dates[0], time: '09:00', ...record } });
const booked = input => weeklyLoad({ from: '2026-10-12', to: '2026-10-18', terms, commitments: buildRiverCommitments(input), capacityFor: () => 100 })[0].booked;

test('river booked hours follow live appointments, meetings and work blocks rather than fixtures', () => {
  const input = {
    events: [
      commitment({ id: 'appointment', type: 'medical', end_time: '10:00' }),
      commitment({ id: 'meeting', type: 'professional_meeting', duration_min: 90 }),
      commitment({ id: 'block', type: 'work_block', duration_min: 30 })
    ],
    visual: { RIVER: { COMMITMENTS: [{ date: dates[0], start: 9, end: 17 }] } }
  };
  assert.equal(booked(input), 3);
  const before = riverInputFingerprint(input);
  input.events[2].record.duration_min = 150;
  assert.notEqual(before, riverInputFingerprint(input));
  assert.equal(booked(input), 5);
  assert.equal(buildRiverCommitments(input).find(item => item.id === 'block').end, 11.5);
});

test('river load uses shared class, protected, ghost, log and finished-work exclusions', () => {
  const input = { events: [
    commitment({ id: 'class', type: 'scheduled_lesson', end_time: '15:00' }),
    commitment({ id: 'protected', type: 'calendar_block', kind: 'focus', protected: true, end_time: '15:00' }),
    commitment({ id: 'corey', type: 'calendar_block', kind: 'corey', end_time: '15:00' }),
    commitment({ id: 'ghost', type: 'work_block', ghost: true, duration_min: 120 }),
    commitment({ id: 'proposed', type: 'work_block', status: 'proposed', duration_min: 120 }),
    commitment({ id: 'log', type: 'work_session', end_time: '15:00' }),
    commitment({ id: 'sleep', type: 'sleep', duration_h: 8 }),
    commitment({ id: 'finished', type: 'work_block', status: 'done', duration_min: 120 }),
    commitment({ id: 'linked', type: 'work_block', task_id: 'done-task', duration_min: 120 }),
    { record: { id: 'done-task', type: 'task', date: dates[0], status: 'done' } },
    commitment({ id: 'ambient', type: 'ical_event', ambient: true, end_time: '15:00' }),
    commitment({ id: 'open', type: 'work_block', duration_min: 60 })
  ] };
  assert.equal(booked(input), 1);
});

test('river commitment fixtures only apply without live events and invalid times never poison booked hours', () => {
  const visual = { RIVER: { COMMITMENTS: [{ date: dates[0], start: 9, end: 11 }] } };
  assert.equal(booked({ visual, events: [] }), 2);
  assert.equal(booked({ visual, events: [commitment({ id: 'sleep', type: 'sleep' })] }), 0);
  assert.equal(booked({ events: [
    commitment({ id: 'invalid', type: 'work_block', time: 'later', duration_min: 60 }),
    commitment({ id: 'backwards', type: 'medical', end_time: '08:00' }),
    commitment({ id: 'negative', type: 'work_block', duration_min: -60 }),
    commitment({ id: 'valid', type: 'professional_meeting', duration_min: 60 })
  ] }), 1);
});
