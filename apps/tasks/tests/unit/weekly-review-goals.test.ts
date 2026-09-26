// apps/tasks/tests/unit/weekly-review-goals.test.ts
import { describe, expect, it } from 'vitest';
import { goalsStageRows, orphanCompletionsThisWeek } from '@/domain/weekly-review-goals';
import {
  buildWeeklyPendingChanges,
  createWeeklyReview,
  runWeeklyReviewStage
} from '@/domain/weekly-review';
import { goal, project, task } from './goal-fixtures';

describe('weekly review goals stage', () => {
  it('builds goal rows with this week counts', () => {
    const g = goal({
      id: 'g1',
      title: 'Marking',
      lead_measure: { label: '2', per_week: 2 },
      week_log: { '2026-11-02': { manual: 1 } }
    });
    const rows = goalsStageRows([g], [], [], '2026-11-04', { g1: 'Moving.' });
    expect(rows[0]).toMatchObject({ goal_id: 'g1', count: 1, per_week: 2, verdict: 'Moving.' });
  });

  it('lists completed tasks with no goal this week', () => {
    const orphans = orphanCompletionsThisWeek(
      [goal({ id: 'g1', title: 'G' })],
      [project({ id: 'p1', title: 'P', parent_goal_id: 'g1' })],
      [
        task({ id: 'a', title: 'Orphan', status: 'done', completed_at: '2026-11-03T01:00:00.000Z' }),
        task({ id: 'b', title: 'Hosted', status: 'done', completed_at: '2026-11-03T01:00:00.000Z', parent_project_id: 'p1' }),
        task({ id: 'c', title: 'Linked', status: 'done', completed_at: '2026-11-03T01:00:00.000Z', parent_goal_id: 'g1' })
      ],
      '2026-11-04'
    );
    expect(orphans.map((o) => o.task_id)).toEqual(['a']);
  });

  it('advances through goals stage and pending-changes include goal links (G-38…G-40)', () => {
    let state = createWeeklyReview('wr_goals');
    state = { ...state, current_stage: 'goals' };
    state = runWeeklyReviewStage(state, {
      today_key: '2026-11-04',
      goals_review: [{ goal_id: 'g1', title: 'Marking', count: 1, per_week: 2, verdict: 'Moving.' }],
      orphan_completions: [{ task_id: 'a', title: 'Orphan' }],
      orphan_links: { a: 'g1', b: null }
    });
    expect(state.completed).toContain('goals');
    expect(state.current_stage).toBe('someday');
    expect(state.goals_review?.[0]?.title).toBe('Marking');
    const pending = buildWeeklyPendingChanges(state);
    expect(pending.some((p) => p.kind === 'goal_link' && p.task_id === 'a')).toBe(true);
    expect(pending.some((p) => p.kind === 'goal_link_dismiss' && p.task_id === 'b')).toBe(true);
  });
});
