import type { AgentMutation } from '@/domain/agent-mutations';
import { sanitizeTaskPatch } from '@/domain/agent-mutations';

export type ScheduleDiffItem = {
  taskId: string;
  from: string | null;
  to: string | null;
  summary: string;
};

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
