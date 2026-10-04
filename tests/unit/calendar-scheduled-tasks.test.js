/**
 * A task with a time and an estimate happens at that time: it is a block on the
 * Day Dial and the Week / Linear grid, not a "Due · all day" row. Ticking it off
 * keeps it in place, struck through, and stops it loading the day.
 * Also: hour lines on the Tideline grid.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { tasksEventsFromTasks } from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { tonight } from '../../packages/design-kit/js/calendar/day-brief.js';
import { tonightFit } from '../../packages/design-kit/js/calendar/day-sense.js';
import { riverItemsFromHubEvents } from '../../packages/design-kit/js/calendar/term-river.js';
import { renderDayDial, unmountDayDial } from '../../packages/design-kit/js/calendar/render-day-dial.js';
import { renderTideline, hourVisibility } from '../../packages/design-kit/js/calendar/render-tideline.js';

const TODAY = '2026-10-04';
const WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

// The 4 Oct screenshot: HSC feedback emails at 15-minute slots, each with an estimate.
const TASKS = [
  { id: 'hsc-keith', title: 'HSC feedback email — Keith Pavlis', due_date: TODAY, due_time: '15:00', estimated_duration: 15, status: 'done' },
  { id: 'hsc-fergus', title: 'HSC feedback email — Fergus Eastman', due_date: TODAY, due_time: '15:15', estimated_duration: 15, status: 'open' },
  { id: 'deadline', title: 'Submit report', due_date: TODAY, due_time: '17:00', status: 'open' },
  { id: 'untimed', title: 'Reply to parent emails', due_date: TODAY, status: 'open' },
  { id: 'untimed-done', title: 'Old untimed', due_date: TODAY, status: 'done' }
];

function todayModel(tasks = TASKS, nowHour = 14.5) {
  const events = tasksEventsFromTasks(tasks);
  const model = buildTidelineModel({ events, week: WEEK, today: TODAY, nowHour });
  return { events, model, day: model.days.find((row) => row.date === TODAY) };
}

test('timed tasks with an estimate become grid blocks, not Due rows', () => {
  const { day } = todayModel();
  const fergus = day.chips.find((chip) => chip.id === 'hsc-fergus');
  assert.ok(fergus, 'open timed + estimated task is a chip');
  assert.equal(fergus.start, 15.25);
  assert.equal(fergus.end, 15.5);
  assert.equal(fergus.kind, 'task');
  assert.equal(fergus.filterKey, 'tasks');
  assert.equal(fergus.done, undefined);
  assert.deepEqual(day.due.map((row) => row.id).sort(), ['deadline', 'untimed'], 'time-only and untimed tasks stay Due; done untimed is gone');
});

test('a ticked-off timed task stays in its slot, struck, and stops loading the day', () => {
  const { day } = todayModel();
  const keith = day.chips.find((chip) => chip.id === 'hsc-keith');
  assert.ok(keith, 'done timed task is still on the grid');
  assert.equal(keith.done, true);
  assert.equal(keith.ambient, true, 'no load from a finished task');
  assert.match(keith.meta, /^Done · 3 pm – 3:15 pm$/);

  const brief = tonight({ date: TODAY, now: 14.5, chips: day.chips, due: [], ghosts: [], logs: [] });
  const row = brief.rows.find((item) => item.itemId === 'hsc-keith');
  assert.equal(row.struck, true);
  assert.equal(row.note, 'Done');

  const fit = tonightFit({ day, nowHour: 14.5, lightsOut: 22, events: [] });
  assert.equal(fit.free, 7.5 - 0.25, 'only the open block is booked');
});

test('term river skips done tasks', () => {
  const items = riverItemsFromHubEvents(tasksEventsFromTasks(TASKS));
  assert.equal(items.some((item) => item.id === 'hsc-keith'), false);
  assert.equal(items.some((item) => item.id === 'hsc-fergus'), true);
});

test('Day Dial draws timed tasks as arcs, done ones marked is-done', async () => {
  const { events } = todayModel();
  const win = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/day' });
  win.requestAnimationFrame = undefined;
  const host = win.document.createElement('div');
  win.document.body.append(host);
  renderDayDial(win.document, host, {
    hub: 'life', events, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 14.5,
    now: new Date('2026-10-04T03:30:00Z'),
    apiFetch: async () => new win.Response(JSON.stringify({ ok: true, data: {} })),
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 60));
  const open = host.querySelector('.dd-arc[data-id="hsc-fergus"]');
  const done = host.querySelector('.dd-arc[data-id="hsc-keith"]');
  assert.ok(open, 'open timed task arc');
  assert.ok(done, 'done timed task arc stays');
  assert.equal(done.classList.contains('is-done'), true);
  assert.equal(open.classList.contains('is-done'), false);
  unmountDayDial();
  win.close();
});

test('Week grid: timed tasks are chips, Due row keeps the rest, hour lines are drawn', async () => {
  const { events } = todayModel();
  const win = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/week' });
  win.requestAnimationFrame = undefined;
  const host = win.document.createElement('div');
  win.document.body.append(host);
  renderTideline(win.document, host, {
    hub: 'life', events, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 14.5,
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(host.querySelector('.cal-chip[data-id="hsc-fergus"]'));
  const done = host.querySelector('.cal-chip[data-id="hsc-keith"]');
  assert.ok(done.classList.contains('is-done'));
  assert.equal(done.classList.contains('is-ambient'), false, 'done paint, not the ambient dashed paint');
  assert.ok(done.querySelector('.cal-chip__tick'));
  assert.equal(host.querySelector('[data-part="due"][data-id="hsc-fergus"]'), null);
  assert.ok(host.querySelector('[data-part="due"][data-id="deadline"]'));

  const body = host.querySelector(`[data-part="day-body"][data-date="${TODAY}"]`);
  const lines = body.querySelectorAll('[data-part="hour-line"]');
  assert.ok(lines.length >= 10, 'an hour line per whole hour inside the bands');
  const labelled = [...host.querySelectorAll('[data-part="hour-line"] span')].map((span) => span.textContent);
  assert.ok(labelled.includes('noon') && labelled.includes('9pm'));
  assert.equal(labelled.includes('3pm'), false, '3pm sits 10 min from the 3:10 bell edge: no doubled line');
  win.close();
});

test('hour lines fade with band height; 3-hourly lines outlast the rest', () => {
  assert.deepEqual(hourVisibility(0, true), { line: 0, label: 0 });
  assert.equal(hourVisibility(10, false).line, 0, 'squeezed band: minor lines gone');
  assert.equal(hourVisibility(10, true).line, 1, 'squeezed band: 3-hourly lines stay');
  assert.equal(hourVisibility(26, false).line, 1);
  assert.equal(hourVisibility(26, false).label, 0, 'minor labels need room');
  assert.equal(hourVisibility(26, true).label, 1);
});
