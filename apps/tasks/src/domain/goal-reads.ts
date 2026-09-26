import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export type GoalGhost = {
  id: string;
  agent: 'hammond';
  kind: 'create_task' | 'split_task' | 'goal_rest_weeks' | 'move_task' | 'protect_block';
  title?: string;
  reason?: string;
  due?: string;
  steps?: string[];
  weeks?: string[];
  rest_weeks?: string[];
  taskId?: string;
  goalId?: string;
  from?: string;
  to?: string;
  date?: string;
  start?: string;
  end?: string;
};

export type GoalRead = {
  goal_id: string;
  computed_on: string;
  basis_updated_at: string;
  temperature: 'warm' | 'cooling' | 'cold';
  days_since_movement: number;
  week: { count: number; per_week: number | null };
  crunch_weeks: string[];
  verdict: string;
  verdict_source?: 'model' | 'deterministic';
  looked_at: string[];
  ghosts: GoalGhost[];
};

export type GoalReadEnvelope = { read: GoalRead | null; reason: string };

export const REASON_LABEL: Record<string, string> = {
  first: 'first read',
  daily: 'daily read',
  changed: 'something changed',
  manual: 'you asked'
};

export type GhostCard = { kind: string; title: string; why: string; diff: { before: string | null; after: string[] } | null };

export function describeGhost(ghost: GoalGhost): GhostCard {
  const why = ghost.reason ?? '';
  switch (ghost.kind) {
    case 'create_task':
      return { kind: 'Task · new', title: `Add “${ghost.title}”`, why, diff: { before: null, after: [`Due ${formatDisplayDate(ghost.due ?? '')}`] } };
    case 'split_task':
      return {
        kind: 'Task · split into steps',
        title: `Split “${ghost.title}” into ${ghost.steps?.length ?? 0} steps`,
        why,
        diff: { before: null, after: (ghost.steps ?? []).map((step) => `+ ${step}`) }
      };
    case 'goal_rest_weeks':
      return {
        kind: 'Goal · lead measure',
        title: 'Mark crunch weeks as planned rest',
        why,
        diff: { before: 'Every week counts', after: [`Rest: ${(ghost.weeks ?? []).map((w) => formatDisplayDate(w)).join(', ')}`] }
      };
    case 'move_task':
      return {
        kind: 'Task · new date',
        title: `Move “${ghost.title}”`,
        why,
        diff: { before: `Due ${formatDisplayDate(ghost.from ?? '')}`, after: [`Due ${formatDisplayDate(ghost.to ?? '')}`] }
      };
    case 'protect_block':
      return {
        kind: 'Calendar · protect block',
        title: `Protect “${ghost.title}”`,
        why,
        diff: {
          before: null,
          after: [`${ghost.date ?? ''} ${ghost.start ?? ''}–${ghost.end ?? ''}`]
        }
      };
  }
}

const TEMP_RANK = { cold: 0, cooling: 1, warm: 2 } as const;

export function orderReadsForStrip(reads: GoalRead[]): GoalRead[] {
  return [...reads].sort(
    (a, b) => TEMP_RANK[a.temperature] - TEMP_RANK[b.temperature] || b.days_since_movement - a.days_since_movement
  );
}

export function overlayFromReads(reads: GoalRead[]): {
  crunchWeeks: string[];
  proposedRest: Record<string, string[]>;
  proposalGoalIds: Set<string>;
} {
  const crunch = new Set<string>();
  const proposedRest: Record<string, string[]> = {};
  const proposalGoalIds = new Set<string>();
  for (const read of reads) {
    read.crunch_weeks.forEach((week) => crunch.add(week));
    if (read.ghosts.length) proposalGoalIds.add(read.goal_id);
    const rest = read.ghosts.find((g) => g.kind === 'goal_rest_weeks');
    if (rest?.weeks) proposedRest[read.goal_id] = rest.weeks;
  }
  return { crunchWeeks: [...crunch].sort(), proposedRest, proposalGoalIds };
}
