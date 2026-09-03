import assert from 'node:assert/strict';
import test from 'node:test';
import { findStallCandidates } from '../../netlify/functions/_shared/tasks-stall.mjs';

const now = new Date(2026, 7, 25);

test('findStallCandidates flags quiet active projects and already-stalled ones', () => {
  const projects = [
    { id: 'p1', title: 'Quiet', status: 'active', updated_at: '2026-06-01T00:00:00.000Z', created_at: '2026-05-01T00:00:00.000Z' },
    { id: 'p2', title: 'Moving', status: 'active', updated_at: '2026-08-20T00:00:00.000Z', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'p3', title: 'Already', status: 'stalled', updated_at: '2026-08-24T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z', stall_flagged_at: '2026-08-01T00:00:00.000Z' }
  ];
  const tasks = [
    { id: 't1', parent_project_id: 'p1', status: 'open', updated_at: '2026-06-01T00:00:00.000Z' }
  ];
  const hits = findStallCandidates(projects, tasks, now, 6);
  assert.deepEqual(hits.map(item => item.project.id).sort(), ['p1', 'p3']);
  assert.equal(hits.find(item => item.project.id === 'p1').already_flagged, false);
  assert.equal(hits.find(item => item.project.id === 'p3').already_flagged, true);
});
