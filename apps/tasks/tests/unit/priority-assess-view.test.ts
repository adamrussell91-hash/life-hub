import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import {
  createPriorityAssessControls,
  maybeApplyPriorityFloors,
  resetPriorityAssessSession
} from '@/views/priority-assess';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    assessPriorities: vi.fn()
  }
}));

describe('priority assess controls', () => {
  beforeEach(() => {
    resetPriorityAssessSession();
    vi.mocked(tasksApi.assessPriorities).mockReset();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('shows a confirm card for proposed tag changes and applies on Confirm', async () => {
    vi.mocked(tasksApi.assessPriorities).mockResolvedValueOnce({
      mode: 'full',
      applied: false,
      skipped: 0,
      tasks: [],
      changes: [
        {
          id: 'task_1',
          title: 'Mark essays',
          current: 'medium',
          suggested: 'urgent',
          reason: 'Overdue 3 days',
          changed: true
        }
      ]
    });
    vi.mocked(tasksApi.assessPriorities).mockResolvedValueOnce({
      mode: 'full',
      applied: true,
      skipped: 0,
      changes: [],
      tasks: []
    });

    const onApplied = vi.fn();
    const controls = createPriorityAssessControls({ onApplied });
    document.body.append(controls.el);
    const button = controls.el.querySelector('button');
    expect(button?.textContent).toBe('Assess priorities');
    button?.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Mark essays — medium → urgent');
    });
    const confirm = [...document.body.querySelectorAll('button')].find(
      (node) => node.textContent === 'Confirm'
    );
    confirm?.click();
    await vi.waitFor(() => {
      expect(onApplied).toHaveBeenCalled();
    });
    expect(vi.mocked(tasksApi.assessPriorities).mock.calls[1]?.[0]).toEqual({
      mode: 'full',
      apply: true
    });
  });

  it('auto-applies floor raises once per session', async () => {
    vi.mocked(tasksApi.assessPriorities).mockResolvedValue({
      mode: 'floor',
      applied: true,
      skipped: 0,
      changes: [
        {
          id: 'task_1',
          title: 'Call Kate',
          current: 'low',
          suggested: 'urgent',
          reason: 'Due today',
          changed: true
        }
      ],
      tasks: []
    });
    const first = await maybeApplyPriorityFloors();
    const second = await maybeApplyPriorityFloors();
    expect(first?.applied).toBe(true);
    expect(second).toBeNull();
    expect(tasksApi.assessPriorities).toHaveBeenCalledTimes(1);
    expect(tasksApi.assessPriorities).toHaveBeenCalledWith({ mode: 'floor', apply: true });
  });
});
