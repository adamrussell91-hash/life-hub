/**
 * Hammond Productivity OS tools — strategic selection / constraints.
 * Uses productivity-os.mjs processors. Clare organises; Hammond decides.
 */
import {
  activeProjectMeter,
  assessNewCommitment,
  buildProductivityFunnel,
  listActiveProjects,
  buildHorizonsChain,
  dayCapacity,
  protectedSpansForDate,
  buildMultiscalePlan,
  threefoldWorkAudit,
  inferWorkMode,
  naturalPaceAudit,
  attentionAudit,
  allocateDepthBudget,
  goalDependencyLens,
  createWeekMissionHandoff,
  createClareScheduleReturn,
  reconcileClareReturn,
  buildStrategicReview
} from './productivity-os.mjs';
import { setJSON } from './tasks-blobs.mjs';

/** Prefer store/ctx arrays over model-supplied source-of-truth payloads. */
function preferCtxArray(ctxVal, inputVal) {
  if (Array.isArray(ctxVal)) return ctxVal;
  if (Array.isArray(inputVal)) return inputVal;
  return [];
}

function tool(name, description, properties, required = []) {
  return {
    name,
    description,
    input_schema: {
      type: 'object',
      properties,
      ...(required.length ? { required } : {})
    }
  };
}

export function hammondProductivitySchemas() {
  return [
    tool('horizons_chain', 'Walk purpose → principles → vision → area → goal → project → next actions for a focus.', {
      purpose: { type: 'string' },
      principles: { type: 'array', items: { type: 'string' } },
      vision: { type: 'string' },
      areas: { type: 'array', items: { type: 'object' } },
      goals: { type: 'array', items: { type: 'object' } },
      focus_type: { type: 'string', enum: ['area', 'goal', 'project'] },
      focus_id: { type: 'string' }
    }),
    tool('portfolio_meter', 'Active project meter against the configured limit. Assess a new substantial commitment when candidate is supplied.', {
      active_project_limit: { type: 'number' },
      candidate_title: { type: 'string' },
      candidate_substantial: { type: 'boolean' },
      candidate_info_complete: { type: 'boolean' },
      selected: { type: 'array', items: { type: 'object' } },
      organised: { type: 'array', items: { type: 'object' } },
      scheduled: { type: 'array', items: { type: 'object' } }
    }),
    tool('capacity_day', 'Day capacity from planning profile work/protected windows. Labelled fallback 08:00–16:30 when unset.', {
      date: { type: 'string' },
      profile: { type: 'object' }
    }, ['date']),
    tool('multiscale_plan', 'Quarter / month / week outcomes (max three each). Hammond selects; Clare schedules.', {
      quarter: { type: 'array', items: { type: 'object' } },
      month: { type: 'array', items: { type: 'object' } },
      week: { type: 'array', items: { type: 'object' } }
    }),
    tool('pace_audit', 'Natural pace signals across weeks. Sparse when evidence is thin — never invent capacity.', {
      weeks: { type: 'array', items: { type: 'object' } },
      blocks: { type: 'array', items: { type: 'object' } },
      sessions: { type: 'array', items: { type: 'object' } },
      baseline_planned_minutes: { type: 'number' }
    }),
    tool('threefold_audit', 'Predefined / reactive / defining work session audit. Marks sparse coverage.', {
      period_start: { type: 'string' },
      period_end: { type: 'string' },
      sessions: { type: 'array', items: { type: 'object' } },
      infer: { type: 'object' }
    }),
    tool('attention_audit', 'Recurring attention patterns with evidence counts. Insufficient when thin.', {
      period_start: { type: 'string' },
      period_end: { type: 'string' },
      sessions: { type: 'array', items: { type: 'object' } }
    }),
    tool('depth_budget', 'Allocate deep-work windows to projects. Reports unallocated slots.', {
      windows: { type: 'array', items: { type: 'object' } },
      assignments: { type: 'array', items: { type: 'object' } },
      focus: { type: 'object' },
      links: { type: 'array', items: { type: 'object' } },
      nodes: { type: 'array', items: { type: 'object' } }
    }),
    tool('strategic_review', 'Build keep / pause / protect strategic review answers from evidence strings.', {
      moved: { type: 'array', items: { type: 'string' } },
      consumed: { type: 'array', items: { type: 'string' } },
      stalled: { type: 'array', items: { type: 'string' } },
      threefold_summary: { type: 'string' },
      deep_planned: { type: 'string' },
      deep_done: { type: 'string' },
      capacity_diff: { type: 'string' },
      threats: { type: 'array', items: { type: 'string' } },
      portfolio_fit: { type: 'string' },
      exclude: { type: 'array', items: { type: 'string' } },
      protect_outcomes: { type: 'array', items: { type: 'object' } },
      pause_projects: { type: 'array', items: { type: 'object' } },
      keep_projects: { type: 'array', items: { type: 'object' } }
    }),
    tool('week_mission_handoff', 'Build a typed Hammond→Clare week mission handoff (select/constrain; do not schedule).', {
      week_start: { type: 'string' },
      week_end: { type: 'string' },
      selected_outcomes: { type: 'array', items: { type: 'object' } },
      linked_projects: { type: 'array', items: { type: 'object' } },
      hard_constraints: { type: 'array', items: { type: 'string' } },
      fixed_schedule: { type: 'array', items: { type: 'object' } },
      protected_windows: { type: 'array', items: { type: 'object' } },
      active_project_decisions: { type: 'array', items: { type: 'object' } },
      depth_allocation: { type: 'array', items: { type: 'object' } },
      quality_expectations: { type: 'array', items: { type: 'object' } },
      explicit_deferrals: { type: 'array', items: { type: 'object' } },
      evidence_pointers: { type: 'array', items: { type: 'string' } }
    }),
    tool('reconcile_clare_schedule', 'Reconcile Clare schedule return against Hammond handoff. If capacity fails, Hammond decides cuts — Clare must not override.', {
      handoff: { type: 'object' },
      clare_return: { type: 'object' }
    }, ['handoff', 'clare_return'])
  ];
}

const NAMES = new Set(hammondProductivitySchemas().map((s) => s.name));

export function isHammondProductivityTool(name) {
  return NAMES.has(name);
}

function ok(data) {
  return { ok: true, ...data };
}

function deny(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function executeHammondProductivity(name, input = {}, ctx = {}) {
  const projects = ctx.projects ?? [];
  const tasks = ctx.tasks ?? [];
  const areas = preferCtxArray(ctx.areas, input.areas);
  const goals = preferCtxArray(ctx.goals, input.goals);
  const sessions = preferCtxArray(
    ctx.sessions ?? ctx.workSessions ?? ctx.work_sessions,
    input.sessions
  );
  const blocks = preferCtxArray(
    ctx.blocks ?? ctx.workBlocks ?? ctx.work_blocks,
    input.blocks
  );
  // Profile/direction: ctx store wins when present (model may still pass filters).
  const profile =
    ctx.planning_profile != null ? ctx.planning_profile : (input.profile ?? null);
  const storedDirection = ctx.planning_direction ?? null;

  if (name === 'horizons_chain') {
    const direction = {
      purpose: storedDirection?.purpose || input.purpose || '',
      principles: Array.isArray(storedDirection?.principles) && storedDirection.principles.length
        ? storedDirection.principles
        : (input.principles ?? []),
      vision: storedDirection?.vision || input.vision || '',
      ...(storedDirection?.id ? { id: storedDirection.id } : {})
    };
    const focus = input.focus_type && input.focus_id
      ? { type: input.focus_type, id: input.focus_id }
      : null;
    return ok(buildHorizonsChain({
      direction,
      areas,
      goals,
      projects,
      tasks,
      focus
    }));
  }

  if (name === 'portfolio_meter') {
    const limitProfile = {
      active_project_limit:
        profile?.active_project_limit ?? input.active_project_limit ?? null
    };
    const meter = activeProjectMeter(projects, limitProfile);
    const out = {
      meter,
      active_projects: listActiveProjects(projects).map((p) => ({ id: p.id, title: p.title }))
    };
    if (input.candidate_title != null || input.candidate_substantial != null) {
      out.assessment = assessNewCommitment({
        projects,
        profile: limitProfile,
        candidate: {
          title: String(input.candidate_title ?? ''),
          substantial: Boolean(input.candidate_substantial),
          info_complete: input.candidate_info_complete !== false
        }
      });
    }
    if (input.selected || input.organised || input.scheduled) {
      out.funnel = buildProductivityFunnel({
        selected: input.selected ?? [],
        organised: input.organised ?? [],
        scheduled: input.scheduled ?? [],
        meter
      });
    }
    return ok(out);
  }

  if (name === 'capacity_day') {
    const date = String(input.date ?? '').trim();
    if (!date) return deny('missing_date');
    const cap = dayCapacity(date, profile);
    return ok({
      ...cap,
      protected_spans: protectedSpansForDate(date, profile)
    });
  }

  if (name === 'multiscale_plan') {
    return ok(buildMultiscalePlan({
      quarter: input.quarter,
      month: input.month,
      week: input.week
    }));
  }

  if (name === 'pace_audit') {
    return ok(naturalPaceAudit({
      weeks: Array.isArray(input.weeks) ? input.weeks : [],
      blocks,
      sessions,
      tasks,
      baseline_planned_minutes: input.baseline_planned_minutes
    }));
  }

  if (name === 'threefold_audit') {
    const period = {
      start: input.period_start || new Date().toISOString().slice(0, 10),
      end: input.period_end || new Date().toISOString().slice(0, 10)
    };
    const audit = threefoldWorkAudit(sessions, period);
    const inferred = input.infer ? inferWorkMode(input.infer) : null;
    return ok({ ...audit, inferred });
  }

  if (name === 'attention_audit') {
    return ok(attentionAudit({
      sessions,
      tasks,
      period: {
        start: input.period_start || new Date().toISOString().slice(0, 10),
        end: input.period_end || new Date().toISOString().slice(0, 10)
      }
    }));
  }

  if (name === 'depth_budget') {
    const budget = allocateDepthBudget({
      windows: Array.isArray(input.windows) ? input.windows : [],
      assignments: Array.isArray(input.assignments) ? input.assignments : []
    });
    const out = { ...budget };
    if (input.focus && Array.isArray(input.nodes)) {
      out.dependency_lens = goalDependencyLens({
        focus: input.focus,
        links: input.links ?? [],
        nodes: input.nodes
      });
    }
    return ok(out);
  }

  if (name === 'strategic_review') {
    return ok(buildStrategicReview({
      moved: input.moved ?? [],
      consumed: input.consumed ?? [],
      stalled: input.stalled ?? [],
      threefold_summary: input.threefold_summary ?? '',
      deep_planned: input.deep_planned ?? '',
      deep_done: input.deep_done ?? '',
      capacity_diff: input.capacity_diff ?? '',
      threats: input.threats ?? [],
      portfolio_fit: input.portfolio_fit ?? '',
      exclude: input.exclude ?? [],
      protect_outcomes: input.protect_outcomes ?? [],
      pause_projects: input.pause_projects ?? [],
      keep_projects: input.keep_projects ?? []
    }));
  }

  if (name === 'week_mission_handoff') {
    // Chat passes executeClareWork / tasksStore and awaits the Promise.
    if (typeof ctx.executeClareWork === 'function' || ctx.tasksStore) {
      return runWeekMissionHandoff(input, {
        ...ctx,
        projects,
        tasks,
        blocks,
        profile
      });
    }
    const start = input.week_start;
    const end = input.week_end;
    if (!start || !end) return deny('missing_week_window');
    return ok(createWeekMissionHandoff({
      week_window: { start, end },
      selected_outcomes: input.selected_outcomes ?? [],
      linked_projects: input.linked_projects ?? [],
      hard_constraints: input.hard_constraints ?? [],
      fixed_schedule: input.fixed_schedule ?? [],
      protected_windows: input.protected_windows?.length
        ? input.protected_windows
        : protectedSpansForDate(start, profile),
      active_project_decisions: input.active_project_decisions ?? [],
      depth_allocation: input.depth_allocation ?? [],
      quality_expectations: input.quality_expectations ?? [],
      explicit_deferrals: input.explicit_deferrals ?? [],
      evidence_pointers: input.evidence_pointers ?? []
    }));
  }

  if (name === 'reconcile_clare_schedule') {
    const handoff = input.handoff;
    let ret = input.clare_return;
    if (!handoff || typeof handoff !== 'object') return deny('missing_handoff');
    if (!ret || typeof ret !== 'object') return deny('missing_clare_return');
    if (ret.type !== 'clare_schedule_return') {
      ret = createClareScheduleReturn(ret);
    }
    return ok(reconcileClareReturn(handoff, ret));
  }

  return deny('unknown_tool', { name });
}

async function runWeekMissionHandoff(input, ctx) {
  const start = input.week_start;
  const end = input.week_end;
  if (!start || !end) return deny('missing_week_window');
  const projects = ctx.projects ?? [];
  const tasks = ctx.tasks ?? [];
  const blocks = ctx.blocks ?? [];
  const profile = ctx.profile ?? null;
  const handoff = createWeekMissionHandoff({
    week_window: { start, end },
    selected_outcomes: input.selected_outcomes ?? [],
    linked_projects: input.linked_projects ?? [],
    hard_constraints: input.hard_constraints ?? [],
    fixed_schedule: input.fixed_schedule ?? [],
    protected_windows: input.protected_windows?.length
      ? input.protected_windows
      : protectedSpansForDate(start, profile),
    active_project_decisions: input.active_project_decisions ?? [],
    depth_allocation: input.depth_allocation ?? [],
    quality_expectations: input.quality_expectations ?? [],
    explicit_deferrals: input.explicit_deferrals ?? [],
    evidence_pointers: input.evidence_pointers ?? []
  });

  const missionId = String(input.mission_id || handoff.id || `wm_${start}`).trim();
  const workflowKey = `workflow_state/week_mission:${missionId}`;

  let clareResult = null;
  if (typeof ctx.executeClareWork === 'function') {
    const taskIds = [
      ...new Set(
        (handoff.selected_outcomes ?? []).flatMap((o) => (o.task_ids ?? []).map(String))
      )
    ];
    const projectIds = new Set(
      (handoff.linked_projects ?? [])
        .filter((p) => p.decision !== 'pause')
        .map((p) => String(p.id))
    );
    const missionTasks = taskIds.length
      ? tasks.filter((t) => taskIds.includes(String(t.id)))
      : tasks.filter(
          (t) =>
            t.parent_project_id &&
            projectIds.has(String(t.parent_project_id)) &&
            t.status !== 'done' &&
            t.status !== 'dead'
        );
    const confirmed = blocks
      .filter((b) => b.date === start && b.status === 'confirmed')
      .map((b) => {
        const m = String(b.start_time ?? '').match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const s = Number(m[1]) * 60 + Number(m[2]);
        return {
          start: s,
          end: s + (Number(b.duration_minutes) || 60),
          title: b.title,
          kind: 'locked'
        };
      })
      .filter(Boolean);
    clareResult = await ctx.executeClareWork(
      'compose_schedule',
      {
        date: start,
        task_ids: missionTasks.map((t) => t.id),
        protected_windows: handoff.protected_windows,
        confirmed_blocks: confirmed
      },
      {
        tasks: missionTasks.length ? missionTasks : tasks,
        projects,
        lessons: ctx.lessons ?? [],
        workBlocks: blocks,
        planning_profile: profile,
        now: ctx.now,
        tasksStore: ctx.tasksStore
      }
    );
  }

  const composed = clareResult && clareResult.ok !== false ? clareResult : null;
  const insufficient =
    composed?.insufficient_capacity === true ||
    composed?.status === 'impossible' ||
    composed?.status === 'partially_scheduled' ||
    (Array.isArray(composed?.unscheduled) && composed.unscheduled.length > 0);

  let reconcile = null;
  if (insufficient) {
    const clareReturn = createClareScheduleReturn({
      week_window: handoff.week_window,
      planned_work_blocks: composed?.proposed ?? [],
      unscheduled_work: (composed?.unscheduled ?? []).map((u) => ({
        id: u.task_id,
        title: u.title,
        reason: u.reason
      })),
      collisions: composed?.collisions ?? [],
      deadline_risk: [],
      dependency_risk: [],
      fallback_assumptions: composed?.workday?.source === 'fallback'
        ? ['workday fallback 08:00–16:30']
        : [],
      confidence: 'medium',
      insufficient_capacity: true
    });
    reconcile = reconcileClareReturn(handoff, clareReturn);
  }

  const trace = {
    id: missionId,
    type: 'week_mission',
    handoff,
    clare: composed,
    reconcile,
    updated_at: new Date().toISOString()
  };
  if (ctx.tasksStore) {
    await setJSON(ctx.tasksStore, workflowKey, trace);
    // Life Planning Mode reads a stable key for the active week mission strip.
    await setJSON(ctx.tasksStore, 'workflow_state/week_mission:current', trace);
  }

  if (reconcile && reconcile.status !== 'accepted') {
    return ok({
      handoff,
      clare_schedule: composed,
      reconcile,
      workflow_state_key: workflowKey,
      note: 'Insufficient capacity — Hammond must decide cuts. Clare must not override protected outcomes.'
    });
  }

  return ok({
    handoff,
    clare_schedule: composed,
    reconcile: reconcile ?? { status: 'accepted', remove_outcomes: [], note: 'Schedule fits.' },
    workflow_state_key: workflowKey
  });
}
