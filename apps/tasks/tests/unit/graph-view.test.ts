import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderGraphView, resetGraphSession } from '@/views/graph';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn()
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
  }
];

describe('graph view mode pills', () => {
  beforeEach(() => {
    resetGraphSession();
    location.hash = '#/graph';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      fillText: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'center',
      textBaseline: 'middle'
    } as unknown as CanvasRenderingContext2D);
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
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

  it('switches blockers and workstreams without refetching', async () => {
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderGraphView(canvas);

    expect(canvas.querySelector('.graph-host')).not.toBeNull();
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    const blockers = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'Blockers'
    );
    const workstreams = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'Workstreams'
    );
    expect(blockers?.classList.contains('is-active')).toBe(true);

    workstreams?.click();

    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.querySelector('.graph-host')).not.toBeNull();
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    const nextWorkstreams = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'Workstreams'
    );
    expect(nextWorkstreams?.classList.contains('is-active')).toBe(true);
    expect(location.hash).toBe('#/graph?mode=workstreams');
  });

  it('remounts when a stretch view left a graph-host on the canvas', async () => {
    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderGraphView(canvas);
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);

    canvas.replaceChildren();
    const leftover = document.createElement('div');
    leftover.className = 'constellation-host graph-host';
    leftover.textContent = 'sky leftover';
    canvas.append(leftover);

    location.hash = '#/graph?mode=workstreams';
    await renderGraphView(canvas);

    expect(canvas.querySelector('.graph-stage')).not.toBeNull();
    expect(canvas.textContent).not.toContain('sky leftover');
    const workstreams = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'Workstreams'
    );
    expect(workstreams?.classList.contains('is-active')).toBe(true);
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(2);
  });
});
