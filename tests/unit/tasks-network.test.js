import assert from 'node:assert/strict';
import test from 'node:test';
import { detectMissedDeadlines, detectOverlappingExcursions } from '../../netlify/functions/_shared/tasks-stress.mjs';
import {
  buildCapacitySnapshot,
  toCoreyPublicView
} from '../../netlify/functions/_shared/tasks-capacity.mjs';

test('overlapping excursions in the same fortnight are flagged', () => {
  const hits = detectOverlappingExcursions([
    {
      id: 'ex1',
      type: 'excursion',
      title: 'Ethics',
      current_end_date: '2026-08-12'
    },
    {
      id: 'ex2',
      type: 'excursion',
      title: 'Da Vinci',
      current_end_date: '2026-08-20'
    }
  ]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pattern_kind, 'overlapping_excursions');
  assert.match(hits[0].pattern_description, /Ethics|Da Vinci/);
});

test('missed-deadline cluster needs three open overdue tasks', () => {
  const now = new Date('2026-08-16T12:00:00');
  const tasks = [
    { id: 't1', title: 'Late A', status: 'todo', due_date: '2026-08-10' },
    { id: 't2', title: 'Late B', status: 'todo', due_date: '2026-08-11' },
    { id: 't3', title: 'Late C', status: 'todo', due_date: '2026-08-12' },
    { id: 't4', title: 'Done', status: 'done', due_date: '2026-08-01' }
  ];
  const hits = detectMissedDeadlines(tasks, now);
  assert.equal(hits.length, 1);
  assert.match(hits[0].pattern_description, /past due/);
});

test('public capacity view strips task titles and counts', () => {
  const snapshot = buildCapacitySnapshot([
    {
      id: 't1',
      title: 'Finish lesson pack',
      status: 'todo',
      due_date: '2026-08-16',
      estimated_duration: 90
    }
  ], new Date('2026-08-16T12:00:00'), 14);
  assert.equal(snapshot.days.length, 14);
  assert.ok(snapshot.headlines.length > 0);
  const pub = toCoreyPublicView(snapshot);
  const blob = JSON.stringify(pub);
  assert.equal(blob.includes('Finish lesson pack'), false);
  assert.equal(pub.days[0].open_task_count, undefined);
});
