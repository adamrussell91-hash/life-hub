import { describe, expect, it } from 'vitest';
import { scheduleDiffFromMutation, scheduleDiffFromMutations } from '@/domain/schedule-diff';
import type { AgentMutation } from '@/domain/agent-mutations';

describe('scheduleDiff', () => {
  it('extracts due_date moves from task_update mutations', () => {
    const mutation: AgentMutation = {
      kind: 'task_update',
      summary: 'Move packing to Friday',
      task_id: 't1',
      patch: { due_date: '2026-09-12', title: 'Pack' }
    };
    expect(scheduleDiffFromMutations([mutation])).toEqual([
      { taskId: 't1', from: null, to: '2026-09-12', summary: 'Move packing to Friday' }
    ]);
    expect(scheduleDiffFromMutation(mutation, '2026-09-10')).toEqual({
      taskId: 't1',
      from: '2026-09-10',
      to: '2026-09-12',
      summary: 'Move packing to Friday'
    });
    expect(scheduleDiffFromMutation(mutation, '2026-09-12')).toBeNull();
  });

  it('ignores non-schedule patches', () => {
    const mutation: AgentMutation = {
      kind: 'task_update',
      summary: 'Rename',
      task_id: 't1',
      patch: { title: 'New name' }
    };
    expect(scheduleDiffFromMutations([mutation])).toEqual([]);
    expect(scheduleDiffFromMutation(mutation, '2026-09-10')).toBeNull();
  });
});
