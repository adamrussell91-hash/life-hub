/**
 * Date truth — hard deadline, target, review, and planned work are separate.
 * due_date / due_time = hard deadline. Moving a work block must never change them.
 */

export type DateKind = 'deadline' | 'target' | 'review' | 'planned_work';

export type TaskDateFields = {
  due_date?: string | null;
  due_time?: string | null;
  target_date?: string | null;
  review_at?: string | null;
};

export function dateKindLabel(kind: DateKind): string {
  switch (kind) {
    case 'deadline':
      return 'Deadline';
    case 'target':
      return 'Target';
    case 'review':
      return 'Review';
    case 'planned_work':
      return 'Planned work';
  }
}

/** Hard overdue uses deadline only — never target or review. */
export function isHardOverdue(
  task: TaskDateFields,
  todayKey: string
): boolean {
  if (!task.due_date) return false;
  return task.due_date < todayKey;
}

export function isTargetPast(
  task: TaskDateFields,
  todayKey: string
): boolean {
  if (!task.target_date) return false;
  return task.target_date < todayKey;
}

export function isReviewDue(
  task: { review_at?: string | null; bucket?: string | null },
  todayKey: string
): boolean {
  if (!task.review_at) return false;
  return task.review_at <= todayKey;
}

/** Relevant date chips for compact cards — omit empty noise. */
export function relevantDateIndicators(
  task: TaskDateFields & { waiting_status?: string | null },
  todayKey: string
): Array<{ kind: DateKind | 'waiting'; label: string; strong: boolean }> {
  const out: Array<{ kind: DateKind | 'waiting'; label: string; strong: boolean }> = [];
  if (task.due_date) {
    const overdue = isHardOverdue(task, todayKey);
    out.push({
      kind: 'deadline',
      label: overdue ? `Deadline ${task.due_date} (overdue)` : `Deadline ${task.due_date}`,
      strong: true
    });
  }
  if (task.target_date) {
    out.push({
      kind: 'target',
      label: `Target ${task.target_date}`,
      strong: false
    });
  }
  if (task.review_at && isReviewDue(task, todayKey)) {
    out.push({
      kind: 'review',
      label: `Review ${task.review_at}`,
      strong: false
    });
  }
  if (task.waiting_status === 'waiting' || task.waiting_status === 'follow_up_due') {
    out.push({ kind: 'waiting', label: 'Waiting', strong: false });
  }
  return out;
}

/**
 * Reject patches that would mutate a hard deadline while only moving planned work.
 * Callers that intend deadline changes must set `intent: 'deadline'`.
 */
export function assertNoSilentDeadlineMutation(input: {
  intent: 'plan_work' | 'deadline' | 'other';
  before: TaskDateFields;
  after: TaskDateFields;
}): { ok: true } | { ok: false; reason: string } {
  if (input.intent !== 'plan_work') return { ok: true };
  if (input.before.due_date !== input.after.due_date) {
    return { ok: false, reason: 'Planning work must not change due_date.' };
  }
  if (input.before.due_time !== input.after.due_time) {
    return { ok: false, reason: 'Planning work must not change due_time.' };
  }
  return { ok: true };
}
