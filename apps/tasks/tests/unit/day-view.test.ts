import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { renderDayView } from '@/views/dashboard';
import { hubCalendarDate, toDateKey } from '@/domain/queries';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    recordClareActual: vi.fn()
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
    due_date: toDateKey(hubCalendarDate()),
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
    source: 'manual',
    ...partial
  };
}

describe('Today view mutations', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.createTask).mockReset();
    vi.mocked(tasksApi.deleteTask).mockReset();
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('shows a newly added Today task without a second list fetch', async () => {
    const created = task({ id: 'task_today', title: 'Instant today' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.createTask).mockResolvedValue(created);

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderDayView(canvas);
    expect(canvas.textContent).toContain('Nothing due today');

    const form = canvas.querySelector('form.quick-add') as HTMLFormElement;
    const title = form.querySelector('input[aria-label="New task title"]') as HTMLInputElement;
    title.value = 'Instant today';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(canvas.textContent).toContain('Instant today');
    });
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tasksApi.createTask).mock.calls[0]?.[0]).toMatchObject({
      title: 'Instant today',
      due_date: toDateKey(hubCalendarDate())
    });
  });

  it('renders the daily dial on Today', async () => {
    const existing = task({ id: 'task_today', title: 'Due today', due_time: '09:00' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([existing]);

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderDayView(canvas);

    expect(canvas.querySelector('.daily-dial')).not.toBeNull();
    expect(canvas.querySelector('.daily-dial .hub-pills')).not.toBeNull();
    expect(canvas.textContent).toContain('Due today');
  });

  it('removes a Today card after delete without a loading flash', async () => {
    const existing = task({ id: 'task_today', title: 'Due today' });
    vi.mocked(tasksApi.listTasks).mockResolvedValueOnce([existing]).mockResolvedValue([]);
    vi.mocked(tasksApi.deleteTask).mockResolvedValue({ deleted: true });

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderDayView(canvas);
    expect(canvas.textContent).toContain('Due today');

    canvas.querySelector<HTMLButtonElement>('.card-menu')?.click();
    document.querySelector<HTMLButtonElement>('[data-card-menu-item="delete"]')?.click();

    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-task-id="task_today"]')).toBeNull();
    });
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.textContent).toContain('Nothing due today');
  });
});
