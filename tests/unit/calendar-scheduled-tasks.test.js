/**
 * Planned time vs deadlines, and ticking things off from the calendar.
 * - A task's due time is a deadline (Due row). Planned time is a work block linked to
 *   the task (start – end): a chip on Week / Linear and an arc on the Day Dial.
 * - Ticked-off tasks and blocks stay where they were, struck through, and stop
 *   loading the day.
 * - Every calendar view can tick a task or block off, set its status, and plan time.
 * Also: hour lines on the Tideline grid.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { tasksEventsFromTasks, tasksEventsFromWorkBlocks } from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { tonight } from '../../packages/design-kit/js/calendar/day-brief.js';
import { tonightFit } from '../../packages/design-kit/js/calendar/day-sense.js';
import { riverItemsFromHubEvents } from '../../packages/design-kit/js/calendar/term-river.js';
import { itemPatchRequest, statusRequests, toggleItemDone } from '../../packages/design-kit/js/calendar/calendar-item-actions.js';
import { bindItemCard, itemCardHtml } from '../../packages/design-kit/js/calendar/calendar-item-card.js';
import { renderDayDial, unmountDayDial } from '../../packages/design-kit/js/calendar/render-day-dial.js';
import { renderTideline, hourVisibility } from '../../packages/design-kit/js/calendar/render-tideline.js';

const TODAY = '2026-10-04';
const WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

const TASKS = [
  // Time-blocked emails: the tasks themselves have no due time; the blocks carry start – end.
  { id: 'hsc-keith', title: 'HSC feedback email — Keith Pavlis', due_date: TODAY, status: 'done' },
  { id: 'hsc-fergus', title: 'HSC feedback email — Fergus Eastman', due_date: TODAY, status: 'open' },
  // A deadline with an estimate stays a deadline: never a 5–7pm block.
  { id: 'report', title: 'Submit report', due_date: TODAY, due_time: '17:00', estimated_duration: 120, status: 'open' },
  { id: 'untimed', title: 'Reply to parent emails', due_date: TODAY, status: 'open' },
  // Marking: two sessions planned for one task.
  { id: 'marking', title: 'Mark Year 12 essays', due_date: '2026-10-09', status: 'open' }
];

const BLOCKS = [
  { id: 'b-keith', task_id: 'hsc-keith', title: 'HSC feedback email — Keith Pavlis', date: TODAY, start_time: '15:00', duration_minutes: 15, status: 'confirmed' },
  { id: 'b-fergus', task_id: 'hsc-fergus', title: 'HSC feedback email — Fergus Eastman', date: TODAY, start_time: '15:15', duration_minutes: 15, status: 'confirmed' },
  { id: 'b-mark-1', task_id: 'marking', title: 'Mark Year 12 essays', date: TODAY, start_time: '19:00', duration_minutes: 60, status: 'done' },
  { id: 'b-mark-2', task_id: 'marking', title: 'Mark Year 12 essays', date: TODAY, start_time: '20:00', duration_minutes: 60, status: 'confirmed' }
];

function todayModel(nowHour = 14.5) {
  const events = [...tasksEventsFromTasks(TASKS), ...tasksEventsFromWorkBlocks(BLOCKS)];
  const model = buildTidelineModel({ events, week: WEEK, today: TODAY, nowHour });
  return { events, model, day: model.days.find((row) => row.date === TODAY) };
}

function fakeApi() {
  const calls = [];
  const apiFetch = async (path, init) => {
    calls.push({ path, method: init.method, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
  };
  return { calls, apiFetch };
}

test('due time is a deadline; planned time is a linked work block', () => {
  const { day } = todayModel();
  assert.equal(day.chips.some((chip) => chip.id === 'report'), false, 'time + estimate does not invent a block');
  const dueIds = day.due.filter((row) => !row.onGrid).map((row) => row.id);
  assert.equal(day.due.find((row) => row.id === 'hsc-fergus').onGrid, true, 'planners still see it; views skip it');
  // Fergus and Keith are on the grid today (blocks): not listed twice. Done last.
  assert.deepEqual(dueIds, ['untimed', 'report'], 'blocked today with no deadline time: grid only');
  const fergus = day.chips.find((chip) => chip.id === 'b-fergus');
  assert.equal(fergus.start, 15.25);
  assert.equal(fergus.end, 15.5);
  assert.equal(fergus.taskStatus, 'open');
  assert.equal(fergus.taskOpenBlocks, 1);
});

test('done stays in place: done task Due row, done block, block of a done task', () => {
  const { day } = todayModel();
  const doneDue = buildTidelineModel({ events: tasksEventsFromTasks(TASKS), week: WEEK, today: TODAY, nowHour: 14.5 })
    .days.find((row) => row.date === TODAY).due.find((row) => row.id === 'hsc-keith');
  assert.equal(doneDue.done, true, 'a done task with no block stays in Due, struck');
  assert.match(doneDue.meta, /^Done/);
  const keithBlock = day.chips.find((chip) => chip.id === 'b-keith');
  assert.equal(keithBlock.done, true, 'block of a ticked task reads done');
  assert.equal(keithBlock.ambient, true);
  const markOne = day.chips.find((chip) => chip.id === 'b-mark-1');
  assert.equal(markOne.done, true, 'a done block stays on the grid');
  assert.equal(day.chips.find((chip) => chip.id === 'b-mark-2').done, undefined);

  const brief = tonight({ date: TODAY, now: 14.5, chips: day.chips, due: day.due, ghosts: [], logs: [] });
  assert.equal(brief.rows.find((row) => row.itemId === 'b-keith').struck, true);

  const fit = tonightFit({ day, nowHour: 14.5, lightsOut: 22, events: [] });
  assert.equal(fit.free, 7.5 - 0.25 - 1, 'only open blocks are booked');
});

test('term river skips done tasks', () => {
  const items = riverItemsFromHubEvents(tasksEventsFromTasks(TASKS));
  assert.equal(items.some((item) => item.id === 'hsc-keith'), false);
  assert.equal(items.some((item) => item.id === 'hsc-fergus'), true);
});

test('ticking a task: one PATCH, undo restores the old status', async () => {
  const { day } = todayModel();
  const { calls, apiFetch } = fakeApi();
  const undo = await toggleItemDone(apiFetch, day.due.find((row) => row.id === 'untimed'));
  assert.deepEqual(calls, [{ path: '/api/tasks?id=untimed', method: 'PATCH', body: { status: 'done' } }]);
  await undo();
  assert.deepEqual(calls[1], { path: '/api/tasks?id=untimed', method: 'PATCH', body: { status: 'open' } });
  // A done one reopens.
  const reopen = statusRequests({ id: 'hsc-keith', kind: 'task', record: { type: 'task', id: 'hsc-keith', status: 'done' } }, 'open');
  assert.deepEqual(reopen.map((r) => [r.body, r.before]), [[{ status: 'open' }, { status: 'done' }]]);
});

test("ticking a task's last open block ticks the task; a task with more open blocks stays open", () => {
  const { day } = todayModel();
  const fergus = statusRequests(day.chips.find((chip) => chip.id === 'b-fergus'), 'done');
  assert.deepEqual(fergus.map((r) => [r.path, r.body.status, r.before.status]), [
    ['/api/work-blocks?id=b-fergus', 'done', 'confirmed'],
    ['/api/tasks?id=hsc-fergus', 'done', 'open']
  ]);
  const markTwo = statusRequests(day.chips.find((chip) => chip.id === 'b-mark-2'), 'done');
  assert.deepEqual(markTwo.map((r) => r.path), ['/api/work-blocks?id=b-mark-2', '/api/tasks?id=marking'], 'mark-1 is already done: this was the last open one');
  const unMarkOne = statusRequests(day.chips.find((chip) => chip.id === 'b-mark-1'), 'confirmed');
  assert.deepEqual(unMarkOne.map((r) => r.path), ['/api/work-blocks?id=b-mark-1'], 'task is not done: nothing else to reopen');
  const reopenKeith = statusRequests(day.chips.find((chip) => chip.id === 'b-keith'), 'confirmed');
  assert.deepEqual(reopenKeith.map((r) => [r.path, r.body.status]), [
    ['/api/work-blocks?id=b-keith', 'confirmed'],
    ['/api/tasks?id=hsc-keith', 'open']
  ], 'reopening a block of a done task reopens the task');
});

test('plan time on a task posts a linked work block; the deadline is untouched', () => {
  const { day } = todayModel();
  const report = day.due.find((row) => row.id === 'report');
  const request = itemPatchRequest(report, { block: { date: TODAY, start_time: '15:00', end_time: '17:00' } });
  assert.deepEqual(request, {
    path: '/api/work-blocks',
    method: 'POST',
    body: { title: 'Submit report', date: TODAY, start_time: '15:00', duration_minutes: 120, task_id: 'report', status: 'confirmed', source: 'manual' }
  });
  assert.equal(itemPatchRequest(report, { block: { date: TODAY, start_time: '15:00', end_time: '14:00' } }), null);
  assert.deepEqual(itemPatchRequest(report, { status: 'in_progress' }).body, { status: 'in_progress' });
});

test('item card: status pills save in one tap; Plan time is prefilled from time + estimate', async () => {
  const { day } = todayModel();
  const report = day.due.find((row) => row.id === 'report');
  const win = new Window();
  const node = win.document.createElement('div');
  node.innerHTML = itemCardHtml(report);
  const pills = [...node.querySelectorAll('[data-status]')].map((b) => [b.getAttribute('data-status'), b.getAttribute('aria-pressed')]);
  assert.deepEqual(pills, [['open', 'true'], ['in_progress', 'false'], ['done', 'false']]);
  assert.equal(node.querySelector('input[name="plan_start"]').value, '17:00');
  assert.equal(node.querySelector('input[name="plan_end"]').value, '19:00');
  assert.match(node.querySelector('[data-part="card-form"]').textContent, /Due by/);
  const saved = [];
  bindItemCard(node, report, { onSave: (patch) => saved.push(patch), onClose: () => {} });
  node.querySelector('[data-status="done"]').click();
  node.querySelector('[data-part="card-plan"]').dispatchEvent(new win.Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(saved, [{ status: 'done' }, { block: { date: TODAY, start_time: '17:00', end_time: '19:00' } }]);
  win.close();
});

test('Day Dial: blocks are arcs (done ones is-done); Tonight rows carry a tick that saves', async () => {
  const { events } = todayModel();
  const { calls, apiFetch } = fakeApi();
  const win = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/day' });
  win.requestAnimationFrame = undefined;
  // A Sunday wears the Dress watch (no tappable arcs); this test is about the Tool face's arcs.
  win.localStorage.setItem('hub-calendar:dial-face:life', 'tool');
  const host = win.document.createElement('div');
  win.document.body.append(host);
  renderDayDial(win.document, host, {
    hub: 'life', events, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 14.5,
    now: new Date('2026-10-04T03:30:00Z'), apiFetch,
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(host.querySelector('.dd-arc[data-id="b-keith"]').classList.contains('is-done'), true);
  assert.equal(host.querySelector('.dd-arc[data-id="b-fergus"]').classList.contains('is-done'), false);
  assert.equal(host.querySelector('.dd-arc[data-id="report"]'), null, 'a deadline is not an arc');
  const tick = host.querySelector('[data-part="tonight"] [data-tick="b-fergus"]');
  assert.ok(tick, 'Tonight row has a tick');
  tick.click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(host.querySelector('.dd-arc[data-id="b-fergus"]').classList.contains('is-done'), true, 'optimistic');
  assert.deepEqual(calls.map((c) => [c.path, c.body.status]), [
    ['/api/work-blocks?id=b-fergus', 'done'],
    ['/api/tasks?id=hsc-fergus', 'done']
  ]);
  unmountDayDial();
  win.close();
});

test('Day Dial: a data remount keeps page scroll (tick → onSourcesChanged must not jump to top)', async () => {
  const { events } = todayModel();
  const { apiFetch } = fakeApi();
  const win = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/day' });
  // Synchronous rAF so restore-after-settle runs inside this test.
  win.requestAnimationFrame = (cb) => {
    cb(0);
    return 0;
  };
  win.localStorage.setItem('hub-calendar:dial-face:life', 'tool');
  const host = win.document.createElement('div');
  // Tall spacer so the page can scroll past the dial (the wipe would otherwise clamp to 0).
  const spacer = win.document.createElement('div');
  spacer.style.height = '2400px';
  win.document.body.append(spacer, host);
  const input = {
    hub: 'life', events, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 14.5,
    now: new Date('2026-10-04T03:30:00Z'), apiFetch,
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  };
  renderDayDial(win.document, host, input);
  await new Promise((r) => setTimeout(r, 40));
  const scroller = win.document.scrollingElement || win.document.documentElement;
  scroller.scrollTop = 640;
  win.scrollTo(0, 640);
  // Simulate the post-tick remount (same path as onSourcesChanged → renderCalendarSection).
  renderDayDial(win.document, host, {
    ...input,
    events: events.map((item) =>
      item.record?.id === 'b-fergus'
        ? { ...item, record: { ...item.record, status: 'done' }, done: true }
        : item
    )
  });
  assert.equal(scroller.scrollTop, 640, 'scrollingElement stays put across a Day Dial remount');
  assert.equal(win.scrollY, 640, 'window scroll stays put across a Day Dial remount');
  unmountDayDial();
  win.close();
});

test('Week grid: ticks on blocks and Due rows, deadlines stay Due, hour lines drawn', async () => {
  const { events } = todayModel();
  const { calls, apiFetch } = fakeApi();
  const win = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/week' });
  win.requestAnimationFrame = undefined;
  const host = win.document.createElement('div');
  win.document.body.append(host);
  renderTideline(win.document, host, {
    hub: 'life', events, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 14.5, apiFetch,
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 40));
  const keith = host.querySelector('.cal-chip[data-id="b-keith"]');
  assert.ok(keith.classList.contains('is-done'));
  assert.equal(keith.classList.contains('is-ambient'), false, 'done paint, not the ambient dashed paint');
  assert.equal(keith.querySelector('[data-tick]').getAttribute('aria-pressed'), 'true');
  assert.ok(host.querySelector('[data-part="due"][data-id="report"]'), 'deadline stays in Due');

  host.querySelector('[data-part="due"][data-id="untimed"] [data-tick]').click();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(host.querySelector('[data-part="due"][data-id="untimed"]').classList.contains('is-done'), 'optimistic');
  assert.deepEqual(calls.map((c) => [c.path, c.body.status]), [['/api/tasks?id=untimed', 'done']]);
  assert.equal(host.querySelector('[data-part="chip-popover"]').hidden, true, 'the tick does not open the card');

  const body = host.querySelector(`[data-part="day-body"][data-date="${TODAY}"]`);
  assert.ok(body.querySelectorAll('[data-part="hour-line"]').length >= 10, 'an hour line per whole hour inside the bands');
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
