import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tasksApi } from '@/services/client-api';
import { setFocus } from '@/domain/focus';
import { renderTimelineView } from '@/views/timeline';
import type { SeedData } from '@/services/types';
import type { Task } from '@/schemas/task';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn()
  }
}));

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;

function datedTask(partial: Partial<Task> & Pick<Task, 'id' | 'title' | 'due_date'>): Task {
  const base = seed.tasks.find((entry) => entry.id === 'task_demo_lesson_pack') ?? seed.tasks[0]!;
  return {
    ...structuredClone(base),
    status: 'open',
    estimated_duration: 480,
    parent_project_id: 'proj_mindworks',
    ...partial
  };
}

describe('timeline view', () => {
  beforeEach(() => {
    setFocus(null, { persistUrl: false });
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.listProjects).mockResolvedValue(structuredClone(seed.projects));
  });

  it('renders a phone list with full titles, not crushed horizontal bars only', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      datedTask({ id: 't_plan', title: 'Plan spring camp', due_date: '2026-08-27' }),
      datedTask({ id: 't_brief', title: 'Briefing pack for parents', due_date: '2026-09-03' }),
      datedTask({ id: 't_draft', title: 'Draft risk assessment', due_date: '2026-09-03' })
    ]);

    const canvas = document.createElement('main');
    await renderTimelineView(canvas);

    expect(canvas.querySelector('.chronology__track')).not.toBeNull();
    const list = canvas.querySelector('.chronology__list');
    expect(list).not.toBeNull();
    expect(list?.getAttribute('aria-label')).toMatch(/due date/i);

    const titles = [...canvas.querySelectorAll('.chronology__item-title')].map(
      (node) => node.textContent
    );
    expect(titles).toEqual([
      'Plan spring camp',
      'Briefing pack for parents',
      'Draft risk assessment'
    ]);

    const days = [...canvas.querySelectorAll('.chronology__day')];
    expect(days).toHaveLength(2);
    expect(days[0]?.querySelector('.chronology__when')?.textContent).toMatch(/27\/08\/26/);
    expect(days[1]?.querySelectorAll('.chronology__item')).toHaveLength(2);
  });

  it('opens the task preview from a list row', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      datedTask({ id: 't_open', title: 'Open from list', due_date: '2026-09-10' })
    ]);

    const canvas = document.createElement('main');
    await renderTimelineView(canvas);

    canvas.querySelector<HTMLButtonElement>('.chronology__item')?.click();
    await vi.waitFor(() => {
      expect(canvas.querySelector('.chronology__preview')?.hidden).toBe(false);
    });
  });
});
