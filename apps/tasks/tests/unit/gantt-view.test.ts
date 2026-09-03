import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tasksApi } from '@/services/client-api';
import { renderGanttView, resetGanttSession } from '@/views/gantt';
import type { SeedData } from '@/services/types';
import type { Task } from '@/schemas/task';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    updateTask: vi.fn(),
    updateProject: vi.fn(),
    createTask: vi.fn()
  }
}));

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;

function createdTask(overrides: Partial<Task> = {}): Task {
  const base = seed.tasks.find((entry) => entry.id === 'task_demo_lesson_pack')!;
  return {
    ...structuredClone(base),
    id: 'task_gantt_new',
    title: 'Gantt new task',
    due_date: '2026-08-28',
    parent_project_id: 'proj_mindworks',
    ...overrides
  };
}

describe('gantt view', () => {
  beforeEach(() => {
    resetGanttSession();
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.updateTask).mockReset();
    vi.mocked(tasksApi.updateProject).mockReset();
    vi.mocked(tasksApi.createTask).mockReset();
    vi.mocked(tasksApi.listTasks).mockResolvedValue(structuredClone(seed.tasks));
    vi.mocked(tasksApi.listProjects).mockResolvedValue(structuredClone(seed.projects));
    vi.mocked(tasksApi.createTask).mockResolvedValue(createdTask());
    vi.mocked(tasksApi.updateTask).mockImplementation(async (id, body) => {
      const found = seed.tasks.find((entry) => entry.id === id)!;
      return { ...found, ...(body as Partial<Task>) };
    });
    vi.mocked(tasksApi.updateProject).mockImplementation(async (id, body) => {
      const found = seed.projects.find((entry) => entry.id === id)!;
      return { ...found, ...(body as object) };
    });
  });

  it('renders New Task, project lanes, and bars — not a moons gallery', async () => {
    const canvas = document.createElement('main');
    await renderGanttView(canvas);

    expect(canvas.querySelector('[aria-label="Scope"]')).not.toBeNull();
    expect(canvas.querySelector('[aria-label="Zoom"]')).not.toBeNull();
    expect(canvas.textContent).toMatch(/Critical path/);
    expect(canvas.querySelector('[aria-label="Add a task"]')).not.toBeNull();
    expect(canvas.textContent).not.toMatch(/New Task/);
    expect(canvas.querySelector('.gantt-moons')).toBeNull();
    expect(canvas.querySelector('.gantt-planet')).toBeNull();
    expect(canvas.textContent).not.toMatch(/All moons|Need a place|Every card is a moon/);
    expect(canvas.querySelector('.gantt-svg')).not.toBeNull();
    expect(canvas.querySelector('[data-item-id="task_demo_lesson_pack"]')).not.toBeNull();
    expect(canvas.querySelector('.gantt-rail__group')).not.toBeNull();
    expect(canvas.querySelector('.gantt-lane-label')?.textContent).toMatch(/MindWorks|Masters|Ethics|Da Vinci|close/i);
    expect(canvas.querySelector('[aria-label="Project lanes"]')).not.toBeNull();
  });

  it('creates a dated task from New Task so it lands on the Gantt', async () => {
    const canvas = document.createElement('main');
    await renderGanttView(canvas);

    canvas.querySelector<HTMLButtonElement>('[aria-label="Add a task"]')?.click();

    const form = canvas.querySelector('.gantt-new-task')!;
    expect(form).not.toBeNull();
    expect(form.querySelector('select')).toBeNull();
    const title = form.querySelector<HTMLInputElement>('input[aria-label="Task title"]')!;
    const due = form.querySelector<HTMLInputElement>('input[aria-label="Due date"]')!;
    title.value = 'Gantt new task';
    due.value = '2026-08-28';
    const project = [...form.querySelectorAll<HTMLButtonElement>('.hub-filter')].find(
      (btn) => btn.querySelector('.hub-filter__key')?.textContent === 'Project'
    );
    project?.click();
    document.querySelector<HTMLButtonElement>('[data-hub-option="proj_mindworks"]')?.click();

    form.querySelector<HTMLButtonElement>('.btn--primary')?.click();

    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Gantt new task',
          due_date: '2026-08-28',
          parent_project_id: 'proj_mindworks',
          kind: 'task',
          bucket: 'active'
        })
      );
    });
    expect(canvas.querySelector('[data-item-id="task_gantt_new"]')).not.toBeNull();
  });

  it('keeps a single-project lane when scoped to This project', async () => {
    const canvas = document.createElement('main');
    await renderGanttView(canvas);
    const one = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'This project'
    );
    one?.click();
    expect(canvas.querySelector('.gantt-svg')).not.toBeNull();
    expect(canvas.querySelector('.gantt-rail__group')).not.toBeNull();
    expect(canvas.querySelector('.gantt-lane-label')).not.toBeNull();
  });

  it('opens a preview card from a rail row', async () => {
    const canvas = document.createElement('main');
    await renderGanttView(canvas);
    const row = [...canvas.querySelectorAll<HTMLElement>('.gantt-rail__row')].find((node) =>
      node.textContent?.includes('Publish Year 12 pack')
    );
    row?.click();
    expect(canvas.querySelector('.graph-preview__title')?.textContent).toMatch(/Publish Year 12 pack/);
    expect(canvas.querySelector('.gantt-side.has-preview')).not.toBeNull();
    expect(canvas.querySelector('.graph-preview__eyebrow')?.textContent).toBe('task');
  });
});
