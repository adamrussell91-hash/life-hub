import type { Task } from '@/schemas/task';

export type WaitingItem = {
  task_id: string;
  title: string;
  waiting_on: string;
  waiting_since: string | null;
  follow_up_at: string | null;
  waiting_status: 'waiting' | 'follow_up_due' | 'resolved' | null;
  age_days: number | null;
  needs_action: boolean;
};

function daysBetween(fromIso: string, todayKey: string): number | null {
  const from = fromIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${todayKey}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function deriveWaitingStatus(
  task: Pick<Task, 'waiting_on' | 'waiting_status' | 'follow_up_at'>,
  todayKey: string
): 'waiting' | 'follow_up_due' | 'resolved' | null {
  if (task.waiting_status === 'resolved') return 'resolved';
  if (!task.waiting_on && !task.waiting_status) return null;
  if (task.follow_up_at && task.follow_up_at <= todayKey) return 'follow_up_due';
  return 'waiting';
}

/** Waiting age + follow-up. Morning Sweep only needs action=true. */
export function listWaitingItems(tasks: Task[], todayKey: string): WaitingItem[] {
  const out: WaitingItem[] = [];
  for (const task of tasks) {
    if (task.status === 'done' || task.status === 'dead') continue;
    const status = deriveWaitingStatus(task, todayKey);
    if (!status || status === 'resolved') continue;
    if (!task.waiting_on && status !== 'follow_up_due') continue;
    const age = task.waiting_since ? daysBetween(task.waiting_since, todayKey) : null;
    out.push({
      task_id: task.id,
      title: task.title,
      waiting_on: task.waiting_on ?? '',
      waiting_since: task.waiting_since ?? null,
      follow_up_at: task.follow_up_at ?? null,
      waiting_status: status,
      age_days: age,
      needs_action: status === 'follow_up_due'
    });
  }
  return out.sort((a, b) => {
    if (a.needs_action !== b.needs_action) return a.needs_action ? -1 : 1;
    return (b.age_days ?? 0) - (a.age_days ?? 0);
  });
}

export function waitingPatch(
  action: 'follow_up' | 'move_follow_up' | 'resolved' | 'return_to_active',
  input: { follow_up_at?: string | null; waiting_on?: string | null; nowIso?: string }
): Partial<Task> {
  const now = input.nowIso ?? new Date().toISOString();
  switch (action) {
    case 'follow_up':
      return {
        follow_up_at: input.follow_up_at ?? now.slice(0, 10),
        waiting_status: 'follow_up_due'
      };
    case 'move_follow_up':
      return {
        follow_up_at: input.follow_up_at ?? null,
        waiting_status: 'waiting'
      };
    case 'resolved':
      return {
        waiting_status: 'resolved',
        waiting_on: null,
        follow_up_at: null
      };
    case 'return_to_active':
      return {
        waiting_status: null,
        waiting_on: null,
        waiting_since: null,
        follow_up_at: null
      };
  }
}
