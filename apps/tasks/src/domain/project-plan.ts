export type ProjectPlanStage =
  | 'purpose'
  | 'desired_outcome'
  | 'brainstorm'
  | 'organise'
  | 'next_action';

export type ProjectPlanState = {
  id: string;
  project_id: string | null;
  project_title: string;
  current_stage: ProjectPlanStage;
  completed: ProjectPlanStage[];
  purpose: string;
  constraints: string;
  desired_outcome: string;
  brainstorm: string[];
  organised: Array<{ group: string; items: string[] }>;
  next_actions: string[];
  milestones: string[];
  updated_at: string;
};

const STAGES: ProjectPlanStage[] = [
  'purpose',
  'desired_outcome',
  'brainstorm',
  'organise',
  'next_action'
];

export function createProjectPlan(input: {
  project_title: string;
  project_id?: string | null;
  purpose?: string;
  desired_outcome?: string;
}): ProjectPlanState {
  return {
    id: `pp_${Date.now()}`,
    project_id: input.project_id ?? null,
    project_title: input.project_title,
    current_stage: 'purpose',
    completed: [],
    purpose: input.purpose ?? '',
    constraints: '',
    desired_outcome: input.desired_outcome ?? '',
    brainstorm: [],
    organised: [],
    next_actions: [],
    milestones: [],
    updated_at: new Date().toISOString()
  };
}

export function updateProjectPlanStage(
  state: ProjectPlanState,
  patch: Partial<
    Pick<
      ProjectPlanState,
      | 'purpose'
      | 'constraints'
      | 'desired_outcome'
      | 'brainstorm'
      | 'organised'
      | 'next_actions'
      | 'milestones'
    >
  >,
  advance = false
): ProjectPlanState {
  const next = { ...state, ...patch, updated_at: new Date().toISOString() };
  if (!advance) return next;
  const idx = STAGES.indexOf(state.current_stage);
  const stage = state.current_stage;
  const completed = [...new Set([...state.completed, stage])];
  const current_stage = STAGES[Math.min(idx + 1, STAGES.length - 1)]!;
  return { ...next, completed, current_stage };
}

/** Final confirm payload — project updates + first actions. */
export function projectPlanConfirmPayload(state: ProjectPlanState): {
  project_patch: {
    purpose: string;
    desired_outcome: string;
    milestones: Array<{ title: string }>;
  };
  next_actions: string[];
} {
  return {
    project_patch: {
      purpose: state.purpose,
      desired_outcome: state.desired_outcome,
      milestones: state.milestones.map((title) => ({ title }))
    },
    next_actions: state.next_actions.length
      ? state.next_actions
      : state.organised.flatMap((g) => g.items).slice(0, 3)
  };
}
