import { describe, expect, it } from 'vitest';
import { tasksRouteFor } from '@/views/hub-calendar';

describe('calendar item routes', () => {
  it('routes work blocks to their associated task, never the block id', () => {
    expect(tasksRouteFor({ id: 'block', type: 'work_block', task_id: 'task a' })).toBe('#/task/task%20a');
    expect(tasksRouteFor({ id: 'block', source: 'tasks', record: { id: 'block', type: 'work_block', task_id: 'task a' } })).toBe('#/task/task%20a');
    expect(tasksRouteFor({ id: 'block', type: 'work_block' })).toBeNull();
  });
  it('recognizes flattened task and project types and preserves professional source refs', () => {
    expect(tasksRouteFor({ id: 'task a', type: 'task', source: 'tasks' })).toBe('#/task/task%20a');
    expect(tasksRouteFor({ id: 'project a', type: 'project', source: 'tasks' })).toBe('#/project/project%20a');
    expect(tasksRouteFor({ id: 'wrapped', type: 'professional_event', source_ref: 'professional:event a' })).toBe('/professional/#/event/event%20a');
  });
});
