/**
 * Typed Hammond → Clare planning handoff and Clare return.
 * Hammond selects/constrains; Clare organises/executes.
 */

export type WeekMissionHandoff = {
  type: 'hammond_week_mission';
  week_window: { start: string; end: string };
  selected_outcomes: Array<{ id: string; title: string; project_ids: string[] }>;
  linked_projects: Array<{
    id: string;
    title: string;
    quality_bar: string | null;
    decision: 'keep' | 'pause' | 'protect';
  }>;
  hard_constraints: string[];
  fixed_schedule: Array<{ weekday: string; start: string; end: string }>;
  protected_windows: Array<{ date?: string; weekday?: string; start: string; end: string; label?: string }>;
  active_project_decisions: Array<{ project_id: string; decision: 'keep' | 'pause' }>;
  depth_allocation: Array<{ slot_id: string; project_id: string; date: string; start_time: string }>;
  quality_expectations: Array<{ project_id: string; quality_bar: string }>;
  explicit_deferrals: Array<{ id: string; title: string; reason: string }>;
  evidence_pointers: string[];
};

export type ClareScheduleReturn = {
  type: 'clare_schedule_return';
  week_window: { start: string; end: string };
  planned_work_blocks: Array<{
    temp_id: string;
    task_id: string | null;
    project_id: string | null;
    title: string;
    date: string;
    start_time: string;
    duration_minutes: number;
    depth: string;
  }>;
  unscheduled_work: Array<{ id: string; title: string; reason: string }>;
  collisions: string[];
  deadline_risk: Array<{ task_id: string; risk: string }>;
  dependency_risk: Array<{ id: string; risk: string }>;
  fallback_assumptions: string[];
  confidence: 'high' | 'medium' | 'low';
  insufficient_capacity: boolean;
};

export type HammondReconciliation = {
  status: 'accepted' | 'needs_cuts' | 'blocked';
  remove_outcomes: Array<{ id: string; title: string }>;
  note: string;
};

export function createWeekMissionHandoff(
  partial: Omit<WeekMissionHandoff, 'type'>
): WeekMissionHandoff {
  return { type: 'hammond_week_mission', ...partial };
}

export function createClareScheduleReturn(
  partial: Omit<ClareScheduleReturn, 'type'>
): ClareScheduleReturn {
  return { type: 'clare_schedule_return', ...partial };
}

/**
 * If Clare reports insufficient capacity, Hammond decides what leaves.
 * Clare must not quietly override Hammond constraints.
 */
export function reconcileClareReturn(
  handoff: WeekMissionHandoff,
  ret: ClareScheduleReturn
): HammondReconciliation {
  if (!ret.insufficient_capacity && !ret.unscheduled_work.length) {
    return {
      status: 'accepted',
      remove_outcomes: [],
      note: 'Clare schedule fits Hammond constraints.'
    };
  }
  const removable = handoff.selected_outcomes
    .filter((o) =>
      ret.unscheduled_work.some((u) =>
        o.project_ids.some((pid) => u.id.includes(pid) || u.title.includes(o.title))
      )
    )
    .map((o) => ({ id: o.id, title: o.title }));

  const cuts =
    removable.length > 0
      ? removable
      : handoff.linked_projects
          .filter((p) => p.decision !== 'protect')
          .slice(0, 1)
          .map((p) => ({ id: p.id, title: p.title }));

  if (!cuts.length) {
    return {
      status: 'blocked',
      remove_outcomes: [],
      note: 'Insufficient capacity and no non-protected outcome to remove.'
    };
  }
  return {
    status: 'needs_cuts',
    remove_outcomes: cuts,
    note: 'Clare reported insufficient capacity. Hammond must decide what leaves.'
  };
}

export type StrategicReview = {
  keep: Array<{ id: string; title: string }>;
  pause: Array<{ id: string; title: string; selected: boolean }>;
  protect: Array<{ id: string; title: string; selected: boolean }>;
  answers: Record<string, string>;
};

export function buildStrategicReview(input: {
  moved: string[];
  consumed: string[];
  stalled: string[];
  threefold_summary: string;
  deep_planned: string;
  deep_done: string;
  capacity_diff: string;
  threats: string[];
  portfolio_fit: string;
  exclude: string[];
  protect_outcomes: Array<{ id: string; title: string }>;
  pause_projects: Array<{ id: string; title: string }>;
  keep_projects: Array<{ id: string; title: string }>;
}): StrategicReview {
  return {
    keep: input.keep_projects,
    pause: input.pause_projects.map((p) => ({ ...p, selected: false })),
    protect: input.protect_outcomes.slice(0, 3).map((p) => ({ ...p, selected: true })),
    answers: {
      moved: input.moved.join('; ') || 'None recorded',
      consumed: input.consumed.join('; ') || 'None recorded',
      stalled: input.stalled.join('; ') || 'None recorded',
      threefold: input.threefold_summary,
      deep_planned: input.deep_planned,
      deep_done: input.deep_done,
      capacity_diff: input.capacity_diff,
      threats: input.threats.join('; ') || 'None',
      portfolio_fit: input.portfolio_fit,
      exclude: input.exclude.join('; ') || 'None'
    }
  };
}
