/**
 * Day Sense step 4: what actually happened (work sessions), tonight's overflow,
 * and the week's "what this day costs you" line.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { tasksEventsFromTasks, tasksEventsFromWorkBlocks, tasksEventsFromWorkSessions } from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { actualSpans, dayCost, tonightFit, trackedHours } from '../../packages/design-kit/js/calendar/day-sense.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { renderTideline } from '../../packages/design-kit/js/calendar/render-tideline.js';
import { renderDayDial, unmountDayDial } from '../../packages/design-kit/js/calendar/render-day-dial.js';

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

const TODAY = '2026-09-29';
const WEEK = ['2026-09-28', TODAY, '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const NOW = Date.parse('2026-09-29T19:30:00+10:00');

const TASKS = [
  { id: 'reports', title: 'Year 11 reports', due_date: TODAY, status: 'open', estimated_duration: 150 },
  { id: 'emails', title: 'Emails', due_date: TODAY, status: 'open', estimated_duration: 30 },
  { id: 'unyouth', title: 'UNYouth planning', due_date: TODAY, status: 'open' }
];
const SESSIONS = [
  { id: 's1', task_id: 'reports', started_at: '2026-09-29T15:40:00+10:00', finished_at: '2026-09-29T16:10:00+10:00', result: 'partial' },
  { id: 's2', task_id: 'emails', started_at: '2026-09-29T19:00:00+10:00', finished_at: null, result: 'open' },
  { id: 'old', task_id: 'emails', started_at: '2026-08-01T09:00:00+10:00', finished_at: '2026-08-01T10:00:00+10:00' }
];

test('work sessions become Sydney-dated actual spans; open ones run to now; old ones drop', () => {
  const titles = new Map(TASKS.map((task) => [task.id, task.title]));
  const events = tasksEventsFromWorkSessions(SESSIONS, titles, { now: NOW });
  assert.deepEqual(events.map((event) => [event.record.id, event.record.date, event.record.time, event.record.end_time]), [
    ['s1', TODAY, '15:40', '16:10'],
    ['s2', TODAY, '19:00', '19:30']
  ]);
  const spans = actualSpans(events, TODAY);
  assert.equal(spans[0].title, 'Year 11 reports');
  assert.equal(spans[1].open, true);
  assert.equal(Math.round(trackedHours(spans) * 60), 60);
});

test('tonight: estimated due work vs free hours to lights-out; unestimated named, not guessed', () => {
  const titles = new Map(TASKS.map((task) => [task.id, task.title]));
  const events = [
    ...tasksEventsFromTasks(TASKS),
    ...tasksEventsFromWorkSessions(SESSIONS, titles, { now: NOW }),
    { record: { type: 'ical_event', feed: 'family', id: 'dinner', date: TODAY, time: '20:00', end_time: '21:00', title: 'Dinner at Mum’s', ambient: true } }
  ];
  const model = buildTidelineModel({ events, week: WEEK, today: TODAY, nowHour: 19.5 });
  const day = model.days.find((row) => row.date === TODAY);
  const fit = tonightFit({ day, nowHour: 19.5, lightsOut: 22, events });
  // Free: 2.5 h minus the 1 h dinner = 1.5 h. Need: reports 2.5 - 0.5 tracked = 2 h; emails 0.5 - 0.5 = 0.
  assert.equal(fit.free, 1.5);
  assert.equal(fit.need, 2);
  assert.equal(fit.over, 0.5);
  assert.deepEqual(fit.spill.map((row) => [row.title, row.hours]), [['Year 11 reports', 0.5]]);
  assert.deepEqual(fit.unestimated, ['UNYouth planning']);
});

test('week: booked hours, and an over day suggests one concrete move to the best day with room', () => {
  const blocks = [
    { id: 'wb-mark', title: 'Marking', date: TODAY, start_time: '15:30', duration_minutes: 180, status: 'confirmed' },
    { id: 'wb-plan', title: 'Planning', date: TODAY, start_time: '19:00', duration_minutes: 120, status: 'confirmed' },
    { id: 'wb-admin', title: 'Admin', date: TODAY, start_time: '12:00', duration_minutes: 60, status: 'confirmed' }
  ];
  const model = buildTidelineModel({ events: tasksEventsFromWorkBlocks(blocks), week: WEEK, today: TODAY, nowHour: 9 });
  const day = model.days.find((row) => row.date === TODAY);
  assert.equal(day.cost.text, '6 h booked');
  assert.equal(day.cost.over, true);
  assert.equal(day.cost.move.id, 'wb-mark', 'the longest movable block');
  assert.ok(day.cost.move.to > TODAY);
  const quiet = model.days.find((row) => row.date === '2026-10-01');
  assert.deepEqual([quiet.cost.text, quiet.cost.move], ['', null]);
  assert.equal(dayCost({ ...day, date: '2026-09-28' }, model.days, TODAY).move, null, 'past days never suggest moves');
});

test('the costs-you move button saves the block on the suggested day, same time', async () => {
  const window = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar' });
  window.requestAnimationFrame = undefined;
  const doc = window.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  const calls = [];
  const blocks = [
    { id: 'wb-mark', title: 'Marking', date: TODAY, start_time: '15:30', duration_minutes: 180, status: 'confirmed' },
    { id: 'wb-plan', title: 'Planning', date: TODAY, start_time: '19:00', duration_minutes: 120, status: 'confirmed' },
    { id: 'wb-admin', title: 'Admin', date: TODAY, start_time: '12:00', duration_minutes: 60, status: 'confirmed' }
  ];
  renderTideline(doc, host, {
    hub: 'life', events: tasksEventsFromWorkBlocks(blocks), ghosts: [], week: WEEK, today: TODAY, nowHour: 9,
    apiFetch: async (path, init) => {
      calls.push([path, JSON.parse(init.body)]);
      return new window.Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
    },
    onSourcesChanged: () => {}, onSwitchView: () => {}, onShiftRange: () => {}, onSelectDate: () => {}
  });
  const button = host.querySelector('[data-cost-move="wb-mark"]');
  assert.ok(button, 'move offered in the day header');
  const to = button.dataset.costTo;
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, [['/api/work-blocks?id=wb-mark', { date: to, start_time: '15:30', duration_minutes: 180 }]]);
});

test('Day dial: actual track and the overflow arc past lights-out', async () => {
  const window = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/day' });
  window.requestAnimationFrame = undefined;
  const doc = window.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  const titles = new Map(TASKS.map((task) => [task.id, task.title]));
  const events = [...tasksEventsFromTasks(TASKS), ...tasksEventsFromWorkSessions(SESSIONS, titles, { now: NOW })];
  renderDayDial(doc, host, {
    hub: 'life', events, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 21, now: new Date(NOW),
    apiFetch: async () => new window.Response('{}'), onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(host.querySelectorAll('[data-part="actual-track"] .dd-actual').length, 2);
  assert.ok(host.querySelector('[data-part="overflow"]'), 'overflow arc drawn');
  assert.match(host.querySelector('[data-part="overflow-note"]').textContent, /Doesn't fit tonight: Year 11 reports/);
  assert.match(host.querySelector('[data-part="tracked"]').textContent, /Tracked today: 1 h/);
  unmountDayDial();
});
