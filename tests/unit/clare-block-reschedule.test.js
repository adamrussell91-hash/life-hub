/**
 * Rescheduling a task moves its existing work block; composing a day twice never
 * double-books a task. A task's work block is its time on Today, not due_time.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClareMutation, buildWorkBlockChange, executeClareWork } from '../../netlify/functions/_shared/clare-work.mjs';
import { executeShortcut } from '../../netlify/functions/_shared/capabilities/shortcuts.mjs';
import { getTask, searchTasks } from '../../netlify/functions/_shared/domain-retrieval.mjs';
import { taskBlockWrite } from '../../netlify/functions/_shared/task-block-write.mjs';

const STAMP = '2026-10-19T02:00:00.000Z';
const TODAY = '2026-10-19';
const content = write => JSON.parse(write.content);

const task = { id: 'task_card', title: 'Collect library card', status: 'open', due_date: null, due_time: null };
const block = {
  schema_version: 1,
  id: 'wblock_card',
  task_id: 'task_card',
  title: 'Collect library card',
  date: TODAY,
  start_time: '16:30',
  duration_minutes: 30,
  depth: 'shallow',
  status: 'confirmed',
  source: 'clare',
  created_at: '2026-10-18T00:00:00.000Z',
  updated_at: '2026-10-18T00:00:00.000Z'
};

/** Apply Confirm writes to an in-memory block list the way the write executor does. */
function applyBlockWrites(blocks, writes) {
  const byId = new Map(blocks.map(item => [item.id, item]));
  for (const write of writes) {
    if (!write.path.startsWith('tasks:work_block:')) continue;
    const id = write.path.slice('tasks:work_block:'.length);
    if (write.mode === 'create') assert.ok(!byId.has(id), 'create must not collide');
    byId.set(id, { ...content(write), id });
  }
  return [...byId.values()];
}

const activeFor = (blocks, taskId) =>
  blocks.filter(item => item.task_id === taskId && (item.status === 'confirmed' || item.status === 'in_progress'));

test('taskBlockWrite: a task with a 16:30 block moved to 17:00 overwrites that block, keeping its length', () => {
  const write = taskBlockWrite(task, { start_time: '17:00' }, STAMP, { today: TODAY, existingBlocks: [block] });
  assert.equal(write.mode, 'overwrite');
  assert.equal(write.path, 'tasks:work_block:wblock_card');
  const record = content(write);
  assert.equal(record.start_time, '17:00');
  assert.equal(record.duration_minutes, 30);
  assert.equal(record.date, TODAY);
  assert.equal(record.created_at, block.created_at);
  // An explicit end time sets the new length.
  assert.equal(content(taskBlockWrite(task, { start_time: '17:00', end_time: '18:00' }, STAMP, { today: TODAY, existingBlocks: [block] })).duration_minutes, 60);
  // Cancelled blocks are not the task's time: a new block is created.
  const cancelled = { ...block, status: 'cancelled' };
  assert.equal(taskBlockWrite(task, { start_time: '17:00', end_time: '17:30' }, STAMP, { today: TODAY, existingBlocks: [cancelled] }).mode, 'create');
});

test('clare_mutate update_task 16:30 → 17:00 leaves exactly one block, at 17:00', () => {
  const result = buildClareMutation(
    { op: 'update_task', task_id: 'task_card', start_time: '17:00', end_time: '17:30' },
    { tasks: [task], workBlocks: [block], today: TODAY, nowIso: () => STAMP }
  );
  assert.equal(result.kind, 'propose');
  const after = applyBlockWrites([block], result.proposal.writes);
  const active = activeFor(after, 'task_card');
  assert.equal(active.length, 1);
  assert.equal(active[0].start_time, '17:00');
  assert.equal(active[0].id, 'wblock_card');
});

test('clare_mutate batch_reschedule moves the existing block instead of adding one', () => {
  const result = buildClareMutation(
    { op: 'batch_reschedule', schedules: [{ task_id: 'task_card', start_time: '17:00', end_time: '17:30' }] },
    { tasks: [task], workBlocks: [block], today: TODAY, nowIso: () => STAMP }
  );
  const after = applyBlockWrites([block], result.proposal.writes);
  assert.deepEqual(activeFor(after, 'task_card').map(item => item.start_time), ['17:00']);
});

test('update_task shortcut (umbrella chat) with start_time moves the existing block', async () => {
  const result = await executeShortcut(
    'update_task',
    { task_id: 'task_card', start_time: '17:00' },
    { agentSlug: 'clare', openTasks: [task], workBlocks: [block], today: TODAY }
  );
  assert.equal(result.kind, 'propose');
  assert.equal(result.proposal.writes.length, 1);
  const [write] = result.proposal.writes;
  assert.equal(write.mode, 'overwrite');
  assert.equal(write.path, 'tasks:work_block:wblock_card');
  const after = applyBlockWrites([block], result.proposal.writes);
  assert.deepEqual(activeFor(after, 'task_card').map(item => item.start_time), ['17:00']);
});

test('move_work_block: move by task_id or block id, cancel, and ambiguity', async () => {
  const moved = await executeClareWork(
    'move_work_block',
    { action: 'move', task_id: 'task_card', start_time: '17:00' },
    { tasks: [task], workBlocks: [block], now: new Date(STAMP) }
  );
  assert.equal(moved.kind, 'propose');
  assert.equal(moved.proposal.writes.length, 1);
  assert.equal(moved.proposal.writes[0].mode, 'overwrite');
  let after = applyBlockWrites([block], moved.proposal.writes);
  assert.deepEqual(activeFor(after, 'task_card').map(item => item.start_time), ['17:00']);

  const nextDay = buildWorkBlockChange(
    { action: 'move', work_block_id: 'tasks:work_block:wblock_card', date: '2026-10-20', start_time: '09:00' },
    { workBlocks: [block], today: TODAY, nowIso: () => STAMP }
  );
  assert.deepEqual(
    (({ date, start_time, duration_minutes }) => ({ date, start_time, duration_minutes }))(content(nextDay.proposal.writes[0])),
    { date: '2026-10-20', start_time: '09:00', duration_minutes: 30 }
  );

  const cancelled = buildWorkBlockChange({ action: 'cancel', task_id: 'task_card' }, { workBlocks: [block], today: TODAY, nowIso: () => STAMP });
  after = applyBlockWrites([block], cancelled.proposal.writes);
  assert.equal(activeFor(after, 'task_card').length, 0);

  const twoDays = [block, { ...block, id: 'wblock_card_2', date: '2026-10-21' }];
  const ambiguous = buildWorkBlockChange({ action: 'move', task_id: 'task_card', start_time: '17:00' }, { workBlocks: twoDays, today: TODAY });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.error, 'ambiguous_work_block');
  const picked = buildWorkBlockChange({ action: 'move', task_id: 'task_card', from_date: '2026-10-21', start_time: '17:00' }, { workBlocks: twoDays, today: TODAY, nowIso: () => STAMP });
  assert.equal(picked.proposal.writes[0].path, 'tasks:work_block:wblock_card_2');

  assert.equal(buildWorkBlockChange({ action: 'move', task_id: 'task_none', start_time: '17:00' }, { workBlocks: [block] }).error, 'no_work_block_for_task');
});

function memoryTasksStore() {
  const saved = new Map();
  return {
    async get(key) { return saved.has(key) ? saved.get(key) : null; },
    async setJSON(key, value) { saved.set(key, value); },
    async set(key, value) { saved.set(key, typeof value === 'string' ? JSON.parse(value) : value); }
  };
}

const openProfile = {
  work_windows: {
    mon: [{ start: '08:00', end: '18:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
  },
  protected_windows: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
};

test('compose_schedule twice does not double-book a task', async () => {
  const tasks = [
    { id: 'task_card', title: 'Collect library card', status: 'open', estimated_duration: 30, depth: 'shallow' },
    { id: 'task_drill', title: 'Return the drill', status: 'open', estimated_duration: 30, depth: 'shallow' }
  ];
  const compose = (workBlocks, extra = {}) => executeClareWork(
    'compose_schedule',
    { date: TODAY, task_ids: ['task_card', 'task_drill'], ...extra },
    { now: new Date(STAMP), tasks, projects: [], lessons: [], workBlocks, planning_profile: openProfile, tasksStore: memoryTasksStore() }
  );

  const first = await compose([]);
  assert.equal(first.kind, 'propose');
  // Adam confirms the first compose: its blocks become confirmed.
  const confirmed = applyBlockWrites([], first.proposal.writes).map(item => ({ ...item, status: 'confirmed' }));
  assert.equal(activeFor(confirmed, 'task_card').length, 1);

  const second = await compose(confirmed);
  const secondWrites = second.proposal?.writes ?? [];
  const after = applyBlockWrites(confirmed, secondWrites).map(item => ({ ...item, status: 'confirmed' }));
  assert.equal(activeFor(after, 'task_card').length, 1, 'task_card keeps one block');
  assert.equal(activeFor(after, 'task_drill').length, 1, 'task_drill keeps one block');
  assert.deepEqual(second.already_scheduled.map(item => item.task_id).sort(), ['task_card', 'task_drill']);

  // A confirmed block on another day does not count for this one.
  const otherDay = confirmed.map(item => ({ ...item, date: '2026-10-26' }));
  const third = await compose(otherDay);
  assert.equal(third.proposal.writes.length, 2);

  // Only an explicit ask adds an extra split block.
  const extra = await compose(confirmed, { extra_block_task_ids: ['task_card'] });
  assert.deepEqual(extra.proposal.writes.map(write => content(write).task_id), ['task_card']);
});

test('search_tasks / get_task carry the work-block time even when due_time is empty', () => {
  const tasks = [task];
  const found = getTask(tasks, { task_id: 'task_card' }, { workBlocks: [block] });
  assert.equal(found.task.due_time, null);
  assert.equal(found.task.scheduled_time, `${TODAY} 16:30–17:00`);
  assert.deepEqual(found.task.scheduled_blocks, [{
    work_block_id: 'wblock_card', date: TODAY, start_time: '16:30', end_time: '17:00', duration_minutes: 30, status: 'confirmed'
  }]);
  const searched = searchTasks(tasks, { query: 'library card' }, { workBlocks: [block] });
  assert.equal(searched.results[0].scheduled_blocks[0].work_block_id, 'wblock_card');
  // No blocks → no scheduled fields.
  assert.equal(getTask(tasks, { task_id: 'task_card' }).task.scheduled_blocks, undefined);
});
