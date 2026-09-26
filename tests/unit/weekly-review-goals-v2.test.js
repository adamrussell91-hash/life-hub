// tests/unit/weekly-review-goals-v2.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  WEEKLY_REVIEW_STAGES,
  buildWeeklyPendingChanges,
  createWeeklyReview,
  goalsStageRows,
  orphanCompletionsThisWeek,
  runWeeklyReviewStage
} from '../../netlify/functions/_shared/productivity-os.mjs';

describe('G-38…G-40 weekly review goals stage (server)', () => {
  it('includes goals in the stage list', () => {
    assert.ok(WEEKLY_REVIEW_STAGES.includes('goals'));
    assert.equal(WEEKLY_REVIEW_STAGES.indexOf('goals'), WEEKLY_REVIEW_STAGES.indexOf('projects') + 1);
  });

  it('builds rows and orphans, then pending goal_link changes', () => {
    const goals = [{ id: 'g1', title: 'Marking', status: 'active', lead_measure: { per_week: 2 }, week_log: { '2026-11-02': { manual: 1 } } }];
    const tasks = [
      { id: 'a', title: 'Orphan', completed_at: '2026-11-03T01:00:00.000Z', status: 'done' },
      { id: 'b', title: 'Linked', completed_at: '2026-11-03T01:00:00.000Z', status: 'done', parent_goal_id: 'g1' }
    ];
    const rows = goalsStageRows(goals, [], tasks, '2026-11-04', { g1: 'Moving.' });
    assert.equal(rows[0].count, 2); // manual 1 + linked completion
    assert.deepEqual(orphanCompletionsThisWeek(goals, [], tasks, '2026-11-04').map((o) => o.task_id), ['a']);

    let state = createWeeklyReview('wr');
    state = { ...state, current_stage: 'goals' };
    state = runWeeklyReviewStage(state, {
      today_key: '2026-11-04',
      goals,
      tasks,
      projects: [],
      orphan_links: { a: 'g1' }
    });
    assert.ok(state.completed.includes('goals'));
    assert.equal(state.current_stage, 'someday');
    const pending = buildWeeklyPendingChanges(state);
    assert.ok(pending.some((p) => p.kind === 'goal_link' && p.destination === 'g1'));
  });
});
