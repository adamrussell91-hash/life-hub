// apps/tasks/tests/unit/goal-page.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderGoalPage } from '@/views/goal-page';
import { mountTagAnythingSection } from '@/views/entity-tagger';
import { goal, project, task } from './goal-fixtures';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    getGoal: vi.fn(), updateGoal: vi.fn(), listProjects: vi.fn(), listTasks: vi.fn(), getHubPrefs: vi.fn(),
    updateProject: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), getGoalRead: vi.fn(), rescanGoalRead: vi.fn(), decideGhost: vi.fn()
  }
}));
vi.mock('@/views/entity-tagger', () => ({ mountTagAnythingSection: vi.fn() }));

const G = goal({
  id: 'g1', title: 'HA evidence', sphere: 'professional', structure: 'floor_target_stretch',
  lead_measure: { label: '1 write-up / week', per_week: 1 }, next_start: 'Open the spreadsheet',
  if_then: { cue: 'Tuesday P5', action: 'open the doc', obstacle: 'email' },
  milestones: [{ id: 'm1', title: 'Floor', due_date: '2026-11-20', status: 'open' }]
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tasksApi.getGoal).mockResolvedValue(G);
  vi.mocked(tasksApi.updateGoal).mockImplementation(async (_id, patch) => ({ ...G, ...(patch as object) }));
  vi.mocked(tasksApi.listProjects).mockResolvedValue([
    project({ id: 'p1', title: 'Portfolio', parent_goal_id: 'g1' }),
    project({ id: 'p2', title: 'Free project' })
  ]);
  vi.mocked(tasksApi.listTasks).mockResolvedValue([task({ id: 't1', title: 'Write up 6.3', parent_goal_id: 'g1' })]);
  vi.mocked(tasksApi.getHubPrefs).mockResolvedValue({ school_terms: [{ year: 2026, terms: [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }] }] } as never);
  vi.mocked(tasksApi.createTask).mockResolvedValue(task({ id: 't2', title: 'New' }));
  vi.mocked(tasksApi.updateProject).mockResolvedValue(project({ id: 'p2', title: 'Free project', parent_goal_id: 'g1' }));
  vi.mocked(tasksApi.getGoalRead).mockResolvedValue({ read: null, reason: 'first' } as never);
});

describe('goal page', () => {
  it('renders structure, lead strip, if-then, start, hosted projects and tasks, and mounts @ tags', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    expect(canvas.querySelector('.goal-card .hub-pills__btn.is-active')?.textContent).toBe('Floor · target · stretch');
    expect(canvas.querySelectorAll('.goal-lead__cells .cell')).toHaveLength(10);
    // Deviation (Adam chose option 1): assert input values — plan UI keeps cue/start in <input>, not text nodes.
    expect(canvas.querySelector<HTMLInputElement>('.goal-ifthen input')?.value).toBe('Tuesday P5');
    expect(canvas.querySelector<HTMLInputElement>('.goal-start input')?.value).toBe('Open the spreadsheet');
    expect(canvas.textContent).toContain('Portfolio');
    expect(canvas.textContent).toContain('Write up 6.3');
    expect(mountTagAnythingSection).toHaveBeenCalledWith(expect.any(HTMLElement), 'tasks:goal:g1');
  });

  it('switching structure patches only structure', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    [...canvas.querySelectorAll<HTMLButtonElement>('.goal-card .hub-pills__btn')].find((b) => b.textContent === 'WOOP')!.click();
    expect(tasksApi.updateGoal).toHaveBeenCalledWith('g1', { structure: 'woop' });
  });

  it('+1 this week adds a manual tap on the Monday key', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    canvas.querySelector<HTMLButtonElement>('[data-action="plus-one"]')!.click();
    expect(tasksApi.updateGoal).toHaveBeenCalledWith('g1', { week_log: { '2026-11-02': { manual: 1 } } });
  });

  it('links a free project and adds a task under the goal with the sphere domain', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    const select = canvas.querySelector<HTMLSelectElement>('select[name="link-project"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'p2']);
    select.value = 'p2';
    canvas.querySelector<HTMLButtonElement>('[data-action="link-project"]')!.click();
    expect(tasksApi.updateProject).toHaveBeenCalledWith('p2', { parent_goal_id: 'g1' });

    const input = canvas.querySelector<HTMLInputElement>('input[name="new-task"]')!;
    input.value = 'Collect student voice';
    canvas.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click();
    expect(tasksApi.createTask).toHaveBeenCalledWith({ title: 'Collect student voice', domain: 'other', parent_goal_id: 'g1' });
  });
});
