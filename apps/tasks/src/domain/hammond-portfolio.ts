import type { Project } from '@/schemas/project';
import type { PlanningProfile } from '@/schemas/planning-profile';

export type PortfolioDecision =
  | 'accept'
  | 'replace'
  | 'defer'
  | 'decline'
  | 'need_more_info';

export type ActiveProjectMeter = {
  active_count: number;
  limit: number | null;
  slots_left: number | null;
  over_by: number | null;
  status: 'unset' | 'ok' | 'full' | 'over';
  message: string;
  active_project_ids: string[];
};

export function listActiveProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.status === 'active' || p.status === 'revived');
}

export function activeProjectMeter(
  projects: Project[],
  profile: Pick<PlanningProfile, 'active_project_limit'> | null
): ActiveProjectMeter {
  const active = listActiveProjects(projects);
  const limit = profile?.active_project_limit ?? null;
  if (limit == null) {
    return {
      active_count: active.length,
      limit: null,
      slots_left: null,
      over_by: null,
      status: 'unset',
      message: `${active.length} active. Limit not set.`,
      active_project_ids: active.map((p) => p.id)
    };
  }
  const over = active.length - limit;
  if (over > 0) {
    return {
      active_count: active.length,
      limit,
      slots_left: 0,
      over_by: over,
      status: 'over',
      message: `${active.length} active of limit ${limit}. Choose ${over} to pause.`,
      active_project_ids: active.map((p) => p.id)
    };
  }
  if (over === 0) {
    return {
      active_count: active.length,
      limit,
      slots_left: 0,
      over_by: 0,
      status: 'full',
      message: `${active.length} active of limit ${limit}. No slots left.`,
      active_project_ids: active.map((p) => p.id)
    };
  }
  return {
    active_count: active.length,
    limit,
    slots_left: -over,
    over_by: 0,
    status: 'ok',
    message: `${active.length} active of limit ${limit}. ${-over} slot${-over === 1 ? '' : 's'} left.`,
    active_project_ids: active.map((p) => p.id)
  };
}

export function assessNewCommitment(input: {
  projects: Project[];
  profile: Pick<PlanningProfile, 'active_project_limit'> | null;
  candidate: { title: string; substantial: boolean; info_complete: boolean };
}): {
  decision: PortfolioDecision;
  meter: ActiveProjectMeter;
  pause_candidates: Array<{ id: string; title: string }>;
  reason: string;
} {
  const meter = activeProjectMeter(input.projects, input.profile);
  if (!input.candidate.info_complete) {
    return {
      decision: 'need_more_info',
      meter,
      pause_candidates: [],
      reason: 'Need more information before commitment.'
    };
  }
  if (!input.candidate.substantial) {
    return {
      decision: 'accept',
      meter,
      pause_candidates: [],
      reason: 'Not a substantial portfolio item — Clare may organise.'
    };
  }
  if (meter.status === 'unset') {
    return {
      decision: 'accept',
      meter,
      pause_candidates: [],
      reason: 'No active project limit configured. Accepting; offer to set a limit.'
    };
  }
  if (meter.status === 'ok') {
    return {
      decision: 'accept',
      meter,
      pause_candidates: [],
      reason: 'Capacity available under the active project limit.'
    };
  }
  const pause_candidates = listActiveProjects(input.projects)
    .slice(0, 5)
    .map((p) => ({ id: p.id, title: p.title }));
  return {
    decision: 'replace',
    meter,
    pause_candidates,
    reason: 'Portfolio full. Replace an active commitment, defer, or decline.'
  };
}

export type ProductivityFunnel = {
  selected: Array<{ id: string; title: string }>;
  organised: Array<{ id: string; title: string }>;
  scheduled: Array<{ id: string; title: string }>;
  overload_at: 'selected' | 'organised' | 'scheduled' | null;
};

export function buildProductivityFunnel(input: {
  selected: Array<{ id: string; title: string }>;
  organised: Array<{ id: string; title: string }>;
  scheduled: Array<{ id: string; title: string }>;
  meter: ActiveProjectMeter;
}): ProductivityFunnel {
  let overload_at: ProductivityFunnel['overload_at'] = null;
  if (input.meter.status === 'over' || input.meter.status === 'full') {
    overload_at = 'selected';
  } else if (input.organised.length > input.selected.length + 2) {
    overload_at = 'organised';
  } else if (input.scheduled.length < input.organised.length) {
    overload_at = 'scheduled';
  }
  return {
    selected: input.selected,
    organised: input.organised,
    scheduled: input.scheduled,
    overload_at
  };
}
