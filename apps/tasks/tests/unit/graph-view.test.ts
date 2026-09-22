import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderGraphView, resetGraphSession } from '@/views/graph';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    getHubPrefs: vi.fn(),
    updateHubPrefs: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn(),
    applyAgentMutations: vi.fn(),
    graphInsights: vi.fn(),
    getTaskProperties: vi.fn()
  }
}));

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: '2026-08-17',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'high',
    parent_project_id: 'proj_mindworks',
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...partial
  };
}

const projects: Project[] = [
  {
    schema_version: 1,
    id: 'proj_mindworks',
    title: 'MindWorks',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'academic_program',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: '2026-09-30',
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null
  }
];

describe('graph view pills', () => {
  beforeEach(() => {
    resetGraphSession();
    location.hash = '#/graph';
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.getHubPrefs).mockResolvedValue({
      schema_version: 1,
      timezone: 'Australia/Sydney',
      updated_at: null,
      dismissed_insight_ids: []
    });
    vi.mocked(tasksApi.graphInsights).mockResolvedValue({ insights: [] });
    vi.mocked(tasksApi.getTaskProperties).mockRejectedValue(new Error('offline'));
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      task({ id: 'task_lesson', title: 'Finish lesson pack', depends_on: ['task_notes'] }),
      task({ id: 'task_notes', title: 'Write notes' })
    ]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue(projects);
  });

  afterEach(() => {
    document.body.replaceChildren();
    resetGraphSession();
    vi.restoreAllMocks();
  });

  it('shows Lines, Branch and Orbit only and stays on one fetch', async () => {
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderGraphView(canvas);

    const labels = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].map((btn) => btn.textContent);
    expect(labels).toEqual(['Lines', 'Branch', 'Orbit']);
    expect(canvas.querySelector('.graph-page')).not.toBeNull();
    expect(canvas.querySelector('.graph-lines')).not.toBeNull();
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);

    const branch = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'Branch'
    );
    branch?.click();
    await vi.waitFor(() => {
      expect(location.hash).toBe('#/graph?view=branch');
    });
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
  });

  it('remounts when a leftover host sits on the canvas', async () => {
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderGraphView(canvas);
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);

    canvas.replaceChildren();
    const leftover = document.createElement('div');
    leftover.className = 'orbit-host graph-host';
    leftover.textContent = 'orbit leftover';
    canvas.append(leftover);

    location.hash = '#/graph?view=orbit';
    await renderGraphView(canvas);

    expect(canvas.querySelector('.graph-orbit')).not.toBeNull();
    expect(canvas.textContent).not.toContain('orbit leftover');
    const orbit = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'Orbit'
    );
    expect(orbit?.classList.contains('is-active')).toBe(true);
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(2);
  });
});
