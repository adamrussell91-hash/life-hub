/**
 * Day changed (rescue): planner rules, server validation + queue, the move_block
 * ghost, and the sheet's propose → accept → one receipt flow.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { buildRescuePlan } from '../../packages/design-kit/js/calendar/rescue-plan.js';
import { openRescueSheet, closeRescueSheet } from '../../packages/design-kit/js/calendar/rescue-sheet.js';
import { acceptPlan } from '../../packages/design-kit/js/calendar/ghost-writes.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { tasksEventsFromTasks, tasksEventsFromWorkBlocks } from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { rescueEntry, supersedeRescue, createCalendarRescueHandler } from '../../netlify/functions/calendar-rescue.mjs';
import { applyTaskStep, PENDING_CALENDAR_GHOSTS_PATH } from '../../netlify/functions/calendar-ghosts.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';

const TODAY = '2026-09-29';
const WEEK = ['2026-09-28', TODAY, '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const EVENTS = [
  ...tasksEventsFromTasks([{ id: 'reports', title: 'Year 11 reports', due_date: TODAY, status: 'open', estimated_duration: 120 }]),
  ...tasksEventsFromWorkBlocks([
    { id: 'wb-reports', task_id: 'reports', title: 'Reports block', date: TODAY, start_time: '13:00', duration_minutes: 60, status: 'confirmed' },
    { id: 'wb-unyouth', title: 'UNYouth planning', date: TODAY, start_time: '15:30', duration_minutes: 90, status: 'confirmed' },
    { id: 'wb-evening', title: 'Admin', date: TODAY, start_time: '19:00', duration_minutes: 30, status: 'confirmed' }
  ]),
  { path: 'teaching:l1', record: { type: 'scheduled_lesson', id: 'lesson-1', date: TODAY, time: '14:00', duration_min: 60, title: 'Year 9 English', class_title: '9E' } },
  { path: 'ical:f', record: { type: 'ical_event', feed: 'social', id: 'lunch', date: TODAY, time: '12:00', end_time: '12:40', title: 'Lunch with Sam', ambient: true } }
];
const model = () => buildTidelineModel({ events: EVENTS, week: WEEK, today: TODAY, nowHour: 12.9 });

test('late: only blocks the delay reaches shift; lessons and lunch never move', () => {
  const plan = buildRescuePlan({ model: model(), today: TODAY, nowHour: 12.9, reason: 'late', lateMinutes: 30 });
  assert.equal(plan.ghosts.length, 1, 'only the 1 pm block is reached by a 30 min delay');
  const [ghost] = plan.ghosts;
  assert.equal(ghost.blockId, 'wb-reports');
  // 13:30 clashes with the 2 pm lesson, 3 pm with UNYouth (3:30–5), so the first real gap is 5 pm.
  assert.equal(ghost.date, TODAY);
  assert.equal(ghost.start, '17:00');
  assert.ok(plan.kept.some((row) => row.startsWith('Year 9 English')));
  assert.ok(!plan.ghosts.some((g) => g.blockId === 'lunch' || g.blockId === 'lesson-1'), 'lunch and the lesson are never proposals');
});

test('derailed: keep the block for what is due today, move the rest to better days', () => {
  const plan = buildRescuePlan({ model: model(), today: TODAY, nowHour: 12.9, reason: 'derailed' });
  assert.deepEqual(plan.ghosts.map((g) => g.blockId).sort(), ['wb-evening', 'wb-unyouth']);
  assert.ok(plan.ghosts.every((g) => g.date > TODAY));
  assert.ok(plan.kept[0].startsWith('Reports block'), 'must-do stays');
  assert.deepEqual(plan.dueToday, ['Year 11 reports']);
});

test('feeling worse: clear flexible work and protect a rest; nothing fixed moves; due stays due', () => {
  const plan = buildRescuePlan({ model: model(), today: TODAY, nowHour: 12.9, reason: 'worse' });
  assert.deepEqual(plan.ghosts.filter((g) => g.kind === 'move_block').map((g) => g.blockId).sort(), ['wb-evening', 'wb-reports', 'wb-unyouth']);
  const rest = plan.ghosts.find((g) => g.kind === 'protect_block');
  assert.equal(rest.title, 'Rest, protected');
  assert.equal(rest.start, '13:00');
  assert.ok(!plan.ghosts.some((g) => g.kind === 'move_task'), 'tasks are listed, never moved');
  assert.match(plan.why, /Feeling worse/);
});

test('server: only rescue kinds and fields, never the past, agent forced to Hammond; old rescue superseded', () => {
  const nowIso = '2026-09-29T12:54:00+10:00';
  const entry = rescueEntry({ kind: 'move_block', blockId: 'wb-x', from: TODAY, date: '2026-09-30', start: '15:30', end: '17:00', title: 'UNYouth', reason: 'Got derailed' }, { today: TODAY, nowIso });
  assert.equal(entry.agent, 'hammond');
  assert.equal(entry.via, 'rescue');
  assert.match(entry.id, /^rescue-2026-09-29-move_block-/);
  assert.deepEqual(entry.chip, { date: '2026-09-30', start: '15:30', end: '17:00', kind: 'task' });
  assert.throws(() => rescueEntry({ kind: 'create_task', title: 'x', due: TODAY }, { today: TODAY, nowIso }), /cannot propose/);
  assert.throws(() => rescueEntry({ kind: 'move_block', blockId: 'a', from: TODAY, date: TODAY, start: '10:00', end: '11:00', agent: 'sara' }, { today: TODAY, nowIso }), /unexpected field agent/);
  assert.throws(() => rescueEntry({ kind: 'move_block', blockId: 'a', from: TODAY, date: '2026-09-28', start: '10:00', end: '11:00' }, { today: TODAY, nowIso }), /past/);
  const list = supersedeRescue([{ id: 'rescue-2026-09-29-a', via: 'rescue', status: 'pending' }, { id: 'other', status: 'pending' }], TODAY, nowIso);
  assert.deepEqual(list.map((g) => g.status), ['superseded', 'pending']);
});

test('move_block accept writes the work block (and only that) with one receipt line', async () => {
  const ghost = { id: 'rescue-x', agent: 'hammond', kind: 'move_block', blockId: 'wb-x', from: TODAY, date: '2026-09-30', start: '15:30', end: '17:00', title: 'UNYouth', reason: 'Got derailed' };
  const plan = acceptPlan(ghost, { today: TODAY });
  assert.deepEqual(plan.steps[0], { target: 'tasks', method: 'PATCH', collection: 'work_blocks', id: 'wb-x', body: { date: '2026-09-30', start_time: '15:30', duration_minutes: 90 } });
  assert.match(plan.receipt, /Hammond → Tasks: “UNYouth” → Wed 30\/09 3:30 pm/);
  const data = new Map([['work_blocks/wb-x', { id: 'wb-x', date: TODAY, start_time: '19:00', duration_minutes: 30, title: 'UNYouth' }]]);
  const store = { async get(key) { return data.get(key) ?? null; }, async setJSON(key, value) { data.set(key, value); } };
  await applyTaskStep(store, plan.steps[0], { ghostId: ghost.id });
  const saved = data.get('work_blocks/wb-x');
  assert.deepEqual([saved.date, saved.start_time, saved.duration_minutes], ['2026-09-30', '15:30', 90]);
});

test('endpoint queues the validated ghosts into pending-calendar-ghosts.json', async () => {
  const SECRET = 's'.repeat(32);
  const NOW = Date.parse('2026-09-29T12:54:00+10:00');
  const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 9) }, SECRET).token;
  let committed = null;
  const github = {
    async resolveTree() { return { commitSha: 'c1', treeSha: 't1', tree: [] }; },
    async readBlob() { throw new Error('none'); },
    async commitFiles(args) { committed = args; return { commitSha: 'c2' }; }
  };
  const handler = createCalendarRescueHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET },
    now: () => NOW,
    createGitHubClient: () => github
  });
  const post = (body) => handler(new Request('https://api.example/api/calendar-rescue', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }));
  const plan = buildRescuePlan({ model: model(), today: TODAY, nowHour: 12.9, reason: 'derailed' });
  const response = await post({ reason: 'derailed', ghosts: plan.ghosts });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.ghosts.length, 2);
  assert.equal(committed.files[0].path, PENDING_CALENDAR_GHOSTS_PATH);
  const queued = JSON.parse(committed.files[0].content);
  const list = Array.isArray(queued) ? queued : queued.ghosts;
  assert.equal(list.filter((g) => g.via === 'rescue').length, 2);
  assert.equal((await post({ reason: 'derailed', ghosts: plan.ghosts, writes: [] })).status, 400, 'extra keys rejected');
});

test('sheet: choose → proposals → Accept all → one receipt', async () => {
  const window = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/day' });
  const doc = window.document;
  const calls = [];
  let queuedSeen = null;
  let done = false;
  openRescueSheet({
    doc,
    model: model(),
    today: TODAY,
    nowHour: 12.9,
    apiFetch: async (path, init) => {
      const body = JSON.parse(init.body);
      calls.push(path);
      if (path === '/api/calendar-rescue') {
        const ghosts = body.ghosts.map((g, i) => ({ ...g, id: `rescue-${i}`, label: `Move “${g.title}”` }));
        return new window.Response(JSON.stringify({ ok: true, data: { ghosts } }), { status: 200 });
      }
      return new window.Response(JSON.stringify({ ok: true, receipt: `Hammond → Tasks: ${body.id} moved.` }), { status: 200 });
    },
    onQueued: (ghosts) => { queuedSeen = ghosts; },
    onDone: () => { done = true; }
  });
  const sheet = doc.querySelector('[data-part="rescue-sheet"]');
  assert.ok(sheet);
  sheet.querySelector('[data-rescue="derailed"]').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(queuedSeen.length, 2, 'ghosts handed back to the calendar to draw');
  assert.match(sheet.textContent, /Hammond suggests 2 changes/);
  assert.match(sheet.textContent, /Stays as it is/);
  sheet.querySelector('[data-rescue="accept"]').click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(calls, ['/api/calendar-rescue', '/api/calendar-ghosts', '/api/calendar-ghosts']);
  assert.match(sheet.textContent, /Done\./);
  assert.match(sheet.textContent, /rescue-0 moved/);
  assert.match(sheet.textContent, /Untouched/);
  assert.equal(done, true);
  closeRescueSheet();
  assert.equal(doc.querySelector('[data-part="rescue-sheet"]'), null);
});
