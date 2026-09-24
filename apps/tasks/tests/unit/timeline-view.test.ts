import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tasksApi } from '@/services/client-api';
import { setFocus } from '@/domain/focus';
import { renderTimelineView, resetTimelineSession } from '@/views/timeline';
import type { SeedData } from '@/services/types';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    listGoals: vi.fn(),
    listPrograms: vi.fn(),
    getHubPrefs: vi.fn(),
    getPlanningProfile: vi.fn(),
    updateTask: vi.fn()
  }
}));

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;

function datedProject(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  const base = seed.projects[0]!;
  return {
    ...structuredClone(base),
    status: 'active',
    type: 'standard',
    parent_goal_id: null,
    current_end_date: '2026-10-01',
    baseline_end_date: null,
    milestones: [],
    ...partial
  };
}

describe('timeline view', () => {
  beforeEach(() => {
    resetTimelineSession();
    setFocus(null, { persistUrl: false });
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.listGoals).mockReset();
    vi.mocked(tasksApi.getHubPrefs).mockReset();
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);
    vi.mocked(tasksApi.listGoals).mockResolvedValue([]);
    vi.mocked(tasksApi.getHubPrefs).mockResolvedValue(null as never);
    vi.mocked(tasksApi.getPlanningProfile).mockResolvedValue(null);
  });

  it('renders the five zoom stops and a task bar', async () => {
    vi.mocked(tasksApi.listProjects).mockResolvedValue([
      datedProject({ id: 'p1', title: 'Tournament', created_at: '2026-09-01T12:00:00.000Z', current_end_date: '2026-10-03' })
    ]);
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      {
        ...(seed.tasks[0] as Task),
        id: 't3',
        title: 'Permission notes',
        due_date: '2026-09-25',
        estimated_duration: 90,
        parent_project_id: 'p1',
        parent_task_id: null,
        status: 'open',
        blocked_since: null
      }
    ]);

    const canvas = document.createElement('main');
    document.body.append(canvas);
    await renderTimelineView(canvas);

    expect([...canvas.querySelectorAll('[data-part="zoom-pills"] button')].map((button) => button.textContent)).toEqual([
      'Year',
      'Term',
      'Month',
      'Week',
      'Day'
    ]);
    expect(canvas.querySelector('[data-part="zoom-pills"] button[aria-pressed="true"]')?.textContent).toBe('Month');
    expect([...canvas.querySelectorAll('[data-part="view-toggle"] button')].map((button) => button.textContent)).toEqual(['Bars', 'Lines']);
    expect(canvas.querySelector('[data-part="timeline-card"]')).not.toBeNull();
    expect(canvas.querySelector('[data-part="bar"][data-task-id="t3"] [data-part="bar-sub"]')?.textContent).toMatch(/^due /);
    canvas.remove();
  });
});
