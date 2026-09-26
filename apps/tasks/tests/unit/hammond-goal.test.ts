// apps/tasks/tests/unit/hammond-goal.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { describeGhost, orderReadsForStrip, overlayFromReads, type GoalRead } from '@/domain/goal-reads';
import { mountHammondPanel, renderHammondStrip } from '@/views/hammond-goal';
import { goal } from './goal-fixtures';

vi.mock('@/services/client-api', () => ({
  tasksApi: { getGoalRead: vi.fn(), rescanGoalRead: vi.fn(), decideGhost: vi.fn() }
}));

const READ: GoalRead = {
  goal_id: 'g1', computed_on: '2026-11-04', basis_updated_at: 'x', temperature: 'cold', days_since_movement: 9,
  week: { count: 0, per_week: 1 }, crunch_weeks: ['2026-11-16'],
  verdict: 'Gone quiet: nothing for 9 days. 0 of 1 this week.', looked_at: ['Progress', 'Lead measure'],
  ghosts: [
    { id: 'goal-g1-split-t1', agent: 'hammond', kind: 'split_task', taskId: 't1', title: 'Write up 6.3', steps: ['a', 'b', 'c'], reason: 'It is due within a week' },
    { id: 'goal-g1-rest-2026-11-16', agent: 'hammond', kind: 'goal_rest_weeks', goalId: 'g1', title: 'HA', weeks: ['2026-11-16'], rest_weeks: ['2026-11-16'] }
  ]
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tasksApi.getGoalRead).mockResolvedValue({ read: READ, reason: 'changed' });
  vi.mocked(tasksApi.decideGhost).mockResolvedValue({ receipt: 'Hammond → Tasks: done.', writes: 'applied' });
});

describe('goal reads domain', () => {
  it('describes each ghost kind for a confirm card', () => {
    expect(describeGhost(READ.ghosts[0]!)).toMatchObject({ kind: 'Task · split into steps', title: 'Split “Write up 6.3” into 3 steps' });
    expect(describeGhost(READ.ghosts[1]!).diff?.after[0]).toContain('16/11/26');
  });

  it('orders the strip coldest first and builds the runway overlay', () => {
    const warm = { ...READ, goal_id: 'g2', temperature: 'warm' as const, days_since_movement: 1, ghosts: [] };
    expect(orderReadsForStrip([warm, READ]).map((r) => r.goal_id)).toEqual(['g1', 'g2']);
    const overlay = overlayFromReads([READ, warm]);
    expect(overlay.crunchWeeks).toEqual(['2026-11-16']);
    expect(overlay.proposedRest).toEqual({ g1: ['2026-11-16'] });
    expect([...overlay.proposalGoalIds]).toEqual(['g1']);
  });
});

describe('Hammond panel', () => {
  it('shows the read, why it rescanned, and confirm cards that accept or dismiss', async () => {
    const host = document.createElement('div');
    const onApplied = vi.fn();
    mountHammondPanel(host, goal({ id: 'g1', title: 'HA' }), onApplied);
    await flush();
    expect(host.textContent).toContain('Gone quiet');
    expect(host.textContent).toContain('something changed');
    const cards = host.querySelectorAll('.confirm-card');
    expect(cards).toHaveLength(2);
    cards[0]!.querySelector<HTMLButtonElement>('[data-decision="accept"]')!.click();
    await flush();
    expect(tasksApi.decideGhost).toHaveBeenCalledWith('goal-g1-split-t1', 'accept');
    expect(onApplied).toHaveBeenCalled();
    cards[1]!.querySelector<HTMLButtonElement>('[data-decision="dismiss"]')!.click();
    await flush();
    expect(tasksApi.decideGhost).toHaveBeenCalledWith('goal-g1-rest-2026-11-16', 'dismiss');
    expect(host.querySelectorAll('.confirm-card')).toHaveLength(1);
  });

  it('the landing strip lists the coldest verdict with the goal title and up to two chips', () => {
    const host = document.createElement('div');
    renderHammondStrip(host, [{ read: READ, reason: 'daily' }], [goal({ id: 'g1', title: 'HA evidence' })], vi.fn());
    expect(host.querySelector('.hammond-strip__read')?.textContent).toContain('HA evidence: Gone quiet');
    expect(host.querySelectorAll('.hammond-chip')).toHaveLength(2);
  });
});
