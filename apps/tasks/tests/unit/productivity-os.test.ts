import { describe, expect, it } from 'vitest';
import { clarifyDump, reclassifyItem } from '@/domain/clarify';
import { inspectProjectHealth } from '@/domain/project-health';
import { listWaitingItems, waitingPatch, deriveWaitingStatus } from '@/domain/waiting';
import {
  assertNoSilentDeadlineMutation,
  isHardOverdue,
  isReviewDue,
  relevantDateIndicators
} from '@/domain/date-truth';
import { matchActionsNow } from '@/domain/context-match';
import {
  composeDaySchedule,
  validateProposedBlocks
} from '@/domain/schedule-compose';
import { computeDeadlineRunway } from '@/domain/deadline-runway';
import {
  createFocusBlock,
  startFocusBlock,
  finishFocusBlock
} from '@/domain/focus-block';
import { buildShutdown, closeShutdown } from '@/domain/shutdown';
import {
  createWeeklyReview,
  runWeeklyReviewStage
} from '@/domain/weekly-review';
import { createProjectPlan, updateProjectPlanStage } from '@/domain/project-plan';
import { activeProjectMeter, assessNewCommitment } from '@/domain/hammond-portfolio';
import { buildHorizonsChain } from '@/domain/hammond-horizons';
import { dayCapacity, protectedSpansForDate } from '@/domain/hammond-capacity';
import {
  threefoldWorkAudit,
  inferWorkMode,
  naturalPaceAudit,
  attentionAudit
} from '@/domain/hammond-audit';
import { allocateDepthBudget, goalDependencyLens } from '@/domain/hammond-depth';
import {
  createWeekMissionHandoff,
  createClareScheduleReturn,
  reconcileClareReturn,
  buildStrategicReview
} from '@/domain/hammond-handoff';
import { TaskSchema } from '@/schemas/task';
import { ProjectSchema } from '@/schemas/project';
import { WorkBlockSchema } from '@/schemas/work-block';
import { WorkSessionSchema } from '@/schemas/work-session';
import { DEFAULT_PLANNING_PROFILE } from '@/schemas/planning-profile';
import { DEFAULT_PLANNING_DIRECTION } from '@/schemas/planning-direction';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return TaskSchema.parse({
    schema_version: 1,
    domain: 'life',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    status: 'open',
    ...partial
  });
}

function project(partial: Partial<Project> & { id: string; title: string }): Project {
  return ProjectSchema.parse({
    schema_version: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    status: 'active',
    ...partial
  });
}

describe('clarify', () => {
  it('classifies a multi-item dump with mixed outcomes', () => {
    const stack = clarifyDump(
      [
        'Email the parent about homework',
        'Waiting on supplier quote from Acme',
        'Someday learn pottery',
        'Meeting with principal on 2026-09-12',
        'Trash this random note',
        'Plan the open day project and set up stalls and invite speakers'
      ].join('\n')
    );
    expect(stack.items.length).toBe(6);
    expect(stack.items.map((i) => i.destination)).toEqual([
      'next_action',
      'waiting',
      'someday',
      'calendar',
      'trash',
      'project'
    ]);
    expect(stack.items[1]!.waiting_on).toMatch(/Acme/i);
    expect(stack.items[5]!.project_next_action).toBeTruthy();
  });

  it('allows reclassification without rerunning the dump', () => {
    const stack = clarifyDump('Buy milk');
    const next = reclassifyItem(stack, stack.items[0]!.id, 'someday');
    expect(next.items[0]!.destination).toBe('someday');
  });
});

describe('project health', () => {
  it('flags missing next action', () => {
    const p = project({ id: 'p1', title: 'Open day' });
    const result = inspectProjectHealth(p, [
      task({ id: 't1', title: 'Done step', parent_project_id: 'p1', status: 'done' })
    ]);
    expect(result.health).toBe('missing_next_action');
  });

  it('flags waiting_only and blocked', () => {
    const p = project({ id: 'p1', title: 'Open day' });
    const waiting = inspectProjectHealth(p, [
      task({
        id: 't1',
        title: 'Wait',
        parent_project_id: 'p1',
        waiting_on: 'Bob',
        waiting_status: 'waiting'
      })
    ]);
    expect(waiting.health).toBe('waiting_only');

    const blocked = inspectProjectHealth(p, [
      task({ id: 'dep', title: 'Dep', parent_project_id: 'p1', status: 'open' }),
      task({
        id: 't2',
        title: 'Blocked',
        parent_project_id: 'p1',
        depends_on: ['dep'],
        blocked_since: '2026-09-01T00:00:00.000Z'
      })
    ]);
    // dep is executable → healthy
    expect(blocked.health).toBe('healthy');

    const onlyBlocked = inspectProjectHealth(p, [
      task({
        id: 't3',
        title: 'Only blocked',
        parent_project_id: 'p1',
        depends_on: ['missing'],
        blocked_since: '2026-09-01T00:00:00.000Z'
      })
    ]);
    expect(onlyBlocked.health).toBe('blocked');
  });
});

describe('waiting', () => {
  it('computes age and follow-up needs', () => {
    const items = listWaitingItems(
      [
        task({
          id: 'w1',
          title: 'Quote',
          waiting_on: 'Acme',
          waiting_since: '2026-09-01T00:00:00.000Z',
          follow_up_at: '2026-09-08',
          waiting_status: 'waiting'
        })
      ],
      '2026-09-08'
    );
    expect(items[0]!.needs_action).toBe(true);
    expect(items[0]!.age_days).toBe(7);
    expect(deriveWaitingStatus(items[0] as never, '2026-09-08')).toBe('follow_up_due');
  });

  it('builds waiting patches', () => {
    expect(waitingPatch('resolved', {})).toMatchObject({
      waiting_status: 'resolved',
      waiting_on: null
    });
    expect(waitingPatch('return_to_active', {})).toMatchObject({
      waiting_status: null,
      waiting_on: null
    });
  });
});

describe('date truth', () => {
  it('keeps deadline, target, and review distinct', () => {
    const t = {
      due_date: '2026-09-01',
      target_date: '2026-09-10',
      review_at: '2026-09-08'
    };
    expect(isHardOverdue(t, '2026-09-08')).toBe(true);
    expect(isReviewDue(t, '2026-09-08')).toBe(true);
    const chips = relevantDateIndicators(t, '2026-09-08');
    expect(chips.some((c) => c.kind === 'deadline' && c.strong)).toBe(true);
    expect(chips.some((c) => c.kind === 'target' && !c.strong)).toBe(true);
  });

  it('rejects silent deadline mutation from plan_work', () => {
    const result = assertNoSilentDeadlineMutation({
      intent: 'plan_work',
      before: { due_date: '2026-09-12', due_time: '15:00' },
      after: { due_date: '2026-09-13', due_time: '15:00' }
    });
    expect(result.ok).toBe(false);
  });
});

describe('context match', () => {
  it('matches low energy without inventing energy when absent', () => {
    const tasks = [
      task({
        id: 'deep',
        title: 'Rewrite unit',
        depth: 'deep',
        estimated_duration: 90,
        cognitive_load: 'high'
      }),
      task({
        id: 'shallow',
        title: 'File notes',
        depth: 'admin',
        estimated_duration: 15,
        cognitive_load: 'low'
      })
    ];
    const low = matchActionsNow(tasks, {
      available_minutes: 25,
      energy_level: 'low'
    });
    expect(low.energy_applied).toBe(true);
    expect(low.matches[0]!.task_id).toBe('shallow');

    const none = matchActionsNow(tasks, { available_minutes: 25 });
    expect(none.energy_applied).toBe(false);
    expect(none.matches.length).toBeGreaterThan(0);
  });
});

describe('schedule compose', () => {
  it('schedules around teaching and protected time', () => {
    const result = composeDaySchedule({
      date: '2026-09-08',
      workday: { start: '08:00', end: '16:30', source: 'profile' },
      lessons: [{ start: 11 * 60, end: 12 * 60, title: 'Year 10', kind: 'lesson' }],
      protected_windows: [{ start: 15 * 60, end: 16 * 60 + 30, title: 'Pickup', kind: 'protected' }],
      tasks: [
        { id: 't1', title: 'Mark', estimated_duration: 45, depth: 'shallow' },
        { id: 't2', title: 'Deep plan', estimated_duration: 90, depth: 'deep' }
      ]
    });
    expect(result.proposed.length).toBeGreaterThan(0);
    for (const block of result.proposed) {
      const start = Number(block.start_time.slice(0, 2)) * 60 + Number(block.start_time.slice(3));
      const end = start + block.duration_minutes;
      expect(start >= 11 * 60 && start < 12 * 60).toBe(false);
      expect(end > 11 * 60 && end <= 12 * 60).toBe(false);
      expect(start >= 15 * 60).toBe(false);
    }
  });

  it('splits one task across multiple blocks with the same task_id', () => {
    const result = composeDaySchedule({
      date: '2026-09-08',
      workday: { start: '08:00', end: '12:00', source: 'profile' },
      // 90m deep work cannot fit contiguous between two 60m hard busy slots → split
      lessons: [
        { start: 9 * 60, end: 10 * 60, title: 'Period 1', kind: 'lesson' },
        { start: 10 * 60 + 45, end: 11 * 60 + 45, title: 'Period 2', kind: 'lesson' }
      ],
      tasks: [{ id: 't1', title: 'Essay', estimated_duration: 90, depth: 'shallow' }],
      planning_profile: { deep_work_preference: { min_block_minutes: 90 } }
    });
    expect(result.proposed.length).toBeGreaterThanOrEqual(2);
    expect(result.proposed.every((b) => b.task_id === 't1')).toBe(true);
    expect(result.proposed.reduce((s, b) => s + b.duration_minutes, 0)).toBe(90);
  });

  it('returns partial and impossible states', () => {
    const partial = composeDaySchedule({
      date: '2026-09-08',
      workday: { start: '08:00', end: '09:00', source: 'profile' },
      tasks: [
        { id: 't1', title: 'A', estimated_duration: 45 },
        { id: 't2', title: 'B', estimated_duration: 45 }
      ]
    });
    expect(partial.status).toBe('partially_scheduled');

    const impossible = composeDaySchedule({
      date: '2026-09-08',
      workday: { start: '08:00', end: '08:30', source: 'profile' },
      tasks: [{ id: 't1', title: 'A', estimated_duration: 90 }]
    });
    expect(impossible.status).toBe('impossible');
  });

  it('blocks stale proposals that collide before confirm', () => {
    const check = validateProposedBlocks(
      [
        {
          temp_id: 'g1',
          task_id: 't1',
          title: 'Mark',
          date: '2026-09-08',
          start_time: '11:00',
          duration_minutes: 45,
          depth: 'shallow',
          selected: true
        }
      ],
      [{ start: 11 * 60, end: 12 * 60, title: 'Lesson', kind: 'lesson' }]
    );
    expect(check.ok).toBe(false);
    expect(check.conflicts[0]!.reason).toMatch(/Collides/);
  });
});

describe('deadline runway', () => {
  it('plans backward without moving the deadline', () => {
    const runway = computeDeadlineRunway({
      deadline: '2026-09-12',
      remaining_minutes: 180,
      today: '2026-09-08',
      available_minutes_until_deadline: 400,
      dependencies: [{ id: 'd1', title: 'Outline', satisfied: false }]
    });
    expect(runway.segments.some((s) => s.kind === 'deadline' && s.date === '2026-09-12')).toBe(
      true
    );
    expect(runway.buffer_source).toBe('fallback');
    expect(runway.unsatisfied_dependencies.length).toBe(1);
  });

  it('marks impossible when capacity is insufficient', () => {
    const runway = computeDeadlineRunway({
      deadline: '2026-09-09',
      remaining_minutes: 400,
      today: '2026-09-08',
      available_minutes_until_deadline: 60
    });
    expect(runway.risk).toBe('impossible');
  });
});

describe('focus and shutdown', () => {
  it('logs a focus session', () => {
    let state = createFocusBlock({
      outcome: 'Draft intro',
      planned_duration_minutes: 50,
      finish_condition: 'Intro drafted',
      depth: 'deep',
      task_id: 't1'
    });
    const started = startFocusBlock(state, '2026-09-08T01:00:00.000Z');
    expect(started.sessionCreate.source).toBe('focus_block');
    const finished = finishFocusBlock(
      started.state,
      'done',
      '2026-09-08T01:40:00.000Z'
    );
    expect(finished.sessionPatch.actual_duration_minutes).toBe(40);
    expect(finished.sessionPatch.result).toBe('done');
  });

  it('builds shutdown carry decisions', () => {
    const state = buildShutdown({
      today_key: '2026-09-08',
      tomorrow_key: '2026-09-09',
      tasks: [task({ id: 't1', title: 'Mark pack', due_date: '2026-09-08' })],
      loose_texts: ['Call dentist']
    });
    expect(state.items.some((i) => i.kind === 'unresolved_today')).toBe(true);
    expect(closeShutdown(state).status).toBe('closed');
  });
});

describe('weekly review and project plan', () => {
  it('advances weekly review stages resumably', () => {
    let state = createWeeklyReview('wr_test');
    state = runWeeklyReviewStage(state, { dump_text: 'Email Bob\nSomeday pottery' });
    expect(state.completed).toContain('capture');
    expect(state.current_stage).toBe('past_calendar');
    state = runWeeklyReviewStage(state, { past_notes: ['Missed call'] });
    expect(state.current_stage).toBe('upcoming_calendar');
  });

  it('runs natural project plan stages', () => {
    let plan = createProjectPlan({ project_title: 'Open day' });
    plan = updateProjectPlanStage(plan, { purpose: 'Welcome families' }, true);
    expect(plan.current_stage).toBe('desired_outcome');
    plan = updateProjectPlanStage(plan, { desired_outcome: 'Smooth event' }, true);
    expect(plan.current_stage).toBe('brainstorm');
  });
});

describe('hammond portfolio and horizons', () => {
  it('meters active projects with and without a limit', () => {
    const projects = [
      project({ id: 'p1', title: 'A' }),
      project({ id: 'p2', title: 'B' }),
      project({ id: 'p3', title: 'C', status: 'paused' })
    ];
    expect(activeProjectMeter(projects, null).status).toBe('unset');
    expect(activeProjectMeter(projects, { active_project_limit: 1 }).status).toBe('over');
    expect(activeProjectMeter(projects, { active_project_limit: 6 }).status).toBe('ok');
  });

  it('assesses new commitment against the limit', () => {
    const projects = [project({ id: 'p1', title: 'A' }), project({ id: 'p2', title: 'B' })];
    const result = assessNewCommitment({
      projects,
      profile: { active_project_limit: 2 },
      candidate: { title: 'New', substantial: true, info_complete: true }
    });
    expect(result.decision).toBe('replace');
  });

  it('builds a horizons chain', () => {
    const chain = buildHorizonsChain({
      direction: {
        ...DEFAULT_PLANNING_DIRECTION,
        purpose: 'Teach well',
        vision: 'Calm classroom'
      },
      areas: [
        {
          schema_version: 1,
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
          schema_version: 1,
          id: 'g1',
          title: 'Term outcomes',
          description: '',
          parent_area_id: 'a1',
          status: 'active',
          tags: [],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z'
        }
      ],
      projects: [project({ id: 'p1', title: 'Unit rewrite', parent_goal_id: 'g1' })],
      tasks: [task({ id: 't1', title: 'Outline', parent_project_id: 'p1' })],
      focus: { type: 'project', id: 'p1' }
    });
    expect(chain.purpose).toBe('Teach well');
    expect(chain.area?.title).toBe('Teaching');
    expect(chain.next_actions[0]!.title).toBe('Outline');
  });
});

describe('hammond capacity pace depth handoff', () => {
  it('uses labelled fallback work windows', () => {
    const day = dayCapacity('2026-09-08', null);
    expect(day.work_source).toBe('fallback');
    expect(protectedSpansForDate('2026-09-08', {
      ...DEFAULT_PLANNING_PROFILE,
      protected_windows: {
        ...DEFAULT_PLANNING_PROFILE.protected_windows,
        tue: [{ start: '15:00', end: '16:30', label: 'Pickup' }]
      }
    }).length).toBe(1);
  });

  it('audits threefold work and sparse pace', () => {
    const sessions = [
      WorkSessionSchema.parse({
        schema_version: 1,
        id: 's1',
        started_at: '2026-09-08T01:00:00.000Z',
        actual_duration_minutes: 40,
        work_mode: 'reactive',
        work_mode_confidence: 'inferred',
        created_at: '2026-09-08T01:00:00.000Z',
        updated_at: '2026-09-08T01:00:00.000Z'
      }),
      WorkSessionSchema.parse({
        schema_version: 1,
        id: 's2',
        started_at: '2026-09-08T03:00:00.000Z',
        actual_duration_minutes: 60,
        work_mode: 'predefined',
        work_mode_confidence: 'explicit',
        created_at: '2026-09-08T03:00:00.000Z',
        updated_at: '2026-09-08T03:00:00.000Z'
      })
    ];
    const audit = threefoldWorkAudit(sessions, {
      start: '2026-09-07',
      end: '2026-09-09'
    });
    expect(audit.classified_sessions).toBe(2);
    expect(audit.sparse).toBe(true);
    expect(inferWorkMode({ title: 'Stuff' }).confidence).toBe('unknown');
    expect(inferWorkMode({ created_midday_interrupt: true }).work_mode).toBe('reactive');

    const pace = naturalPaceAudit({
      weeks: [{ start: '2026-08-01', end: '2026-08-07' }],
      blocks: [],
      sessions: [],
      tasks: []
    });
    expect(pace.sparse).toBe(true);

    const attention = attentionAudit({
      sessions: [],
      tasks: [],
      period: { start: '2026-09-01', end: '2026-09-08' }
    });
    expect(attention.insufficient).toBe(true);
  });

  it('allocates depth and reconciles insufficient capacity', () => {
    const budget = allocateDepthBudget({
      windows: [
        { date: '2026-09-09', start_time: '09:00', minutes: 90 },
        { date: '2026-09-10', start_time: '09:00', minutes: 90 }
      ],
      assignments: [{ slot_id: 'deep_1', project_id: 'p1', project_title: 'Unit' }]
    });
    expect(budget.allocations.length).toBe(1);
    expect(budget.unallocated).toBe(1);

    const lens = goalDependencyLens({
      focus: { id: 'p1', title: 'Unit', kind: 'project' },
      nodes: [
        { id: 'p0', title: 'Prep', kind: 'project' },
        { id: 'p1', title: 'Unit', kind: 'project' },
        { id: 'p2', title: 'Assess', kind: 'project' }
      ],
      links: [
        { from_id: 'p0', to_id: 'p1' },
        { from_id: 'p1', to_id: 'p2' }
      ]
    });
    expect(lens.upstream[0]!.id).toBe('p0');

    const handoff = createWeekMissionHandoff({
      week_window: { start: '2026-09-08', end: '2026-09-14' },
      selected_outcomes: [{ id: 'o1', title: 'Ship unit', project_ids: ['p2'] }],
      linked_projects: [
        { id: 'p1', title: 'Keep', quality_bar: 'high_quality', decision: 'keep' },
        { id: 'p2', title: 'Protect', quality_bar: 'exceptional', decision: 'protect' }
      ],
      hard_constraints: [],
      fixed_schedule: [],
      protected_windows: [],
      active_project_decisions: [],
      depth_allocation: [],
      quality_expectations: [],
      explicit_deferrals: [],
      evidence_pointers: []
    });
    const ret = createClareScheduleReturn({
      week_window: handoff.week_window,
      planned_work_blocks: [],
      unscheduled_work: [{ id: 'p2', title: 'Ship unit', reason: 'No capacity' }],
      collisions: [],
      deadline_risk: [],
      dependency_risk: [],
      fallback_assumptions: ['workday fallback 08:00–16:30'],
      confidence: 'medium',
      insufficient_capacity: true
    });
    const recon = reconcileClareReturn(handoff, ret);
    expect(recon.status).toBe('needs_cuts');

    const strategic = buildStrategicReview({
      moved: ['Unit outline'],
      consumed: ['Unit rewrite'],
      stalled: [],
      threefold_summary: '60% predefined',
      deep_planned: '2 blocks',
      deep_done: '1 block',
      capacity_diff: 'planned 300 / actual 240',
      threats: [],
      portfolio_fit: '2 of 3',
      exclude: ['Side quest'],
      protect_outcomes: [{ id: 'o1', title: 'Ship unit' }],
      pause_projects: [{ id: 'p9', title: 'Nice to have' }],
      keep_projects: [{ id: 'p1', title: 'Keep' }]
    });
    expect(strategic.protect[0]!.selected).toBe(true);
  });
});

describe('schemas persist optional productivity fields', () => {
  it('parses work blocks and sessions', () => {
    const block = WorkBlockSchema.parse({
      schema_version: 1,
      id: 'wblock_1',
      title: 'Mark essays',
      date: '2026-09-08',
      start_time: '09:00',
      duration_minutes: 60,
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z'
    });
    expect(block.depth).toBe('shallow');
    expect(block.task_id).toBeNull();
  });
});
