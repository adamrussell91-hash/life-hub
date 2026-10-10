/**
 * Calendar items are live in every hub: a click on a chip or a Due row opens the
 * item card (context, edit, ↗ new tab); moves and edits save to the owning API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import {
  canMoveItem,
  canResizeItem,
  dragPatch,
  editableFields,
  itemPatchRequest,
  newTabHref,
  saveCalendarItem
} from '../../packages/design-kit/js/calendar/calendar-item-actions.js';
import { itemCardHtml, itemCardPatch } from '../../packages/design-kit/js/calendar/calendar-item-card.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { tasksEventsFromTasks, tasksEventsFromWorkBlocks } from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { renderTideline } from '../../packages/design-kit/js/calendar/render-tideline.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TODAY = '2026-09-29';
const WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

const TASKS = tasksEventsFromTasks([
  {
    id: 'task-emails',
    title: 'Respond to student emails',
    due_date: TODAY,
    status: 'open',
    priority: 'high',
    description: 'Year 11 extension requests first.'
  },
  { id: 'task-timed', title: 'Submit report', due_date: TODAY, due_time: '15:30', status: 'open' }
]);
const BLOCKS = tasksEventsFromWorkBlocks([
  { id: 'wb-1', title: 'Marking block', date: TODAY, start_time: '16:00', duration_minutes: 90, status: 'confirmed', task_id: 'task-emails' }
]);

test('task records carry the context the item card shows', () => {
  const record = TASKS[0].record;
  assert.equal(record.priority, 'high');
  assert.equal(record.description, 'Year 11 extension requests first.');
  assert.equal(BLOCKS[0].record.task_id, 'task-emails');
});

test('Due rows carry their task record; timed tasks with no end land in Due with the time', () => {
  const model = buildTidelineModel({ events: [...TASKS, ...BLOCKS], week: WEEK, today: TODAY, nowHour: 12 });
  const due = model.days.find((day) => day.date === TODAY).due;
  assert.deepEqual(due.map((row) => row.id), ['task-emails', 'task-timed']);
  assert.equal(due[0].record.description, 'Year 11 extension requests first.');
  assert.equal(due[0].source, 'task');
  assert.match(due[1].meta, /3:30 pm/);
  const chip = model.days.find((day) => day.date === TODAY).chips.find((row) => row.id === 'wb-1');
  assert.equal(chip.record.type, 'work_block');
});

test('capabilities: tasks and lessons move, only work blocks resize, other hubs are read-only here', () => {
  assert.equal(canMoveItem({ record: { type: 'task', id: 't' } }), true);
  assert.equal(canMoveItem({ kind: 'task', id: 't' }), true, 'Due row without record is a task');
  assert.equal(canMoveItem({ kind: 'task', id: 't', start: 9, end: 10 }), false, 'untyped grid chip is not guessed');
  assert.equal(canMoveItem({ record: { type: 'scheduled_lesson', id: 's' } }), true);
  assert.equal(canMoveItem({ record: { type: 'professional_meeting', id: 'm' } }), false);
  assert.equal(canMoveItem({ record: { type: 'work_block', id: 'w' }, ghost: {} }), false);
  assert.equal(canResizeItem({ record: { type: 'work_block', id: 'w' } }), true);
  assert.equal(canResizeItem({ record: { type: 'scheduled_lesson', id: 's' } }), false);
  assert.deepEqual(editableFields({ record: { type: 'task', id: 't' } }), ['title', 'date', 'time', 'bookmark', 'resumability', 'max_block', 'notes']);
});

test('patch requests map to each owning API', () => {
  assert.deepEqual(itemPatchRequest({ record: { type: 'task', id: 't 1' } }, { date: '2026-10-01', notes: 'hi' }), {
    path: '/api/tasks?id=t%201',
    method: 'PATCH',
    body: { due_date: '2026-10-01', description: 'hi' }
  });
  assert.deepEqual(itemPatchRequest({ record: { type: 'work_block', id: 'w' } }, { date: '2026-10-01', start_time: '09:15', duration_min: 45 }), {
    path: '/api/work-blocks?id=w',
    method: 'PATCH',
    body: { date: '2026-10-01', start_time: '09:15', duration_minutes: 45 }
  });
  assert.deepEqual(itemPatchRequest({ record: { type: 'scheduled_lesson', id: 's' } }, { date: '2026-10-01' }), {
    path: '/api/scheduled-lessons/s',
    method: 'PATCH',
    body: { date: '2026-10-01' }
  });
  assert.equal(itemPatchRequest({ record: { type: 'professional_meeting', id: 'm' } }, { date: '2026-10-01' }), null);
});

test('dragPatch keeps a block length and turns a resize into a duration', () => {
  const block = { record: { type: 'work_block', id: 'w', duration_min: 90 } };
  assert.deepEqual(dragPatch(block, { date: '2026-10-01', start_time: '10:00' }), { date: '2026-10-01', start_time: '10:00', duration_min: 90 });
  assert.deepEqual(dragPatch(block, { date: TODAY, start_time: '16:00', end_time: '18:15' }), { date: TODAY, start_time: '16:00', duration_min: 135 });
  assert.deepEqual(dragPatch({ kind: 'task', id: 't' }, { date: '2026-10-02' }), { date: '2026-10-02' });
});

test('saveCalendarItem surfaces API errors', async () => {
  const fail = async () => new Response(JSON.stringify({ ok: false, error: { message: 'Task not found' } }), { status: 404 });
  await assert.rejects(saveCalendarItem(fail, { record: { type: 'task', id: 't' } }, { date: TODAY }), /Task not found/);
  const calls = [];
  const ok = async (path, init) => {
    calls.push([path, JSON.parse(init.body)]);
    return new Response(JSON.stringify({ ok: true, data: { id: 't' } }), { status: 200 });
  };
  await saveCalendarItem(ok, { record: { type: 'task', id: 't' } }, { date: TODAY, start_time: null });
  assert.deepEqual(calls, [['/api/tasks?id=t', { due_date: TODAY, due_time: null }]]);
});

test('new-tab links resolve to the umbrella path of the owning hub', () => {
  const location = { href: 'https://life-hub.adam-russell.com/#/calendar' };
  assert.equal(newTabHref({ record: { type: 'task', id: 'a' } }, { location }), 'https://life-hub.adam-russell.com/tasks/#/task/a');
  assert.equal(newTabHref({ record: { type: 'work_block', id: 'w', task_id: 'a' } }, { location }), 'https://life-hub.adam-russell.com/tasks/#/task/a');
  assert.equal(newTabHref({ record: { type: 'scheduled_lesson', id: 's', lesson_id: 'L1' } }, { location }), 'https://life-hub.adam-russell.com/teaching/lessons/L1');
  assert.equal(newTabHref({ record: { type: 'professional_meeting', id: 'p', href: '#/meeting/9' } }, { location }), 'https://life-hub.adam-russell.com/professional/#/meeting/9');
});

test('item card shows context, edits task fields, and links out in a new tab', () => {
  const due = { id: 'task-emails', kind: 'task', title: 'Respond to student emails', source: 'task', record: TASKS[0].record };
  const html = itemCardHtml(due, { location: { href: 'https://life-hub.adam-russell.com/' } });
  assert.match(html, /data-part="open-in-hub"[^>]*target="_blank"/);
  assert.match(html, /Open in Tasks/);
  assert.match(html, /Task · Tasks/);
  assert.match(html, /Due Tue 29\/09\/26/);
  assert.match(html, /Priority/);
  assert.match(html, /name="notes"[^>]*>Year 11 extension requests first\./);
  assert.deepEqual(itemCardPatch(due, { title: 'Respond to student emails', date: '2026-09-30', time: '', notes: 'Year 11 extension requests first.' }), { date: '2026-09-30' });
  assert.deepEqual(itemCardPatch(due, { title: 'Respond to student emails', date: TODAY, time: '', notes: 'done Y11' }), { notes: 'done Y11', date: TODAY });
  const meeting = itemCardHtml({ id: 'm', kind: 'professional', title: 'Faculty', record: { type: 'professional_meeting', id: 'm' } });
  assert.doesNotMatch(meeting, /card-form/, 'foreign records are read-only in the card');
});

function mount(apiFetch) {
  const window = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar' });
  window.requestAnimationFrame = undefined;
  const doc = window.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  const changed = [];
  renderTideline(doc, host, {
    hub: 'life',
    events: [...TASKS, ...BLOCKS],
    ghosts: [],
    week: WEEK,
    today: TODAY,
    nowHour: 12,
    apiFetch,
    onSourcesChanged: () => changed.push(1),
    onSwitchView: () => {},
    onShiftRange: () => {},
    onSelectDate: () => {}
  });
  return { window, host, changed };
}

test('clicking a Due row opens the item card; Save writes to the Tasks API', async () => {
  const calls = [];
  const { host, window, changed } = mount(async (path, init) => {
    calls.push([path, init?.method, init?.body ? JSON.parse(init.body) : null]);
    return new window.Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
  });
  // task-emails has a block today (wb-1) and no deadline time: it is on the grid, not in Due.
  assert.equal(host.querySelector('[data-part="due"][data-id="task-emails"]'), null);
  // task-timed has a due time: a deadline marker at that hour in the day body, not the all-day row.
  assert.equal(host.querySelector('[data-part="due"][data-id="task-timed"]'), null);
  const due = host.querySelector('[data-part="day-body"] [data-part="deadline"][data-id="task-timed"]');
  assert.ok(due, 'deadline marker rendered');
  assert.equal(due.getAttribute('role'), 'button');
  assert.match(due.getAttribute('title'), /Task/);
  assert.equal(due.dataset.movable, '1');
  due.click();
  const pop = host.querySelector('[data-part="chip-popover"]');
  assert.equal(pop.hidden, false);
  assert.match(pop.textContent, /Submit report/);
  assert.ok(pop.querySelector('[data-part="open-in-hub"]'));
  pop.querySelector('textarea[name="notes"]').value = 'Replied to 11B';
  pop.querySelector('[data-part="card-form"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  // The week also reads today's check-ins (one capacity number everywhere); only the save writes.
  assert.deepEqual(calls.filter(([path]) => !path.startsWith('/api/capacity-checkins')), [['/api/tasks?id=task-timed', 'PATCH', { description: 'Replied to 11B', due_date: TODAY }]]);
  assert.equal(changed.length, 1);
});

test('work blocks get resize grips and use the pointer engine', () => {
  const { host } = mount(async () => new Response('{}'));
  const block = host.querySelector('.cal-chip[data-id="wb-1"]');
  assert.equal(block.dataset.movable, '1');
  assert.equal(block.dataset.resizable, '1');
  assert.ok(block.querySelector('[data-grip="start"]'));
  assert.ok(block.querySelector('[data-grip="end"]'));
  assert.equal(block.getAttribute('draggable'), null, 'native HTML5 drag is gone (pointer engine instead)');
});

test('filter chips keep their small size (font shorthand before font-size)', () => {
  const css = readFileSync(join(rootDir, 'packages/design-kit/calendar-tideline.css'), 'utf8');
  const rule = css.match(/\n\.cal-src\{[^}]*\}/)[0];
  assert.ok(rule.indexOf('font:inherit') < rule.indexOf('font-size'), '.cal-src font:inherit must not reset font-size');
});

test('zoom and Focus pills share one view-controls row', () => {
  const { host } = mount(async () => new Response('{}'));
  const views = host.querySelector('[data-part="view-controls"]');
  assert.ok(views.querySelector('[data-part="zoom-pills"]'));
  assert.ok(views.querySelector('[data-part="focus-pills"]'));
});

test('a logged moment (meal) gets no invented end time in the card', async () => {
  const { itemCardValues } = await import('../../packages/design-kit/js/calendar/calendar-item-card.js');
  const meal = { id: 'log-lunch', kind: 'health', title: 'Lunch', record: { type: 'meal', date: TODAY, time: '12:30' } };
  assert.equal(itemCardValues(meal).end, '');
  assert.equal(newTabHref(meal, { location: { href: 'https://life-hub.adam-russell.com/' } }), 'https://life-hub.adam-russell.com/#/nutrition');
});

test('day brief rows carry the item id so the Day dial side list opens the card', async () => {
  const { tomorrow } = await import('../../packages/design-kit/js/calendar/day-brief.js');
  const brief = tomorrow({ date: TODAY, chips: [{ id: 'c1', title: 'Gym', start: 7, end: 8, kind: 'fitness' }], due: [{ id: 'task-emails', title: 'Emails' }] });
  assert.deepEqual(brief.rows.map((row) => row.itemId), ['c1', 'task-emails']);
});

test('Life calendar reads term dates from Hub prefs first (holidays stop painting School)', async () => {
  const { resolveSchoolTerms } = await import('../../packages/design-kit/js/calendar/school-terms.js');
  const terms = resolveSchoolTerms({
    hubPrefs: { school_terms: [{ year: 2026, terms: [{ term: 3, starts_on: '2026-07-20', ends_on: '2026-09-25' }, { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-18' }] }] },
    planningProfile: null,
    visual: null
  });
  const model = buildTidelineModel({ events: [], week: WEEK, today: TODAY, nowHour: 12, terms });
  assert.equal(model.days.find((day) => day.date === TODAY).school, false);
  const source = readFileSync(join(rootDir, 'apps/life/js/app/render-calendar.js'), 'utf8');
  assert.match(source, /resolveSchoolTerms\(\{ hubPrefs/);
});
