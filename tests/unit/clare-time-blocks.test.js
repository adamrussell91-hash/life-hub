/**
 * Clare time-blocking: due_time is a deadline; "3–3:15pm" is a work block linked to
 * the task, written on the same Confirm (clare_mutate and create_task / update_task),
 * and the dump parser reads the slot. Mirror of the Tasks hub TS parser is checked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClareMutation } from '../../netlify/functions/_shared/clare-work.mjs';
import { executeShortcut } from '../../netlify/functions/_shared/capabilities/shortcuts.mjs';
import { parseBrainDump, parseTimeBlock } from '../../netlify/functions/_shared/clare-dump.mjs';
import { assembleDumpResult } from '../../netlify/functions/_shared/clare.mjs';
import { taskBlockWrite } from '../../netlify/functions/_shared/task-block-write.mjs';

const kinds = writes => writes.map(write => write.path.split(':').slice(0, 2).join(':'));
const content = write => JSON.parse(write.content);

test('taskBlockWrite: start–end → a confirmed block linked to the task; invalid spans write nothing', () => {
  const write = taskBlockWrite({ id: 't1', title: 'Email Keith', due_date: '2026-10-05' }, { start_time: '15:00', end_time: '15:15' }, '2026-10-04T04:00:00.000Z');
  assert.match(write.path, /^tasks:work_block:wblock_/);
  assert.equal(write.mode, 'create');
  assert.deepEqual(
    (({ task_id, title, date, start_time, duration_minutes, status, source }) => ({ task_id, title, date, start_time, duration_minutes, status, source }))(content(write)),
    { task_id: 't1', title: 'Email Keith', date: '2026-10-05', start_time: '15:00', duration_minutes: 15, status: 'confirmed', source: 'clare' }
  );
  assert.equal(content(taskBlockWrite({ id: 't1' }, { start_time: '15:00', end_time: '16:00', block_date: '2026-10-07' }, '2026-10-04T04:00:00.000Z')).date, '2026-10-07');
  assert.equal(taskBlockWrite({ id: 't1' }, { start_time: '16:00', end_time: '15:00' }, '2026-10-04T04:00:00.000Z'), null);
  assert.equal(taskBlockWrite({ id: 't1' }, { start_time: '15:00' }, '2026-10-04T04:00:00.000Z'), null);
});

test('clare_mutate create_task with start/end: task + block on one Confirm, no due_time', () => {
  const result = buildClareMutation({ op: 'create_task', title: 'Email Keith', due_date: '2026-10-05', start_time: '15:00', end_time: '15:15' });
  assert.deepEqual(kinds(result.proposal.writes), ['tasks:task', 'tasks:work_block']);
  const [task, block] = result.proposal.writes.map(content);
  assert.equal(task.due_time ?? null, null);
  assert.equal(block.task_id, task.id);
  // A deadline alone stays a deadline.
  const deadline = buildClareMutation({ op: 'create_task', title: 'Report', due_date: '2026-10-05', due_time: '17:00', estimated_duration: 120 });
  assert.deepEqual(kinds(deadline.proposal.writes), ['tasks:task']);
});

test('clare_mutate update_task and batch_reschedule add blocks', () => {
  const tasks = [{ id: 'a', title: 'Mark essays', due_date: '2026-10-09', status: 'open' }, { id: 'b', title: 'Email Fergus', due_date: '2026-10-05', status: 'open' }];
  const update = buildClareMutation({ op: 'update_task', task_id: 'a', start_time: '19:00', end_time: '21:00', block_date: '2026-10-04' }, { tasks });
  assert.deepEqual(kinds(update.proposal.writes), ['tasks:task', 'tasks:work_block']);
  assert.equal(content(update.proposal.writes[1]).date, '2026-10-04');
  const batch = buildClareMutation({ op: 'batch_reschedule', schedules: [
    { task_id: 'a', start_time: '19:00', end_time: '20:00' },
    { task_id: 'b', due_date: '2026-10-06', start_time: '15:15', end_time: '15:30' }
  ] }, { tasks });
  assert.deepEqual(kinds(batch.proposal.writes), ['tasks:work_block', 'tasks:task', 'tasks:work_block']);
  assert.equal(content(batch.proposal.writes[2]).date, '2026-10-06', 'block follows the new due day');
});

test('update_task items[] with blocks counts tasks not writes, and titles the block from the store', async () => {
  const store = {
    async get(key) {
      if (key === 'tasks/task_korea') return { id: 'task_korea', title: 'Korea itinerary', due_date: '2026-10-04' };
      if (key === 'tasks/task_lead') return { id: 'task_lead', title: 'Lead accreditation', due_date: '2026-10-04' };
      return null;
    }
  };
  const result = await executeShortcut('update_task', {
    items: [
      { task_id: 'task_korea', due_date: '2026-10-05', start_time: '08:30', end_time: '09:00' },
      { task_id: 'task_lead', due_date: '2026-10-06', start_time: '10:30', end_time: '11:30' }
    ]
  }, { agentSlug: 'clare', tasksStore: store, today: '2026-10-04' });
  assert.equal(result.kind, 'propose');
  assert.equal(result.proposal.intent, 'Update 2 tasks');
  assert.equal(result.proposal.writes.length, 4);
  assert.equal(result.proposal.writes[0].title, 'Korea itinerary');
  assert.equal(JSON.parse(result.proposal.writes[1].content).title, 'Korea itinerary');
  assert.equal(JSON.parse(result.proposal.writes[3].content).title, 'Lead accreditation');
});

test('create_task / update_task (umbrella chat) write linked blocks on the same Confirm', async () => {
  const created = await executeShortcut('create_task', { items: [
    { title: 'Email Keith', due_date: '2026-10-05', start_time: '15:00', end_time: '15:15' },
    { title: 'Email Fergus', due_date: '2026-10-05', start_time: '15:15', end_time: '15:30' }
  ] }, { agentSlug: 'clare', openTasks: [], today: '2026-10-04' });
  assert.equal(created.kind, 'propose');
  assert.deepEqual(kinds(created.proposal.writes), ['tasks:task', 'tasks:task', 'tasks:work_block', 'tasks:work_block']);
  const [keith, fergus, keithBlock, fergusBlock] = created.proposal.writes.map(content);
  assert.equal(keithBlock.task_id, keith.id);
  assert.equal(fergusBlock.task_id, fergus.id);
  assert.equal(fergusBlock.start_time, '15:15');

  const updated = await executeShortcut('update_task', { task_id: 't1', start_time: '19:00', end_time: '21:00' }, {
    agentSlug: 'clare', openTasks: [{ id: 't1', title: 'Mark essays', due_date: '2026-10-09', status: 'open' }], today: '2026-10-04'
  });
  assert.deepEqual(kinds(updated.proposal.writes), ['tasks:work_block']);
  assert.deepEqual((({ title, date, duration_minutes }) => ({ title, date, duration_minutes }))(content(updated.proposal.writes[0])), { title: 'Mark essays', date: '2026-10-09', duration_minutes: 120 });
});

test('dump parser reads slots; proposals carry them with the slot length as the estimate', () => {
  assert.deepEqual(parseTimeBlock('Email Keith 3-3:15pm'), { start_time: '15:00', end_time: '15:15', match: '3-3:15pm' });
  assert.equal(parseTimeBlock('Mark Year 11-12 essays'), null);
  assert.equal(parseTimeBlock('report due by 5pm'), null);
  assert.equal(parseTimeBlock('plan 11-1pm').start_time, '11:00');
  assert.equal(parseTimeBlock('call mum at 3pm for half an hour').end_time, '15:30');
  const [item] = parseBrainDump('Email Keith Pavlis 3-3:15pm', { now: new Date('2026-10-04T03:00:00Z') });
  assert.equal(item.title, 'Email Keith Pavlis');
  assert.equal(item.start_time, '15:00');
  const frameworks = [{ schema_version: 1, id: 'fw_timeboxing', name: 'Timeboxing', best_suited_task_pattern: 'Open-ended work', usage_hint: 'Box it', default_minutes: 45 }];
  const result = assembleDumpResult([item], frameworks, () => null, null);
  assert.equal(result.proposals[0].start_time, '15:00');
  assert.equal(result.proposals[0].proposed_minutes, 15);
});
