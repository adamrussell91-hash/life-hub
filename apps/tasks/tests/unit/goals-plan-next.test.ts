// apps/tasks/tests/unit/goals-plan-next.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { openPlanNextTerm } from '@/views/goals-plan-next';
import { goal } from './goal-fixtures';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    planTerm: vi.fn(),
    updateGoal: vi.fn()
  }
}));

vi.mock('../../design-kit/js/hub-feedback.js', () => ({
  showHubToast: vi.fn()
}));

const T4 = { term: 4 as const, starts_on: '2026-10-12', ends_on: '2026-12-18' };

describe('Plan next term sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tasksApi.planTerm).mockResolvedValue({ goals: [] });
    vi.mocked(tasksApi.updateGoal).mockImplementation(async (id, patch) => goal({ id, ...(patch as object) }));
  });

  it('opens with Ongoing goals when the term has none active', () => {
    const host = document.createElement('div');
    const ongoing = goal({ id: 'og', title: 'Keep training', term: null, status: 'active' });
    openPlanNextTerm(host, [ongoing], T4, () => undefined);
    const sheet = host.querySelector('.goals-plan-sheet')!;
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toContain('Keep training');
    expect(sheet.textContent).toMatch(/Put in Term 1/);
    expect(sheet.textContent).toMatch(/Keep ongoing/);
  });

  it('shows empty state with New goal when nothing to review', () => {
    const host = document.createElement('div');
    const onNew = vi.fn();
    openPlanNextTerm(host, [], T4, () => undefined, { onNewGoal: onNew });
    const sheet = host.querySelector('.goals-plan-sheet')!;
    expect(sheet.textContent).toMatch(/Nothing to review/);
    const btn = [...sheet.querySelectorAll('button')].find((b) => b.textContent === 'New goal')!;
    btn.click();
    expect(onNew).toHaveBeenCalled();
    expect(host.querySelector('.goals-plan-sheet')).toBeNull();
  });
});
