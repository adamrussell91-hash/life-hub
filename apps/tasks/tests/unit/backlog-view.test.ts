import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { resetTaskCache } from '@/services/task-cache';
import { renderPageHeader, renderHubShell } from '@/shell/shell';
import { renderListView, resetBacklogForTests } from '@/views/backlog';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    getTask: vi.fn(),
    createProject: vi.fn()
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
    estimated_duration: null,
    actual_duration: null,
    due_date: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-20T00:00:00.000Z',
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
    target_date: null,
    review_at: null,
    waiting_on: null,
    waiting_since: null,
    follow_up_at: null,
    waiting_status: null,
    contexts: [],
    cognitive_load: null,
    depth: null,
    ...partial
  };
}

const projects: Project[] = [];

describe('backlog view', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
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
    window.location.hash = '#/list';
  });

  afterEach(() => {
    resetBacklogForTests();
    resetTaskCache();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('wires each task title to its page and keeps the header title countless', async () => {
    const item = task({ id: 'task_book', title: 'Book maintenance for the seating' });
    vi.mocked(tasksApi.listTasks).mockResolvedValue([item]);

    const root = document.createElement('div');
    document.body.append(root);
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    renderPageHeader(refs, { eyebrow: 'Views', title: 'Backlog' });

    await renderListView(refs.canvas);

    const title = refs.canvas.querySelector<HTMLAnchorElement>('[data-task-id="task_book"] .backlog-row__title');
    expect(title?.tagName).toBe('A');
    expect(title?.getAttribute('href')).toBe('#/task/task_book');
    expect(refs.pageHeader.querySelector('.backlog-count')).toBeNull();
    expect(refs.pageHeader.querySelector('.page-header__title')?.textContent).toBe('Backlog');
    expect(refs.pageHeader.querySelector('.page-header__title-row')?.children).toHaveLength(1);

    refs.canvas.querySelector<HTMLElement>('[data-task-id="task_book"]')?.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(window.location.hash).toBe('#/task/task_book');
  });
});
