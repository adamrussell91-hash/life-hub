/**
 * Step 7: bookmarks — a way back in, asked only when a task block ends or is cut off.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { taskProgress, tasksEventsFromTasks, tasksEventsFromWorkBlocks } from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { bookmarkMoment } from '../../packages/design-kit/js/calendar/day-sense.js';
import { itemPatchRequest } from '../../packages/design-kit/js/calendar/calendar-item-actions.js';
import { buildRescuePlan } from '../../packages/design-kit/js/calendar/rescue-plan.js';
import { openRescueSheet, closeRescueSheet } from '../../packages/design-kit/js/calendar/rescue-sheet.js';
import { bookmarkCandidate, decideNotifications, todaysTaskBlocks } from '../../netlify/functions/_shared/day-sense-notify.mjs';
import { coerceBookmark, mergeTask } from '../../netlify/functions/tasks.mjs';
import { renderDayDial, unmountDayDial } from '../../packages/design-kit/js/calendar/render-day-dial.js';

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

const TODAY = '2026-09-29';
const WEEK = ['2026-09-28', TODAY, '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const TASKS = [
  { id: 'unyouth', title: 'UNYouth planning', status: 'open', bookmark: { note: 'stopped at the budget tab', at: '2026-09-28T07:00:00Z', source: 'calendar' } },
  { id: 'step-1', parent_task_id: 'unyouth', kind: 'step', title: 'Budget', status: 'done' },
  { id: 'step-2', parent_task_id: 'unyouth', kind: 'step', title: 'Venue', status: 'open' },
  { id: 'marking', title: 'Mark 9E essays', due_date: TODAY, status: 'open', marking: { scripts: 28, scripts_marked: 12 } }
];
const BLOCKS = [
  { id: 'wb-un', task_id: 'unyouth', title: 'UNYouth planning', date: TODAY, start_time: '14:30', duration_minutes: 60, status: 'confirmed' },
  { id: 'wb-mark', task_id: 'marking', title: 'Marking', date: TODAY, start_time: '19:00', duration_minutes: 60, status: 'confirmed' }
];
const EVENTS = [
  ...tasksEventsFromTasks(TASKS),
  ...tasksEventsFromWorkBlocks(BLOCKS),
  { path: 'pro:m', record: { type: 'professional_meeting', id: 'staff', date: TODAY, time: '15:15', duration_min: 45, title: 'Staff meeting' } }
];
const model = (nowHour = 15.1) => buildTidelineModel({ events: EVENTS, week: WEEK, today: TODAY, nowHour });
const today = (m) => m.days.find((d) => d.date === TODAY);

test('progress: marking counts scripts, otherwise steps; nothing to count is null', () => {
  assert.deepEqual(taskProgress(TASKS[3]), { done: 12, total: 28, unit: 'scripts' });
  assert.deepEqual(taskProgress(TASKS[0], TASKS.slice(1, 3)), { done: 1, total: 2, unit: 'steps' });
  assert.equal(taskProgress({ id: 'x' }), null);
});

test('the block carries its task’s bookmark and progress, even when the task has no date', () => {
  const chip = today(model()).chips.find((c) => c.id === 'wb-un');
  assert.equal(chip.bookmark?.note, 'stopped at the budget tab');
  assert.deepEqual(chip.progress, { done: 1, total: 2, unit: 'steps' });
  const due = today(model()).due.find((d) => d.id === 'marking');
  assert.equal(due.progress?.unit, 'scripts');
});

test('moment: a meeting cutting in within 10 min asks; mid-block with nothing coming does not', () => {
  const at = bookmarkMoment(today(model(15.1)), 15.1);
  assert.equal(at?.reason, 'interrupted');
  assert.equal(at.next, 'Staff meeting');
  assert.equal(at.taskId, 'unyouth');
  assert.equal(at.previous, 'stopped at the budget tab');
  assert.equal(bookmarkMoment(today(model(14.75)), 14.75), null, 'mid-block, nothing near: silence');
  assert.equal(bookmarkMoment(today(model(15.1)), 15.1, { dismissed: new Set(['wb-un']) }), null, 'answered once, never again');
  const ending = bookmarkMoment(today(model(19.9)), 19.9);
  assert.equal(ending?.reason, 'ending');
  assert.equal(ending.at, 20);
});

test('card patch writes a bookmark on the task; an empty note clears it', () => {
  const req = itemPatchRequest({ record: { type: 'task', id: 'unyouth' } }, { bookmark: '  up to   venue quotes ' });
  assert.equal(req.path, '/api/tasks?id=unyouth');
  assert.equal(req.body.bookmark.note, 'up to venue quotes');
  assert.equal(req.body.bookmark.source, 'calendar');
  assert.equal(itemPatchRequest({ record: { type: 'task', id: 'unyouth' } }, { bookmark: '' }).body.bookmark, null);
});

test('server: bookmark is coerced, never stored as junk', () => {
  assert.equal(coerceBookmark('text'), null);
  assert.equal(coerceBookmark({ note: '   ' }), null);
  const long = coerceBookmark({ note: 'x'.repeat(400), at: 'nope', source: 'calendar' });
  assert.equal(long.note.length, 280);
  assert.ok(Number.isFinite(Date.parse(long.at)));
  const merged = mergeTask({ id: 't', title: 'T' }, { bookmark: { note: 'Q4', at: '2026-09-29T05:00:00Z', source: 'calendar', evil: 1 } });
  assert.deepEqual(merged.bookmark, { note: 'Q4', at: '2026-09-29T05:00:00Z', source: 'calendar' });
});

test('push: 10 min before a 30 min+ task block ends; finished tasks, short blocks and a third one stay quiet', () => {
  const blocks = todaysTaskBlocks([...BLOCKS, { id: 'wb-short', task_id: 'x', date: TODAY, start_time: '16:00', duration_minutes: 20 }], TODAY);
  assert.equal(blocks.length, 3);
  const found = bookmarkCandidate(blocks, 15.4, { sent: {} });
  assert.equal(found?.id, 'wb-un');
  assert.equal(bookmarkCandidate(blocks, 15.2, { sent: {} }), null, 'too early');
  assert.equal(bookmarkCandidate(blocks, 16.25, { sent: {} }), null, '20 min block never asks');
  assert.equal(bookmarkCandidate(blocks.map((b) => ({ ...b, taskDone: true })), 15.4, { sent: {} }), null);
  assert.equal(bookmarkCandidate(blocks, 15.4, { sent: { 'bookmark-a': 1, 'bookmark-b': 1 } }), null, 'two a day');
  const [message] = decideNotifications({ today: TODAY, nowHour: 15.4, med: null, schoolDay: false, leave: 16.75, reviewDone: true, log: { sent: {} }, blocks });
  assert.equal(message.key, 'bookmark-wb-un');
  assert.equal(message.url, '/#/calendar/day?bookmark=unyouth');
  assert.match(message.body, /Ends at 3:30 pm\. Leave yourself a way back in\?/);
});

test('rescue: a block cut off mid-way offers a bookmark in the receipt, saved through the task', async () => {
  const m = model(14.75);
  const plan = buildRescuePlan({ model: m, today: TODAY, nowHour: 14.75, reason: 'changed' });
  assert.deepEqual(plan.interrupted.map((row) => row.taskId), ['unyouth'], 'only the running block, not tonight’s marking');

  const window = new Window({ url: 'https://life-hub.test/' });
  const doc = window.document;
  const patches = [];
  openRescueSheet({
    doc, model: m, today: TODAY, nowHour: 14.75,
    apiFetch: async (path, init) => {
      const body = JSON.parse(init.body);
      if (path === '/api/calendar-rescue') {
        return new window.Response(JSON.stringify({ ok: true, data: { ghosts: body.ghosts.map((g, i) => ({ ...g, id: `r-${i}`, label: g.title })) } }), { status: 200 });
      }
      if (path.startsWith('/api/tasks')) patches.push({ path, body });
      return new window.Response(JSON.stringify({ ok: true, receipt: 'moved' }), { status: 200 });
    }
  });
  const sheet = doc.querySelector('[data-part="rescue-sheet"]');
  sheet.querySelector('[data-rescue="changed"]').click();
  await new Promise((r) => setTimeout(r, 20));
  sheet.querySelector('[data-rescue="accept"]').click();
  await new Promise((r) => setTimeout(r, 20));
  const section = doc.querySelector('[data-part="rescue-bookmarks"]');
  assert.ok(section, 'receipt asks for a way back in');
  section.querySelector('input[data-task="unyouth"]').value = 'venue quotes half done';
  section.querySelector('[data-rescue="bookmarks"]').click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(patches.length, 1);
  assert.equal(patches[0].path, '/api/tasks?id=unyouth');
  assert.equal(patches[0].body.bookmark.note, 'venue quotes half done');
  closeRescueSheet();
  window.close();
});

async function mountDial(hash, nowHour, calls) {
  const window = new Window({ url: `https://life-hub.adam-russell.com/${hash}` });
  window.requestAnimationFrame = undefined;
  const doc = window.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  renderDayDial(doc, host, {
    hub: 'life', events: EVENTS, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour,
    now: new Date('2026-09-29T05:06:00Z'),
    apiFetch: async (path, init) => {
      calls.push([path, JSON.parse(init.body)]);
      return new window.Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
    },
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 30));
  return { window, host };
}

test('Day dial: the prompt sits at the top of the panel, names the meeting, and Save writes the task', async () => {
  const calls = [];
  const { window, host } = await mountDial('#/calendar/day', 15.1, calls);
  const prompt = host.querySelector('[data-part="bookmark-prompt"]');
  assert.ok(prompt, 'prompt shows');
  assert.equal(prompt.parentElement.firstElementChild, prompt, 'first thing in the side panel');
  assert.match(prompt.textContent, /Staff meeting starts at 3:15 pm and cuts into UNYouth planning\. Leave yourself a way back in\?/);
  assert.match(prompt.querySelector('input').placeholder, /Last time: stopped at the budget tab/);
  prompt.querySelector('[data-bookmark-act="save"]').click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.length, 0, 'empty note writes nothing');
  prompt.querySelector('input').value = 'venue quotes';
  prompt.querySelector('[data-bookmark-act="save"]').click();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls[0][0], '/api/tasks?id=unyouth');
  assert.equal(calls[0][1].bookmark.note, 'venue quotes');
  assert.equal(host.querySelector('[data-part="bookmark-prompt"]'), null);
  unmountDayDial();
  window.close();
});

test('Day dial: a notification tapped after the block ended still asks about that task', async () => {
  const calls = [];
  const { window, host } = await mountDial('#/calendar/day?bookmark=marking', 20.2, calls);
  const prompt = host.querySelector('[data-part="bookmark-prompt"]');
  assert.ok(prompt, 'deep link builds the prompt');
  assert.match(prompt.textContent, /Marking ended at 8:00 pm/);
  prompt.querySelector('[data-bookmark-act="finished"]').click();
  assert.equal(host.querySelector('[data-part="bookmark-prompt"]'), null);
  assert.equal(calls.length, 0, 'finished for now writes nothing');
  unmountDayDial();
  window.close();
});
