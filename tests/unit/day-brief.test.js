import test from 'node:test';
import assert from 'node:assert/strict';
import { clock12, formatDuration, holidayRun, lightsOutFor, tonight, tomorrow } from '../../apps/life/js/app/day-brief.js';

// Thursday 24/09/26 at 6:05 pm (the Tideline fixture).
const NOW = 18 + 5 / 60;
const CHIPS = [
  { id: 'class-p1', start: 8 + 40 / 60, end: 9 + 35 / 60, kind: 'teaching', title: 'Y12 English Adv', isClass: true },
  { id: 'gastro', start: 13.25, end: 14.25, kind: 'health', title: 'Gastroenterologist follow-up', meta: '1:15 pm' },
  { id: 'thu-workout', start: 18.25, end: 19 + 25 / 60, kind: 'fitness', title: 'Workout · upper body', meta: 'Chadwick’s plan' },
  { id: 'thu-corey', start: 19.5, end: 21.5, kind: 'corey', title: 'Tea + TV with Corey', protected: true }
];
const GHOSTS = [
  { id: 'g-skip', agent: 'sara', kind: 'skip_workout', date: '2026-09-24', label: 'Skip workout', overItem: 'thu-workout' },
  { id: 'g-bed', agent: 'sara', kind: 'bedtime', date: '2026-09-24', time: '22:00', reason: '5.4 h last night', label: 'Lights out 10:00' },
  { id: 'g-move', agent: 'hammond', kind: 'move_task', taskId: 'task-josh-y10', label: '→ T4 W1' }
];
const LOGS = [
  { type: 'meal', date: '2026-09-24', meal: 'breakfast', time: '07:10' },
  { type: 'diary', date: '2026-09-24', time: '07:40' }
];

test('durations and clocks read like a person wrote them', () => {
  assert.equal(formatDuration(235), '3 h 55 m');
  assert.equal(formatDuration(60), '1 h');
  assert.equal(formatDuration(25), '25 m');
  assert.equal(clock12(18.5), '6:30 pm');
  assert.equal(clock12(22), '10:00 pm');
  assert.equal(clock12(0), '12:00 am');
});

test('tonight: 3 h 55 m left, and what fills it', () => {
  const t = tonight({ date: '2026-09-24', now: NOW, chips: CHIPS, ghosts: GHOSTS, logs: LOGS });
  assert.equal(t.timeLeft.label, '3 h 55 m that’s yours'.replace('’', "'"));
  assert.equal(t.timeLeft.until, '10:00 pm');
  assert.equal(t.timeLeft.by, 'Sara');
  assert.deepEqual(t.rows.map(r => r.title), ['Workout · upper body', 'Dinner', 'Tea + TV with Corey', 'Wind down → lights out 10:00 pm']);
  const workout = t.rows[0];
  assert.equal(workout.ghostId, 'g-skip');
  assert.equal(workout.suggestion, 'Sara: skip workout');
  assert.match(t.rows[1].note, /Nothing logged since breakfast \(no lunch\)/);
  assert.match(t.rows[2].note, /^Protected · 2 h/);
  assert.equal(t.rows[3].ghostId, 'g-bed');
  assert.ok(!t.rows.some(r => r.title === 'Gastroenterologist follow-up'), 'past items are gone');
  assert.ok(!t.rows.some(r => r.title === 'Y12 English Adv'), 'classes never appear');
});

test('an accepted skip strikes the workout; an earlier bedtime shortens the evening', () => {
  const chips = CHIPS.map(c => (c.id === 'thu-workout' ? { ...c, skipped: true } : c));
  const ghosts = [{ ...GHOSTS[0], status: 'accepted' }, { ...GHOSTS[1], time: '21:30' }];
  const t = tonight({ date: '2026-09-24', now: NOW, chips, ghosts, logs: LOGS });
  assert.equal(t.rows[0].struck, true);
  assert.equal(t.rows[0].note, 'Skipped');
  assert.equal(t.rows[0].ghostId, null);
  assert.equal(t.timeLeft.label, "3 h 25 m that's yours");
  assert.equal(lightsOutFor('2026-09-24', ghosts), 21.5);
});

test('a logged dinner removes the Dinner row; after lights out the evening is done', () => {
  const logs = [...LOGS, { type: 'meal', date: '2026-09-24', meal: 'dinner', time: '18:00' }];
  assert.ok(!tonight({ date: '2026-09-24', now: NOW, chips: CHIPS, ghosts: [], logs }).rows.some(r => r.title === 'Dinner'));
  const late = tonight({ date: '2026-09-24', now: 22.5, chips: CHIPS, ghosts: [], logs });
  assert.equal(late.timeLeft.label, 'Your evening is done');
  assert.deepEqual(late.rows, []);
});

test('tomorrow: the PD, the task with Hammond’s move, and the holidays after', () => {
  const t = tomorrow({
    date: '2026-09-25',
    chips: [
      { id: 'pd', start: 8.5, end: 10.5, kind: 'professional', title: 'Courageously Navigating Hard Conversations', meta: '8:30 – 10:30 am · PD' },
      { id: 'c3', start: 10.83, end: 11.75, kind: 'teaching', title: 'Y11 English Adv', isClass: true },
      { id: 'c5', start: 13.33, end: 14.25, kind: 'teaching', title: 'Y12 English Adv', isClass: true }
    ],
    due: [{ id: 'task-josh-y10', title: 'Find out about Year 10 leadership opportunities for Josh Lizzio' }],
    ghosts: GHOSTS,
    capacity: { pct: 52, forecast: true },
    tag: { text: 'Last day T3' },
    holidayDaysAfter: holidayRun('2026-09-26', [{ starts_on: '2026-07-21', ends_on: '2026-09-25' }, { starts_on: '2026-10-13', ends_on: '2026-12-17' }])
  });
  assert.equal(t.headline, 'Forecast 52%');
  assert.equal(t.tag, 'Last day T3');
  assert.equal(t.note, 'One big thing and 2 classes, then holidays for 17 days.');
  assert.deepEqual(t.rows.map(r => r.time), ['8:30 am', 'Due']);
  assert.equal(t.rows[1].ghostId, 'g-move');
  assert.equal(t.rows[1].suggestion, 'Hammond: move to T4 W1');
});

test('holiday runs', () => {
  const terms = [{ starts_on: '2026-10-13', ends_on: '2026-12-17' }];
  assert.equal(holidayRun('2026-09-26', terms), 17);
  assert.equal(holidayRun('2026-10-20', terms), 0);
});

test('an accepted bedtime stays as a plain row; a dismissed one is gone', () => {
  const accepted = tonight({ date: '2026-09-24', now: NOW, chips: CHIPS, ghosts: [{ ...GHOSTS[1], status: 'accepted' }], logs: LOGS });
  const row = accepted.rows.find(r => r.title.startsWith('Wind down'));
  assert.ok(row && row.ghostId === null);
  const dismissed = tonight({ date: '2026-09-24', now: NOW, chips: CHIPS, ghosts: [{ ...GHOSTS[1], status: 'dismissed' }], logs: LOGS });
  assert.ok(!dismissed.rows.some(r => r.title.startsWith('Wind down')));
  assert.equal(dismissed.timeLeft.by, null);
});
