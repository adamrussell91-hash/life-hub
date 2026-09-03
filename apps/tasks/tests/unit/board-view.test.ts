import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { renderBoardView } from '@/views/board';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    getTask: vi.fn()
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
    source: 'manual',
    ...partial
  };
}

const projects: Project[] = [];

describe('board view mutations', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.createTask).mockReset();
    vi.mocked(tasksApi.deleteTask).mockReset();
    vi.mocked(tasksApi.listProjects).mockResolvedValue(projects);
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

  it('places the filter toggle beside the add button', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderBoardView(canvas);

    const toolbar = canvas.querySelector('.dashboard-board .board-toolbar');
    const filters = toolbar?.querySelector('.hub-filters');
    expect(toolbar?.querySelector('.hub-filters__toggle')?.getAttribute('aria-label')).toBe('Filters');
    expect(toolbar?.querySelector('.plus-add__btn')?.getAttribute('aria-label')).toBe('Add a task');
    expect(filters?.nextElementSibling?.classList.contains('plus-add')).toBe(true);
  });

  it('inserts a quick-add card without remounting the board', async () => {
    const existing = task({ id: 'task_old', title: 'Existing card' });
    const created = task({ id: 'task_new', title: 'Instant add' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([existing]);
    vi.mocked(tasksApi.createTask).mockResolvedValue(created);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }) as unknown as MediaQueryList);

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderBoardView(canvas);

    expect(canvas.querySelector('[data-id="task_old"]')?.textContent).toContain('Existing card');
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.querySelector('.board-col-nav')).not.toBeNull();

    const form = canvas.querySelector('form.quick-add') as HTMLFormElement;
    const title = form.querySelector('input') as HTMLInputElement;
    title.value = 'Instant add';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-id="task_new"]')?.textContent).toContain('Instant add');
    });
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.querySelector('.board')).not.toBeNull();
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    expect(canvas.querySelector('.dashboard-board .view-lede')?.textContent).toMatch(/^2 open in scope/);
  });

  it('moves a card via drop without remounting the board', async () => {
    const existing = task({ id: 'task_move', title: 'Move me', status: 'open' });
    const moved = task({ id: 'task_move', title: 'Move me', status: 'in_progress' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([existing]);
    vi.mocked(tasksApi.updateTask).mockResolvedValue(moved);
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

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderBoardView(canvas);

    const card = canvas.querySelector<HTMLElement>('[data-id="task_move"]')!;
    card.focus();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await vi.waitFor(() => {
      expect(vi.mocked(tasksApi.updateTask)).toHaveBeenCalledWith('task_move', { status: 'in_progress' });
      expect(canvas.querySelector('.column[data-col="doing"] [data-id="task_move"]')).not.toBeNull();
    });
    expect(canvas.querySelector('.column[data-col="todo"] [data-id="task_move"]')).toBeNull();
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
  });

  it('removes a deleted card without remounting the board', async () => {
    const existing = task({ id: 'task_old', title: 'Existing card' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([existing]);
    vi.mocked(tasksApi.deleteTask).mockResolvedValue({ deleted: true });

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderBoardView(canvas);

    canvas.querySelector<HTMLButtonElement>('.card-menu')?.click();
    document.querySelector<HTMLButtonElement>('[data-card-menu-item="delete"]')?.click();

    await vi.waitFor(() => {
      expect(canvas.querySelector('[data-id="task_old"]')).toBeNull();
    });
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.querySelector('.board')).not.toBeNull();
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    expect(canvas.querySelector('.dashboard-board .view-lede')?.textContent).toMatch(/^0 open in scope/);
  });
});
