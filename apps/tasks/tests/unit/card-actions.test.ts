import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { deleteProjectNow, deleteTaskNow } from '@/views/card-actions';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    deleteTask: vi.fn(),
    deleteProject: vi.fn()
  }
}));

function sample(): Task {
  return {
    schema_version: 1,
    id: 'task_gone',
    title: 'Outline MindWorks units',
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual'
  };
}

describe('deleteTaskNow', () => {
  it('deletes immediately and never paints a proposed-write card', async () => {
    vi.mocked(tasksApi.deleteTask).mockResolvedValue(undefined as never);
    const host = document.createElement('div');
    const reload = vi.fn();
    deleteTaskNow(sample(), reload, host);
    expect(host.querySelector('.confirm-card')).toBeNull();
    expect(host.textContent).not.toContain('Proposed write');
    await vi.waitFor(() => expect(tasksApi.deleteTask).toHaveBeenCalledWith('task_gone', {
      agent: 'Tasks Hub',
      reason: 'Card delete'
    }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('surfaces an API error on the host instead of a confirm banner', async () => {
    vi.mocked(tasksApi.deleteTask).mockRejectedValue(new Error('No.'));
    const host = document.createElement('div');
    deleteTaskNow(sample(), vi.fn(), host);
    await vi.waitFor(() => expect(host.textContent).toContain('No.'));
    expect(host.querySelector('.confirm-card')).toBeNull();
  });
});

function sampleProject(): Project {
  return {
    schema_version: 1,
    id: 'proj_gone',
    title: 'MindWorks',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'academic_program',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null
  };
}

describe('deleteProjectNow', () => {
  it('deletes immediately and never paints a proposed-write card', async () => {
    vi.mocked(tasksApi.deleteProject).mockResolvedValue(undefined as never);
    const host = document.createElement('div');
    const reload = vi.fn();
    deleteProjectNow(sampleProject(), reload, host);
    expect(host.querySelector('.confirm-card')).toBeNull();
    expect(host.textContent).not.toContain('Proposed write');
    await vi.waitFor(() =>
      expect(tasksApi.deleteProject).toHaveBeenCalledWith('proj_gone', {
        agent: 'Tasks Hub',
        reason: 'Card delete'
      })
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('surfaces an API error on the host instead of a confirm banner', async () => {
    vi.mocked(tasksApi.deleteProject).mockRejectedValue(new Error('No.'));
    const host = document.createElement('div');
    deleteProjectNow(sampleProject(), vi.fn(), host);
    await vi.waitFor(() => expect(host.textContent).toContain('No.'));
    expect(host.querySelector('.confirm-card')).toBeNull();
  });
});
