import { describe, expect, it, vi } from 'vitest';
import { problemSolverChips } from '../../src/views/problem-solver/link-chips';

describe('problemSolverChips', () => {
  it('shows one chip per session; a review chip opens the session at Improve', async () => {
    const linked = vi.fn().mockResolvedValue([{ id: 's1', title: 'Late rota', phase: 'implement', model: 'seven_step', role: 'review' }, { id: 's2', title: 'Noisy office', phase: 'analyse', model: 'seven_step', role: 'task' }]);
    const host = problemSolverChips({ kind: 'task', id: 't1' }, { linked });
    await vi.waitFor(() => expect(host.querySelectorAll('a.ps-linkchip')).toHaveLength(2));
    const [review, task] = [...host.querySelectorAll<HTMLAnchorElement>('a.ps-linkchip')];
    expect(review.getAttribute('href')).toBe('#/problem-solver?id=s1&step=improve');
    expect(review.textContent).toContain('Review');
    expect(task.getAttribute('href')).toBe('#/problem-solver?id=s2');
    expect(linked).toHaveBeenCalledWith('task:t1');
    expect(host.hidden).toBe(false);
  });
  it('stays hidden when nothing links here or the lookup fails', async () => {
    const host = problemSolverChips({ kind: 'project', id: 'p1' }, { linked: vi.fn().mockRejectedValue(new Error('offline')) });
    await new Promise((r) => setTimeout(r, 0));
    expect(host.hidden).toBe(true);
    const none = problemSolverChips({ kind: 'project', id: 'p2' }, { linked: vi.fn().mockResolvedValue([]) });
    await new Promise((r) => setTimeout(r, 0));
    expect(none.hidden).toBe(true);
  });
});
