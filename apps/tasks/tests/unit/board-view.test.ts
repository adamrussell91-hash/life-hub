import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { notifyTasksChanged, resetTaskCache } from '@/services/task-cache';
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
    vi.mocked(tasksApi.updateTask).mockReset();
    vi.mocked(tasksApi.deleteTask).mockReset();
    vi.mocked(tasksApi.getTask).mockReset();
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
    resetTaskCache();
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

  it('live-inserts a Clare-created task without remounting the board', async () => {
    const existing = task({ id: 'task_old', title: 'Existing card' });
    const created = task({ id: 'task_clare', title: 'Clare just added this' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([existing]);

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderBoardView(canvas);
    expect(canvas.querySelector('[data-id="task_old"]')?.textContent).toContain('Existing card');

    notifyTasksChanged([created]);

    expect(canvas.querySelector('[data-id="task_clare"]')?.textContent).toContain('Clare just added this');
    expect(canvas.querySelector('.canvas-status')).toBeNull();
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

  it('completes an overview task without remounting the board', async () => {
    const open = task({ id: 'task_tick', title: 'Tick me', status: 'open', due_date: '2026-08-27' });
    const done = task({ id: 'task_tick', title: 'Tick me', status: 'done', due_date: '2026-08-27' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([open]);
    vi.mocked(tasksApi.updateTask).mockResolvedValue(done);
    vi.mocked(tasksApi.getTask).mockResolvedValue(done);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' || query === '(max-width: 720px)',
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

    const board = canvas.querySelector('.board');
    expect(board).not.toBeNull();
    expect(canvas.querySelector('.dashboard-row .task-check')).not.toBeNull();

    const box = canvas.querySelector<HTMLInputElement>('.dashboard-row .task-check input');
    expect(box).not.toBeNull();
    box!.checked = true;
    box!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(vi.mocked(tasksApi.updateTask)).toHaveBeenCalledWith('task_tick', { status: 'done' });
      expect(canvas.querySelector('.column[data-col="done"] [data-id="task_tick"]')).not.toBeNull();
    });
    expect(vi.mocked(tasksApi.getTask)).not.toHaveBeenCalled();
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.querySelector('.board')).toBe(board);
    expect(vi.mocked(tasksApi.listTasks)).toHaveBeenCalledTimes(1);
    expect(canvas.querySelector('.column[data-col="done"] [data-id="task_tick"]')).not.toBeNull();
    expect(canvas.querySelector('#timeline-today [data-source="task"]')?.textContent ?? '').not.toContain(
      'Tick me'
    );
    // Completing must not jump the mobile column tabs to Done (that reads as a flash).
    const activeTab = canvas.querySelector('.board-col-nav [aria-selected="true"]');
    expect(activeTab?.textContent ?? '').not.toMatch(/Done/i);
  });

  it('moves every Today tick onto Done even when the follow-up getTask is stale', async () => {
    const first = task({ id: 'task_a', title: 'First tick', status: 'open', due_date: '2026-08-27' });
    const second = task({ id: 'task_b', title: 'Second tick', status: 'open', due_date: '2026-08-27' });
    const firstDone = task({
      id: 'task_a',
      title: 'First tick',
      status: 'done',
      due_date: '2026-08-27',
      updated_at: '2026-09-11T00:00:01.000Z'
    });
    const secondDone = task({
      id: 'task_b',
      title: 'Second tick',
      status: 'done',
      due_date: '2026-08-27',
      updated_at: '2026-09-11T00:00:02.000Z'
    });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([first, second]);
    vi.mocked(tasksApi.updateTask).mockImplementation(async (id) => (id === 'task_a' ? firstDone : secondDone));
    // Production follow-up GET can lose the race and return the pre-tick task.
    vi.mocked(tasksApi.getTask).mockImplementation(async (id) => (id === 'task_a' ? first : second));
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' || query === '(max-width: 720px)',
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

    expect(canvas.querySelector('.column[data-col="todo"] [data-id="task_a"]')).not.toBeNull();
    expect(canvas.querySelector('.column[data-col="todo"] [data-id="task_b"]')).not.toBeNull();

    for (const box of canvas.querySelectorAll<HTMLInputElement>('#timeline-today .task-check input')) {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await vi.waitFor(() => {
      expect(vi.mocked(tasksApi.updateTask)).toHaveBeenCalledWith('task_a', { status: 'done' });
      expect(vi.mocked(tasksApi.updateTask)).toHaveBeenCalledWith('task_b', { status: 'done' });
      expect(canvas.querySelector('.column[data-col="done"] [data-id="task_a"]')).not.toBeNull();
      expect(canvas.querySelector('.column[data-col="done"] [data-id="task_b"]')).not.toBeNull();
    });
    expect(canvas.querySelector('.column[data-col="todo"] [data-id="task_a"]')).toBeNull();
    expect(canvas.querySelector('.column[data-col="todo"] [data-id="task_b"]')).toBeNull();
    expect(canvas.querySelector('#timeline-today [data-source="task"]')?.textContent ?? '').not.toMatch(
      /First tick|Second tick/
    );
  });

  it('does not scroll the page to the board card when ticking Today', async () => {
    const open = task({ id: 'task_tick', title: 'Tick me', status: 'open', due_date: '2026-08-27' });
    const done = task({ id: 'task_tick', title: 'Tick me', status: 'done', due_date: '2026-08-27' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([open]);
    vi.mocked(tasksApi.updateTask).mockResolvedValue(done);
    vi.mocked(tasksApi.getTask).mockResolvedValue(done);

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderBoardView(canvas);

    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined);

    const box = canvas.querySelector<HTMLInputElement>('.dashboard-row .task-check input');
    box!.checked = true;
    box!.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(canvas.querySelector('.column[data-col="done"] [data-id="task_tick"]')).not.toBeNull();
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('removes a Today row when the board card is marked Done', async () => {
    const open = task({ id: 'task_board', title: 'Board done', status: 'open', due_date: '2026-08-27' });
    const done = task({ id: 'task_board', title: 'Board done', status: 'done', due_date: '2026-08-27' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([open]);
    vi.mocked(tasksApi.updateTask).mockResolvedValue(done);

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderBoardView(canvas);

    expect(canvas.querySelector('#timeline-today .dashboard-row__title')?.textContent).toBe('Board done');

    canvas.querySelector<HTMLButtonElement>('.card-menu')?.click();
    document.querySelector<HTMLButtonElement>('[data-card-menu-item="toggle"]')?.click();

    await vi.waitFor(() => {
      expect(vi.mocked(tasksApi.updateTask)).toHaveBeenCalledWith('task_board', { status: 'done' });
      expect(canvas.querySelector('.column[data-col="done"] [data-id="task_board"]')).not.toBeNull();
    });
    expect(canvas.querySelector('#timeline-today [data-source="task"]')?.textContent ?? '').not.toContain(
      'Board done'
    );
  });

  it('removes a Today row when a card is dropped on Done', async () => {
    const open = task({ id: 'task_drop', title: 'Drop done', status: 'open', due_date: '2026-08-27' });
    const done = task({ id: 'task_drop', title: 'Drop done', status: 'done', due_date: '2026-08-27' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([open]);
    vi.mocked(tasksApi.updateTask).mockResolvedValue(done);

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderBoardView(canvas);

    const card = canvas.querySelector<HTMLElement>('[data-id="task_drop"]')!;
    card.focus();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await vi.waitFor(() => {
      expect(vi.mocked(tasksApi.updateTask)).toHaveBeenCalledWith('task_drop', { status: 'done' });
      expect(canvas.querySelector('.column[data-col="done"] [data-id="task_drop"]')).not.toBeNull();
    });
    expect(canvas.querySelector('#timeline-today [data-source="task"]')?.textContent ?? '').not.toContain(
      'Drop done'
    );
  });

  it('starts Next up by moving the board card to Doing', async () => {
    const open = task({
      id: 'task_next',
      title: 'Mark Year 11 papers',
      status: 'open',
      due_date: '2026-08-27'
    });
    const started = task({
      id: 'task_next',
      title: 'Mark Year 11 papers',
      status: 'in_progress',
      due_date: '2026-08-27'
    });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([open]);
    vi.mocked(tasksApi.updateTask).mockResolvedValue(started);

    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderBoardView(canvas);

    canvas.querySelector<HTMLButtonElement>('.dashboard-next .btn')?.click();

    await vi.waitFor(() => {
      expect(vi.mocked(tasksApi.updateTask)).toHaveBeenCalledWith('task_next', { status: 'in_progress' });
      expect(canvas.querySelector('.column[data-col="doing"] [data-id="task_next"]')).not.toBeNull();
    });
    expect(canvas.querySelector('#timeline-today .dashboard-row__title')?.textContent).toBe(
      'Mark Year 11 papers'
    );
  });
});
