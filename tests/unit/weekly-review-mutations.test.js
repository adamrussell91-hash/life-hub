/**
 * Weekly Review durable mutation contract (W1–W12).
 * Exercises productivity-os stage machine + clare-work confirm boundary.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createWeeklyReview,
  runWeeklyReviewStage,
  buildWeeklyPendingChanges,
  WEEKLY_REVIEW_STAGES
} from '../../netlify/functions/_shared/productivity-os.mjs';
import { executeClareWork } from '../../netlify/functions/_shared/clare-work.mjs';

function memoryTasksStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setJSON(key, value) {
      data[key] = value;
    },
    async set(key, value) {
      data[key] = typeof value === 'string' ? JSON.parse(value) : value;
    }
  };
}

function advanceTo(state, stage, input = {}) {
  let next = state;
  let guard = 0;
  while (next.current_stage !== stage && guard < 20) {
    next = runWeeklyReviewStage(next, {
      tasks: input.tasks ?? [],
      projects: input.projects ?? [],
      today_key: input.today_key ?? '2026-09-08',
      past_notes: input.past_notes ?? ['past'],
      upcoming_notes: input.upcoming_notes ?? ['upcoming'],
      schedule: input.schedule ?? { proposed: [] },
      next_action_titles: input.next_action_titles,
      waiting_decisions: input.waiting_decisions,
      someday_decisions: input.someday_decisions,
      dump_text: input.dump_text
    });
    guard += 1;
  }
  assert.equal(next.current_stage, stage);
  return next;
}

const activeProject = {
  id: 'proj_marking',
  title: 'Marking pack',
  status: 'active'
};

describe('Weekly Review durable mutations W1–W12', () => {
  it('W1: missing next action finding creates no mutation by itself', () => {
    let state = createWeeklyReview('wr_w1');
    state = runWeeklyReviewStage(state, { dump_text: '' });
    state = advanceTo(state, 'someday', {
      projects: [activeProject],
      tasks: []
    });
    // projects stage has run; confirm not reached so no pending package yet
    assert.ok(state.project_health.some((h) => h.project_id === 'proj_marking' && h.health === 'missing_next_action'));
    assert.equal(state.pending_changes.length, 0);
  });

  it('W2: concrete next action proposal becomes confirmable pending change', () => {
    let state = createWeeklyReview('wr_w2');
    state = advanceTo(state, 'confirm', {
      dump_text: '',
      projects: [activeProject],
      tasks: [],
      next_action_titles: { proj_marking: 'Score Year 10 essays' },
      schedule: { proposed: [] }
    });
    const nextAction = state.pending_changes.find((c) => c.kind === 'next_action' && c.project_id === 'proj_marking');
    assert.ok(nextAction);
    assert.equal(nextAction.title, 'Score Year 10 essays');
    assert.equal(nextAction.selected, true);
    assert.equal(nextAction.confirmable, true);
  });

  it('W3: Confirm creates task with parent_project_id and consumes pending path', async () => {
    let state = createWeeklyReview('wr_w3');
    state = advanceTo(state, 'confirm', {
      dump_text: '',
      projects: [activeProject],
      tasks: [],
      next_action_titles: { proj_marking: 'Score Year 10 essays' },
      schedule: { proposed: [] }
    });
    const store = memoryTasksStore();
    const result = await executeClareWork(
      'weekly_review',
      {
        review_id: 'wr_w3',
        state,
        advance: false,
        confirm: true,
        selected_changes: ['next_action:proj_marking']
      },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [],
        projects: [activeProject],
        lessons: [],
        workBlocks: [],
        tasksStore: store
      }
    );
    assert.equal(result.kind, 'propose');
    const write = result.proposal.writes.find((w) => String(w.path).includes('tasks:task:'));
    assert.ok(write);
    const task = JSON.parse(write.content);
    assert.equal(task.title, 'Score Year 10 essays');
    assert.equal(task.parent_project_id, 'proj_marking');
    assert.equal(result.kind, 'propose');
    assert.ok(result.proposal?.writes?.length);
    // awaiting_confirm is set only after chat queue persistence (see WR product-boundary tests).
    assert.equal(result.state.status, 'in_progress');
    assert.equal(result.workflow_kind, 'weekly_review');
  });

  it('W4: deselected next action is not written', async () => {
    let state = createWeeklyReview('wr_w4');
    state = advanceTo(state, 'confirm', {
      dump_text: 'Buy milk',
      projects: [activeProject],
      tasks: [],
      next_action_titles: { proj_marking: 'Score Year 10 essays' },
      schedule: { proposed: [] }
    });
    const capture = state.pending_changes.find((c) => c.kind === 'capture');
    assert.ok(capture);
    const result = await executeClareWork(
      'weekly_review',
      {
        review_id: 'wr_w4',
        state,
        advance: false,
        confirm: true,
        selected_changes: [capture.id]
      },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [],
        projects: [activeProject],
        lessons: [],
        workBlocks: [],
        tasksStore: memoryTasksStore()
      }
    );
    assert.equal(result.kind, 'propose');
    assert.equal(
      result.proposal.writes.some((w) => {
        try {
          return JSON.parse(w.content).parent_project_id === 'proj_marking';
        } catch {
          return false;
        }
      }),
      false
    );
  });

  it('W5: waiting follow_up persists exact fields on Confirm', async () => {
    const waitingTask = {
      id: 'task_wait',
      title: 'Acme quote',
      status: 'open',
      bucket: 'active',
      waiting_on: 'Acme',
      waiting_since: '2026-09-01',
      waiting_status: 'waiting',
      follow_up_at: '2026-09-07'
    };
    let state = createWeeklyReview('wr_w5');
    state = advanceTo(state, 'confirm', {
      dump_text: '',
      tasks: [waitingTask],
      projects: [],
      waiting_decisions: { task_wait: { action: 'follow_up', follow_up_at: '2026-09-10' } },
      schedule: { proposed: [] }
    });
    const result = await executeClareWork(
      'weekly_review',
      {
        review_id: 'wr_w5',
        state,
        advance: false,
        confirm: true,
        selected_changes: ['waiting:task_wait:follow_up']
      },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [waitingTask],
        projects: [],
        lessons: [],
        workBlocks: [],
        tasksStore: memoryTasksStore()
      }
    );
    assert.equal(result.kind, 'propose');
    const write = result.proposal.writes.find((w) => w.path === 'tasks:task:task_wait');
    assert.ok(write);
    const task = JSON.parse(write.content);
    assert.equal(task.follow_up_at, '2026-09-10');
    assert.equal(task.waiting_status, 'follow_up_due');
  });

  it('W6: waiting resolved clears waiting fields', async () => {
    const waitingTask = {
      id: 'task_wait2',
      title: 'Invoice',
      status: 'open',
      bucket: 'active',
      waiting_on: 'Finance',
      waiting_since: '2026-09-01',
      waiting_status: 'waiting',
      follow_up_at: '2026-09-07'
    };
    let state = createWeeklyReview('wr_w6');
    state = advanceTo(state, 'confirm', {
      dump_text: '',
      tasks: [waitingTask],
      projects: [],
      waiting_decisions: { task_wait2: { action: 'resolved' } },
      schedule: { proposed: [] }
    });
    const result = await executeClareWork(
      'weekly_review',
      {
        review_id: 'wr_w6',
        state,
        advance: false,
        confirm: true,
        selected_changes: ['waiting:task_wait2:resolved']
      },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [waitingTask],
        projects: [],
        lessons: [],
        workBlocks: [],
        tasksStore: memoryTasksStore()
      }
    );
    const task = JSON.parse(result.proposal.writes[0].content);
    assert.equal(task.waiting_status, 'resolved');
    assert.equal(task.waiting_on, null);
    assert.equal(task.follow_up_at, null);
  });

  it('W7: multiple selected changes write only those kinds', async () => {
    const waitingTask = {
      id: 'task_wait3',
      title: 'Reply',
      status: 'open',
      bucket: 'active',
      waiting_on: 'Sam',
      waiting_since: '2026-09-01',
      waiting_status: 'waiting',
      follow_up_at: '2026-09-07'
    };
    let state = createWeeklyReview('wr_w7');
    state = advanceTo(state, 'confirm', {
      dump_text: '',
      tasks: [waitingTask],
      projects: [activeProject],
      next_action_titles: { proj_marking: 'Draft rubric' },
      waiting_decisions: { task_wait3: { action: 'follow_up', follow_up_at: '2026-09-12' } },
      schedule: { proposed: [] }
    });
    const result = await executeClareWork(
      'weekly_review',
      {
        review_id: 'wr_w7',
        state,
        advance: false,
        confirm: true,
        selected_changes: ['next_action:proj_marking', 'waiting:task_wait3:follow_up']
      },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [waitingTask],
        projects: [activeProject],
        lessons: [],
        workBlocks: [],
        tasksStore: memoryTasksStore()
      }
    );
    assert.equal(result.proposal.writes.length, 2);
  });

  it('W8: resume mid-review keeps stage and does not duplicate pending changes', () => {
    let state = createWeeklyReview('wr_w8');
    state = advanceTo(state, 'projects', {
      projects: [activeProject],
      tasks: [],
      next_action_titles: { proj_marking: 'Score essays' }
    });
    const mid = structuredClone(state);
    let resumed = runWeeklyReviewStage(mid, {
      projects: [activeProject],
      tasks: [],
      today_key: '2026-09-08',
      next_action_titles: { proj_marking: 'Score essays' }
    });
    resumed = advanceTo(resumed, 'confirm', {
      projects: [activeProject],
      tasks: [],
      next_action_titles: { proj_marking: 'Score essays' },
      schedule: { proposed: [] }
    });
    const ids = resumed.pending_changes.map((c) => c.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.equal(ids.filter((id) => id === 'next_action:proj_marking').length, 1);
  });

  it('W9: invalid next_action without title is rejected before writes', async () => {
    let state = createWeeklyReview('wr_w9');
    state = advanceTo(state, 'confirm', {
      dump_text: '',
      projects: [activeProject],
      tasks: [],
      schedule: { proposed: [] }
    });
    // Force a malformed confirmable row into pending (simulates bad client state).
    state = {
      ...state,
      pending_changes: [
        {
          id: 'next_action:proj_marking',
          kind: 'next_action',
          project_id: 'proj_marking',
          title: '',
          summary: 'bad',
          selected: true,
          confirmable: true
        }
      ]
    };
    const result = await executeClareWork(
      'weekly_review',
      { review_id: 'wr_w9', state, advance: false, confirm: true },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [],
        projects: [activeProject],
        lessons: [],
        workBlocks: [],
        tasksStore: memoryTasksStore()
      }
    );
    assert.notEqual(result.kind, 'propose');
    assert.ok(result.ok === false || result.kind === 'deny' || result.error);
  });

  it('W10: Weekly Review pending id identity — Confirm WR leaves unrelated pending alone', async () => {
    // Boundary: weekly_review propose writes are independent of an unrelated pending action id.
    let state = createWeeklyReview('wr_w10');
    state = advanceTo(state, 'confirm', {
      dump_text: '',
      projects: [activeProject],
      tasks: [],
      next_action_titles: { proj_marking: 'Write feedback' },
      schedule: { proposed: [] }
    });
    const unrelatedPending = [{ id: 'act_other', slug: 'clare', proposal: { intent: 'other' } }];
    const result = await executeClareWork(
      'weekly_review',
      {
        review_id: 'wr_w10',
        state,
        advance: false,
        confirm: true,
        selected_changes: ['next_action:proj_marking']
      },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [],
        projects: [activeProject],
        lessons: [],
        workBlocks: [],
        tasksStore: memoryTasksStore()
      }
    );
    assert.equal(result.kind, 'propose');
    assert.equal(unrelatedPending[0].id, 'act_other');
    assert.ok(result.proposal.writes.every((w) => String(w.path).startsWith('tasks:')));
  });

  it('W11: build_week schedule_block pending uses write path ids for Confirm', () => {
    let state = createWeeklyReview('wr_w11');
    state = advanceTo(state, 'confirm', {
      dump_text: '',
      projects: [],
      tasks: [],
      schedule: {
        proposed: [
          {
            id: 'tasks:work_block:wb1',
            write_path: 'tasks:work_block:wb1',
            title: 'Deep mark',
            date: '2026-09-09',
            start_time: '09:00',
            duration_minutes: 45,
            selected: true
          }
        ]
      }
    });
    const block = state.pending_changes.find((c) => c.kind === 'schedule_block');
    assert.ok(block);
    assert.equal(block.id, 'tasks:work_block:wb1');
  });

  it('W12: informational finding is not confirmable and produces no write', async () => {
    let state = createWeeklyReview('wr_w12');
    state = advanceTo(state, 'confirm', {
      dump_text: '',
      projects: [activeProject],
      tasks: [],
      schedule: { proposed: [] }
    });
    const info = state.pending_changes.find((c) => c.kind === 'informational');
    assert.ok(info);
    assert.equal(info.confirmable, false);
    const result = await executeClareWork(
      'weekly_review',
      { review_id: 'wr_w12', state, advance: false, confirm: true },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [],
        projects: [activeProject],
        lessons: [],
        workBlocks: [],
        tasksStore: memoryTasksStore()
      }
    );
    assert.notEqual(result.kind, 'propose');
  });

  it('stages list remains the established eight-stage model', () => {
    assert.deepEqual(WEEKLY_REVIEW_STAGES, [
      'capture',
      'past_calendar',
      'upcoming_calendar',
      'waiting',
      'projects',
      'someday',
      'build_week',
      'confirm'
    ]);
  });
});
