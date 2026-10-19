/**
 * A long task may be split into linked parts — like one Teaching lesson taught over
 * two slots. Parts share a split_group, read as "part 1 of 2", and stay one task:
 * ticking any part completes the task and closes every remaining part.
 * Invented names only: this repo is public.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDaySchedule } from '../../netlify/functions/_shared/productivity-os.mjs';
import { buildClareMutation, executeClareWork } from '../../netlify/functions/_shared/clare-work.mjs';
import { scheduledBlocksForTask } from '../../netlify/functions/_shared/task-block-write.mjs';
import { blocksToSupersede } from '../../netlify/functions/_shared/work-block-guard.mjs';
import { tasksEventsFromWorkBlocks } from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { chipFromEvent, splitPartMeta } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { statusRequests } from '../../packages/design-kit/js/calendar/calendar-item-actions.js';

const DAY = '2026-10-19';
const STAMP = '2026-10-19T00:00:00.000Z';

function confirmedBlocks(proposed) {
  return proposed.map((part, index) => ({
    id: `wblock_part${index + 1}`,
    task_id: part.task_id,
    title: part.title,
    date: part.date,
    start_time: part.start_time,
    duration_minutes: part.duration_minutes,
    status: 'confirmed',
    ...(part.split_group ? { split_group: part.split_group } : {})
  }));
}

test('a split around a lesson gives one task with two linked parts', () => {
  const result = composeDaySchedule({
    date: DAY,
    workday: { start: '08:00', end: '12:00', source: 'profile' },
    lessons: [{ start: 9 * 60, end: 10 * 60, title: 'Year 9', kind: 'lesson' }],
    tasks: [{ id: 'task_report', title: 'Write the unit report', estimated_duration: 150, depth: 'shallow' }]
  });
  assert.equal(result.proposed.length, 2);
  assert.ok(result.proposed.every(part => part.task_id === 'task_report'));
  assert.equal(new Set(result.proposed.map(part => part.split_group)).size, 1);
  assert.ok(result.proposed[0].split_group);

  const blocks = confirmedBlocks(result.proposed);
  // The one-block guard keeps both parts: same task, same day, same split.
  assert.deepEqual(blocksToSupersede(blocks[1], [blocks[0]]), []);

  const events = tasksEventsFromWorkBlocks(blocks);
  assert.deepEqual(events.map(event => [event.record.session_index, event.record.session_count]), [[1, 2], [2, 2]]);
  const chips = events.map(chipFromEvent);
  assert.match(chips[0].meta, /part 1 of 2 · continues 10 am/);
  assert.match(chips[1].meta, /part 2 of 2 · from 8 am/);

  // Clare's context lists the parts in order.
  assert.deepEqual(
    scheduledBlocksForTask(blocks, 'task_report').map(part => [part.part_index, part.part_count, part.start_time]),
    [[1, 2, '08:00'], [2, 2, '10:00']]
  );
});

test('a split can span days and names the next day', () => {
  const events = tasksEventsFromWorkBlocks([
    { id: 'p1', task_id: 'task_report', title: 'Write the unit report', date: '2026-10-19', start_time: '15:30', duration_minutes: 60, status: 'confirmed' },
    { id: 'p2', task_id: 'task_report', title: 'Write the unit report', date: '2026-10-20', start_time: '17:00', duration_minutes: 60, status: 'confirmed', split_group: 'split_p1' }
  ]);
  assert.equal(splitPartMeta(events[0].record), 'part 1 of 2 · continues Tue 5 pm');
  assert.equal(splitPartMeta(events[1].record), 'part 2 of 2 · from Mon 3:30 pm');
  // Unmarked blocks of one task on different days are not parts.
  const loose = tasksEventsFromWorkBlocks([
    { id: 'p1', task_id: 'task_report', title: 'X', date: '2026-10-19', start_time: '15:30', status: 'confirmed' },
    { id: 'p2', task_id: 'task_report', title: 'X', date: '2026-10-20', start_time: '17:00', status: 'confirmed' }
  ]);
  assert.ok(loose.every(event => event.record.session_count === undefined));
});

test('ticking either part completes the task and closes both parts', () => {
  const blocks = confirmedBlocks([
    { task_id: 'task_report', title: 'Write the unit report', date: DAY, start_time: '08:00', duration_minutes: 60, split_group: 'g1' },
    { task_id: 'task_report', title: 'Write the unit report', date: DAY, start_time: '10:00', duration_minutes: 60, split_group: 'g1' }
  ]);
  const events = tasksEventsFromWorkBlocks(blocks);
  for (const [index, event] of events.entries()) {
    const chip = { ...chipFromEvent(event), record: event.record, taskStatus: 'open', taskOpenBlocks: 2 };
    const requests = statusRequests(chip, 'done');
    const other = blocks[1 - index].id;
    assert.deepEqual(requests.map(request => [request.path, request.body.status]), [
      [`/api/work-blocks?id=${blocks[index].id}`, 'done'],
      [`/api/work-blocks?id=${other}`, 'done'],
      ['/api/tasks?id=task_report', 'done']
    ]);
    // Undo restores every part and the task.
    assert.deepEqual(requests.map(request => request.before.status), ['confirmed', 'confirmed', 'open']);
  }
  // A plain (unsplit) block still leaves the task open while another block remains.
  const plain = tasksEventsFromWorkBlocks([{ id: 'solo', task_id: 'task_x', title: 'X', date: DAY, start_time: '09:00', status: 'confirmed' }]);
  const solo = { ...chipFromEvent(plain[0]), record: plain[0].record, taskStatus: 'open', taskOpenBlocks: 2 };
  assert.deepEqual(statusRequests(solo, 'done').map(request => request.path), ['/api/work-blocks?id=solo']);
});

test('Clare split_block adds a linked part; without it a time change moves the block', () => {
  const existing = { id: 'wblock_one', task_id: 'task_report', title: 'Write the unit report', date: DAY, start_time: '15:30', duration_minutes: 60, status: 'confirmed' };
  const tasks = [{ id: 'task_report', title: 'Write the unit report', status: 'open' }];
  const split = buildClareMutation(
    { op: 'update_task', task_id: 'task_report', start_time: '17:00', end_time: '18:00', block_date: '2026-10-20', split_block: true },
    { tasks, workBlocks: [existing], today: DAY, nowIso: () => STAMP }
  );
  const write = split.proposal.writes.find(item => item.path.startsWith('tasks:work_block:'));
  assert.equal(write.mode, 'create');
  const part = JSON.parse(write.content);
  assert.equal(part.split_group, 'split_wblock_one');
  assert.deepEqual(blocksToSupersede({ ...part, date: DAY }, [existing]), [], 'part 2 never displaces part 1');

  const move = buildClareMutation(
    { op: 'update_task', task_id: 'task_report', start_time: '17:00', end_time: '18:00' },
    { tasks, workBlocks: [existing], today: DAY, nowIso: () => STAMP }
  );
  const moved = move.proposal.writes.find(item => item.path.startsWith('tasks:work_block:'));
  assert.equal(moved.mode, 'overwrite');
  assert.equal(moved.path, 'tasks:work_block:wblock_one');
});

test('compose_schedule extra_block_task_ids links the new block to the existing one', async () => {
  const store = new Map();
  const tasksStore = {
    async get(key) { return store.get(key) ?? null; },
    async setJSON(key, value) { store.set(key, value); }
  };
  const existing = { id: 'wblock_one', task_id: 'task_report', title: 'Write the unit report', date: DAY, start_time: '08:00', duration_minutes: 30, status: 'confirmed' };
  const result = await executeClareWork(
    'compose_schedule',
    { date: DAY, task_ids: ['task_report'], extra_block_task_ids: ['task_report'] },
    {
      now: new Date(STAMP),
      tasks: [{ id: 'task_report', title: 'Write the unit report', status: 'open', estimated_duration: 30, depth: 'shallow' }],
      projects: [],
      lessons: [],
      workBlocks: [existing],
      planning_profile: {
        work_windows: { mon: [{ start: '08:00', end: '12:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
        protected_windows: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
      },
      tasksStore
    }
  );
  const [write] = result.proposal.writes;
  assert.equal(JSON.parse(write.content).split_group, 'split_wblock_one');
});
