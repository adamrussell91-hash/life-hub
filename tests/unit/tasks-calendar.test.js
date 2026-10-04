import assert from 'node:assert/strict';
import test from 'node:test';
import { tasksEventsFromTasks } from '../../apps/life/js/shell/tasks-calendar.js';
import { knowledgeEventsFromPages } from '../../apps/life/js/shell/knowledge-calendar.js';

test('tasksEventsFromTasks maps due dates; done work stays, marked done', () => {
  const events = tasksEventsFromTasks([
    { id: 't1', title: 'Mark 12 English', due_date: '2026-08-12', status: 'open' },
    { id: 't2', title: 'Done', due_date: '2026-08-12', status: 'done' },
    { id: 't4', title: 'Done bucket', due_date: '2026-08-12', status: 'open', bucket: 'done' },
    { id: 't5', title: 'Dead', due_date: '2026-08-12', status: 'dead' },
    { id: 't3', title: 'No date', status: 'open' }
  ]);
  assert.deepEqual(events.map(e => [e.record.id, e.record.status]), [['t1', 'open'], ['t2', 'done'], ['t4', 'done']]);
  assert.equal(events[0].record.type, 'task');
  assert.equal(events[0].record.date, '2026-08-12');
});

test('knowledgeEventsFromPages uses created_at calendar days', () => {
  const events = knowledgeEventsFromPages([
    { id: 'n1', title: 'Archive note', created_at: '2026-08-03T01:00:00.000Z', excerpt: 'Hello', area: 'notes' },
    { id: 'n2', title: 'No date' }
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].record.type, 'knowledge_page');
  assert.equal(events[0].record.date, '2026-08-03');
});
