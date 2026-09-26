// apps/tasks/tests/unit/goals-view.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderGoalsView } from '@/views/goals';
import { goal, task } from './goal-fixtures';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listGoals: vi.fn(),
    listProjects: vi.fn(),
    listTasks: vi.fn(),
    getHubPrefs: vi.fn(),
    createGoal: vi.fn(),
    getGoalReads: vi.fn()
  }
}));

const T4 = { term: 4 as const, starts_on: '2026-10-12', ends_on: '2026-12-18' };

beforeEach(() => {
  vi.mocked(tasksApi.listGoals).mockResolvedValue([
    goal({ id: 'w1', title: 'Marking back in 10 days', sphere: 'work', structure: 'lead_lag', lead_measure: { label: '2 blocks / wk', per_week: 1 } }),
    goal({ id: 'p1', title: 'HA evidence', sphere: 'professional', structure: 'floor_target_stretch' }),
    goal({ id: 'l9', title: 'Half marathon', sphere: 'life', status: 'parked' })
  ]);
  vi.mocked(tasksApi.listProjects).mockResolvedValue([]);
  vi.mocked(tasksApi.listTasks).mockResolvedValue([
    task({ id: 't1', title: 'Yr 11 essays', parent_goal_id: 'w1', due_date: '2026-11-05' })
  ]);
  vi.mocked(tasksApi.getHubPrefs).mockResolvedValue({ school_terms: [{ year: 2026, terms: [T4] }] } as never);
  vi.mocked(tasksApi.getGoalReads).mockResolvedValue({ reads: [] });
  vi.mocked(tasksApi.createGoal).mockResolvedValue(goal({ id: 'new', title: 'New' }));
});

describe('goals landing', () => {
  it('renders three lanes, rows, the one move and links to goal pages', async () => {
    const canvas = document.createElement('div');
    await renderGoalsView(canvas, '2026-11-04');
    expect(canvas.querySelector('.goals-summary')?.textContent).toContain('Term 4 · week 4 of 10');
    const lanes = [...canvas.querySelectorAll('.runway__lane')].map((n) => n.textContent);
    expect(lanes[0]).toContain('Life');
    expect(lanes[1]).toContain('1 of 3 slots');
    const row = canvas.querySelector<HTMLAnchorElement>('a.runway__row[href="#/goal/w1"]');
    expect(row?.textContent).toContain('Marking back in 10 days');
    expect(row?.textContent).toContain('LEAD/LAG');
    expect(row?.textContent).toContain('Yr 11 essays');
    expect(row?.querySelectorAll('.cell')).toHaveLength(10);
    expect(canvas.querySelector('.runway__parked')?.textContent).toContain('Half marathon');
  });

  it('creates a goal in the chosen lane, parked when the lane is full', async () => {
    vi.mocked(tasksApi.listGoals).mockResolvedValue([
      goal({ id: 'a', title: 'A', sphere: 'work' }),
      goal({ id: 'b', title: 'B', sphere: 'work' }),
      goal({ id: 'c', title: 'C', sphere: 'work' })
    ]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const canvas = document.createElement('div');
    await renderGoalsView(canvas, '2026-11-04');
    canvas.querySelector<HTMLButtonElement>('[data-action="new-goal"]')!.click();
    const form = canvas.querySelector<HTMLFormElement>('.goals-new')!;
    form.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'D';
    form.querySelector<HTMLSelectElement>('select[name="sphere"]')!.value = 'work';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    expect(confirm).toHaveBeenCalled();
    expect(tasksApi.createGoal).toHaveBeenCalledWith({ title: 'D', sphere: 'work', status: 'parked' });
  });

  it('shows a clear empty state when no school terms are set', async () => {
    vi.mocked(tasksApi.getHubPrefs).mockResolvedValue({ school_terms: [] } as never);
    const canvas = document.createElement('div');
    await renderGoalsView(canvas, '2026-11-04');
    expect(canvas.textContent).toContain('Add your school terms');
  });
});
