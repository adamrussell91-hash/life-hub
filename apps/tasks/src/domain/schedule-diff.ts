import type { AgentMutation } from '@/domain/agent-mutations';
import { sanitizeTaskPatch } from '@/domain/agent-mutations';
import { parseDue, toDateKey, weekDays } from '@/domain/queries';

export type ScheduleDiffItem = {
  taskId: string;
  from: string | null;
  to: string | null;
  summary: string;
};

export type ScheduleGhostChip = {
  dateKey: string;
  role: 'from' | 'to';
  taskId: string;
  summary: string;
};

export type ScheduleGhostDay = {
  dateKey: string;
  weekday: string;
  chips: ScheduleGhostChip[];
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Extract due_date moves from agent mutations for ghost calendar previews. */
export function scheduleDiffFromMutations(mutations: AgentMutation[]): ScheduleDiffItem[] {
  const out: ScheduleDiffItem[] = [];
  for (const mutation of mutations) {
    if (mutation.kind !== 'task_update') continue;
    const patch = sanitizeTaskPatch(mutation.patch);
    if (!('due_date' in patch)) continue;
    const to = patch.due_date == null ? null : String(patch.due_date);
    out.push({
      taskId: mutation.task_id,
      from: null,
      to,
      summary: mutation.summary
    });
  }
  return out;
}

export function scheduleDiffFromMutation(
  mutation: AgentMutation,
  currentDue: string | null | undefined
): ScheduleDiffItem | null {
  if (mutation.kind !== 'task_update') return null;
  const patch = sanitizeTaskPatch(mutation.patch);
  if (!('due_date' in patch)) return null;
  const to = patch.due_date == null ? null : String(patch.due_date);
  const from = currentDue ?? null;
  if (from === to) return null;
  return { taskId: mutation.task_id, from, to, summary: mutation.summary };
}

/**
 * Mini week strip for confirm-card ghosts.
 * Anchors on the proposed `to` date when set, else `from`, else today.
 */
export function scheduleGhostWeek(diff: ScheduleDiffItem, today = new Date()): ScheduleGhostDay[] {
  const anchor =
    parseDue(diff.to) ?? parseDue(diff.from) ?? new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return weekDays(anchor).map((day, index) => {
    const dateKey = toDateKey(day);
    const chips: ScheduleGhostChip[] = [];
    if (diff.from === dateKey) {
      chips.push({ dateKey, role: 'from', taskId: diff.taskId, summary: diff.summary });
    }
    if (diff.to === dateKey) {
      chips.push({ dateKey, role: 'to', taskId: diff.taskId, summary: diff.summary });
    }
    return {
      dateKey,
      weekday: WEEKDAYS[index]!,
      chips
    };
  });
}
