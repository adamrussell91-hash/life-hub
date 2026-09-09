/**
 * Productivity OS continuation — multi-block, teaching lessons, Hammond ctx,
 * stale confirm, focus session propose.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeDaySchedule,
  lessonToBusySpan,
  detectStaleScheduleCollisions,
  buildAuthoritativeHardBusy
} from '../../netlify/functions/_shared/productivity-os.mjs';
import { executeHammondProductivity } from '../../netlify/functions/_shared/hammond-productivity.mjs';
import { executeClareWork, planWork } from '../../netlify/functions/_shared/clare-work.mjs';
import { validateProposeActionInput } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

describe('H: multi work blocks same task_id', () => {
  it('splits remaining minutes across multiple blocks with one task_id', () => {
    const result = composeDaySchedule({
      date: '2026-09-08',
      workday: { start: '08:00', end: '12:00', source: 'profile' },
      lessons: [
        { start: 9 * 60, end: 10 * 60, title: 'Period 1', kind: 'lesson' },
        { start: 10 * 60 + 45, end: 11 * 60 + 45, title: 'Period 2', kind: 'lesson' }
      ],
      tasks: [{ id: 'essay', title: 'Essay', estimated_duration: 90, depth: 'shallow' }]
    });
    assert.ok(result.proposed.length >= 2);
    assert.ok(result.proposed.every((b) => b.task_id === 'essay'));
    assert.equal(
      result.proposed.reduce((s, b) => s + b.duration_minutes, 0),
      90
    );
  });
});

describe('I: teaching lesson shape blocks schedule', () => {
  it('converts date+start_time lessons without duration_minutes into hard busy', () => {
    const span = lessonToBusySpan({
      title: 'Year 10 English',
      date: '2026-09-08',
      start_time: '11:00'
    });
    assert.deepEqual(span, {
      start: 11 * 60,
      end: 12 * 60,
      title: 'Year 10 English',
      kind: 'lesson'
    });

    const composed = planWork('compose', {
      date: '2026-09-08',
      tasks: [
        {
          id: 't1',
          title: 'Mark pack',
          estimated_duration: 45,
          status: 'open',
          due_date: '2026-09-08'
        }
      ],
      lessons: [
        {
          id: 'sl1',
          title: 'Year 10 English',
          date: '2026-09-08',
          start_time: '09:00'
          // no duration_minutes / start_minutes
        }
      ],
      workday: { start: '08:00', end: '12:00', source: 'test' }
    });
    assert.equal(composed.ok, true);
    for (const block of composed.proposed) {
      const start =
        Number(block.start_time.slice(0, 2)) * 60 + Number(block.start_time.slice(3));
      const end = start + block.duration_minutes;
      assert.equal(start >= 9 * 60 && start < 10 * 60, false);
      assert.equal(end > 9 * 60 && end <= 10 * 60, false);
    }
  });
});

describe('J: stale confirm detects new teaching collision', () => {
  it('flags proposed work blocks that collide with authoritative lessons', () => {
    const hardBusy = buildAuthoritativeHardBusy({
      date: '2026-09-08',
      lessons: [{ title: 'New lesson', date: '2026-09-08', start_time: '10:00' }],
      workBlocks: [],
      planningProfile: null
    });
    const check = detectStaleScheduleCollisions({
      proposedBlocks: [
        {
          temp_id: 'wb1',
          task_id: 't1',
          title: 'Mark',
          date: '2026-09-08',
          start_time: '10:00',
          duration_minutes: 45,
          depth: 'shallow',
          selected: true
        }
      ],
      hardBusy
    });
    assert.equal(check.ok, false);
    assert.equal(check.error, 'stale_schedule_collision');
    assert.match(check.conflicts[0].reason, /Collides/);
  });
});

describe('O/P/Q: Hammond tools prefer stored ctx over model arrays', () => {
  it('O: horizons uses ctx direction/areas/goals and ignores model arrays', () => {
    const result = executeHammondProductivity(
      'horizons_chain',
      {
        purpose: 'MODEL PURPOSE SHOULD LOSE',
        vision: 'MODEL VISION SHOULD LOSE',
        principles: ['model'],
        areas: [{ id: 'fake', title: 'Fake area' }],
        goals: [{ id: 'fake', title: 'Fake goal', parent_area_id: 'fake', status: 'active' }],
        focus_type: 'project',
        focus_id: 'p1'
      },
      {
        planning_direction: {
          purpose: 'Teach well',
          principles: ['Depth'],
          vision: 'Calm week'
        },
        areas: [
          {
            id: 'a1',
            title: 'Teaching',
            description: '',
            tags: [],
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z'
          }
        ],
        goals: [
          {
            id: 'g1',
            title: 'Term outcomes',
            parent_area_id: 'a1',
            status: 'active',
            description: '',
            tags: [],
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z'
          }
        ],
        projects: [
          { id: 'p1', title: 'Unit', status: 'active', parent_goal_id: 'g1' }
        ],
        tasks: [{ id: 't1', title: 'Outline', parent_project_id: 'p1', status: 'open' }]
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.purpose, 'Teach well');
    assert.equal(result.vision, 'Calm week');
    assert.equal(result.area?.title, 'Teaching');
  });

  it('P: threefold_audit uses ctx sessions and ignores model sessions', () => {
    const result = executeHammondProductivity(
      'threefold_audit',
      {
        period_start: '2026-09-07',
        period_end: '2026-09-09',
        sessions: [
          {
            id: 'bogus',
            started_at: '2026-09-08T01:00:00.000Z',
            actual_duration_minutes: 999,
            work_mode: 'defining',
            work_mode_confidence: 'explicit'
          }
        ]
      },
      {
        sessions: [
          {
            id: 's1',
            started_at: '2026-09-08T01:00:00.000Z',
            actual_duration_minutes: 40,
            work_mode: 'reactive',
            work_mode_confidence: 'inferred'
          }
        ]
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.classified_sessions, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('Q: portfolio_meter uses ctx planning_profile active_project_limit', () => {
    const result = executeHammondProductivity(
      'portfolio_meter',
      { active_project_limit: 99 },
      {
        projects: [
          { id: 'p1', title: 'A', status: 'active' },
          { id: 'p2', title: 'B', status: 'active' }
        ],
        planning_profile: { active_project_limit: 1 }
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.meter.status, 'over');
    assert.equal(result.meter.limit, 1);
  });
});

describe('G: focus block session persistence via propose', () => {
  it('start/finish return propose writes for work_session', async () => {
    const created = await executeClareWork(
      'focus_block',
      {
        action: 'create',
        outcome: 'Draft intro',
        task_id: 't1',
        depth: 'deep',
        planned_duration_minutes: 50
      },
      { now: new Date('2026-09-08T01:00:00.000Z') }
    );
    assert.equal(created.ok, true);
    const started = await executeClareWork(
      'focus_block',
      { action: 'start', state: created.state },
      { now: new Date('2026-09-08T01:00:00.000Z') }
    );
    assert.equal(started.kind, 'propose');
    assert.ok(started.session_id);
    assert.match(started.proposal.writes[0].path, /^tasks:work_session:/);
    const validated = validateProposeActionInput(started.proposal, { agentSlug: 'clare' });
    assert.equal(validated.ok, true);

    const finished = await executeClareWork(
      'focus_block',
      {
        action: 'finish',
        state: started.state,
        session_id: started.session_id,
        result: 'done'
      },
      { now: new Date('2026-09-08T01:40:00.000Z') }
    );
    assert.equal(finished.kind, 'propose');
    assert.equal(finished.proposal.writes[0].mode, 'append');
    const body = JSON.parse(finished.proposal.writes[0].content);
    assert.equal(body.result, 'done');
    assert.equal(body.actual_duration_minutes, 40);
  });
});

describe('compose_schedule Confirmable proposal', () => {
  it('proposes work_block writes and persists schedule_diff:current', async () => {
    const saved = new Map();
    const tasksStore = {
      async get(key, options = {}) {
        if (!saved.has(key)) return null;
        return saved.get(key);
      },
      async setJSON(key, value) {
        saved.set(key, value);
      },
      async set(key, value) {
        saved.set(key, typeof value === 'string' ? JSON.parse(value) : value);
      }
    };
    const result = await executeClareWork(
      'compose_schedule',
      { date: '2026-09-08', task_ids: ['task_a'] },
      {
        now: new Date('2026-09-08T08:00:00Z'),
        tasks: [
          {
            id: 'task_a',
            title: 'Write report',
            status: 'open',
            estimated_duration: 90,
            depth: 'shallow'
          }
        ],
        projects: [],
        lessons: [],
        workBlocks: [],
        planning_profile: {
          work_windows: {
            mon: [],
            tue: [{ start: '09:00', end: '12:00' }],
            wed: [],
            thu: [],
            fri: [],
            sat: [],
            sun: []
          },
          protected_windows: {
            mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
          }
        },
        tasksStore
      }
    );
    assert.equal(result.kind, 'propose');
    assert.ok(result.proposal?.writes?.length >= 1);
    assert.ok(result.proposal.writes.every((w) => String(w.path).includes('work_block')));
    assert.ok(result.proposed.every((b) => b.task_id === 'task_a'));
    assert.ok(saved.has('workflow_state/schedule_diff:current'));
  });
});

describe('weekly_review confirm proposes durable writes', () => {
  it('finalize on confirm stage returns kind propose with capture/schedule writes', async () => {
    const { createWeeklyReview, runWeeklyReviewStage } = await import(
      '../../netlify/functions/_shared/productivity-os.mjs'
    );
    let state = createWeeklyReview('wr_confirm');
    state = runWeeklyReviewStage(state, {
      dump_text: 'Email parent about homework\nWaiting on Acme for quote'
    });
    while (state.current_stage !== 'confirm') {
      state = runWeeklyReviewStage(state, {
        tasks: [],
        projects: [],
        today_key: '2026-09-08',
        past_notes: ['taught P1'],
        upcoming_notes: ['staff meeting'],
        schedule: {
          proposed: [
            {
              title: 'Email parent',
              date: '2026-09-09',
              start_time: '09:00',
              duration_minutes: 30,
              task_id: null,
              selected: true
            }
          ]
        }
      });
    }
    assert.ok(state.pending_changes.length >= 2);

    const result = await executeClareWork(
      'weekly_review',
      { review_id: 'wr_confirm', state, advance: false, confirm: true },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [],
        projects: [],
        lessons: [],
        workBlocks: [],
        tasksStore: {
          async get() { return null; },
          async set() {},
          async setJSON() {}
        }
      }
    );
    assert.equal(result.kind, 'propose');
    assert.ok(result.proposal.writes.length >= 2);
    assert.ok(result.proposal.writes.some((w) => String(w.path).includes('tasks:task:')));
    assert.ok(result.proposal.writes.some((w) => String(w.path).includes('tasks:work_block:')));
  });
});

describe('K/L/M/N: schedule_diff preview vs confirm selected vs discard', () => {
  it('K: compose preview does not write work_blocks into the tasks store', async () => {
    const saved = new Map();
    const tasksStore = {
      async get(key) { return saved.has(key) ? saved.get(key) : null; },
      async setJSON(key, value) { saved.set(key, value); },
      async set(key, value) { saved.set(key, typeof value === 'string' ? JSON.parse(value) : value); }
    };
    const result = await executeClareWork(
      'compose_schedule',
      { date: '2026-09-08', task_ids: ['task_a'] },
      {
        now: new Date('2026-09-08T08:00:00Z'),
        tasks: [{ id: 'task_a', title: 'Write report', status: 'open', estimated_duration: 60, depth: 'shallow' }],
        projects: [],
        lessons: [],
        workBlocks: [],
        planning_profile: {
          work_windows: { mon: [], tue: [{ start: '09:00', end: '12:00' }], wed: [], thu: [], fri: [], sat: [], sun: [] },
          protected_windows: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
        },
        tasksStore
      }
    );
    assert.equal(result.kind, 'propose');
    assert.ok(saved.has('workflow_state/schedule_diff:current'));
    assert.equal([...saved.keys()].some((k) => k.startsWith('work_blocks/')), false);
  });

  it('L/N: proposed block ids are write paths for Confirm Selected accept binding', async () => {
    const saved = new Map();
    const tasksStore = {
      async get(key) { return saved.has(key) ? saved.get(key) : null; },
      async setJSON(key, value) { saved.set(key, value); },
      async set(key, value) { saved.set(key, typeof value === 'string' ? JSON.parse(value) : value); }
    };
    const result = await executeClareWork(
      'compose_schedule',
      { date: '2026-09-08', task_ids: ['task_a'] },
      {
        now: new Date('2026-09-08T08:00:00Z'),
        tasks: [{ id: 'task_a', title: 'Write report', status: 'open', estimated_duration: 90, depth: 'shallow' }],
        projects: [],
        lessons: [],
        workBlocks: [],
        planning_profile: {
          work_windows: { mon: [], tue: [{ start: '09:00', end: '12:00' }], wed: [], thu: [], fri: [], sat: [], sun: [] },
          protected_windows: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
        },
        tasksStore
      }
    );
    assert.equal(result.kind, 'propose');
    const paths = result.proposal.writes.map((w) => w.path);
    assert.ok(result.proposed.length >= 1);
    for (const block of result.proposed) {
      assert.ok(paths.includes(block.id), `block.id ${block.id} missing from writes`);
      assert.equal(block.write_path, block.id);
    }
    const { selectAcceptedWrites } = await import(
      '../../netlify/functions/_shared/capabilities/propose-action.mjs'
    );
    const selectedPath = paths[0];
    const accepted = selectAcceptedWrites(result.proposal.writes, [selectedPath]);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.accepted.length, 1);
    assert.equal(accepted.accepted[0].path, selectedPath);
    assert.equal(accepted.rejected.length, paths.length - 1);
  });

  it('M: discard accept=[] keeps writes rejected / nothing to apply', async () => {
    const { selectAcceptedWrites } = await import(
      '../../netlify/functions/_shared/capabilities/propose-action.mjs'
    );
    const writes = [
      { path: 'tasks:work_block:a', mode: 'create', content: '{}', diff: 'a' },
      { path: 'tasks:work_block:b', mode: 'create', content: '{}', diff: 'b' }
    ];
    const discarded = selectAcceptedWrites(writes, []);
    assert.equal(discarded.ok, true);
    assert.equal(discarded.accepted.length, 0);
    assert.equal(discarded.rejected.length, 2);
  });
});
