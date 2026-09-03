import type { Task } from '@/schemas/task';
import {
  addDays,
  parseDue,
  startOfDay,
  tasksForDay,
  toDateKey,
  sortByPriorityThenDue
} from '@/domain/queries';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export type PinchSeverity = 'watch' | 'overloaded';

export type ShrinkActionKind = 'defer' | 'delegate' | 'delete';

export type ShrinkSuggestion = {
  task_id: string;
  title: string;
  kind: ShrinkActionKind;
  label: string;
  detail: string;
  /** Patch applied on confirm (via shared updateTask / deleteTask). */
  patch?: Partial<Task>;
  delete?: boolean;
  defer_days?: number;
};

export type PinchPoint = {
  date_key: string;
  date: Date;
  severity: PinchSeverity;
  task_count: number;
  estimated_minutes: number;
  tasks: Task[];
  summary: string;
  shrink: ShrinkSuggestion[];
};

export type DueSoonItem = {
  task: Task;
  date_key: string;
  days_until: number;
  label: string;
};

export type PinchScanOptions = {
  /** Inclusive horizon from `from` (default today). */
  days?: number;
  /** Soft flag: task count ≥ this (default 3). */
  watchTaskCount?: number;
  /** Hard flag: task count ≥ this (default 5). */
  overloadTaskCount?: number;
  /** Soft flag: estimated minutes ≥ this (default 240). */
  watchMinutes?: number;
  /** Hard flag: estimated minutes ≥ this (default 360). */
  overloadMinutes?: number;
  /** Minutes assumed when estimated_duration is null (default 45). */
  defaultMinutes?: number;
};

const PRIORITY_RANK: Record<Task['priority'], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

function effortMinutes(task: Task, fallback: number): number {
  return task.estimated_duration ?? fallback;
}

function dayLoad(tasks: Task[], day: Date, fallback: number): {
  tasks: Task[];
  estimated_minutes: number;
} {
  const dayTasks = tasksForDay(tasks, day);
  const estimated_minutes = dayTasks.reduce((sum, t) => sum + effortMinutes(t, fallback), 0);
  return { tasks: dayTasks, estimated_minutes };
}

/** Prefer shrinking low-priority, non-blocked, deferrable work first. */
export function rankShrinkCandidates(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pr = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]; // low first
    if (pr !== 0) return pr;
    const ae = a.estimated_duration ?? 45;
    const be = b.estimated_duration ?? 45;
    return be - ae; // longer first among same priority
  });
}

export function buildShrinkSuggestions(dayTasks: Task[], dateKey: string): ShrinkSuggestion[] {
  const candidates = rankShrinkCandidates(dayTasks).slice(0, 3);
  const out: ShrinkSuggestion[] = [];

  for (const task of candidates) {
    if (task.priority === 'low' || task.priority === 'medium') {
      const deferDays = task.priority === 'low' ? 2 : 1;
      out.push({
        task_id: task.id,
        title: task.title,
        kind: 'defer',
        label: `Defer “${task.title}”`,
        detail: `Push due date ${deferDays} day${deferDays > 1 ? 's' : ''} past ${dateKey}.`,
        defer_days: deferDays
      });
    }
    if (task.priority === 'low' || task.domain === 'other') {
      out.push({
        task_id: task.id,
        title: task.title,
        kind: 'delegate',
        label: `Mark “${task.title}” to delegate`,
        detail: 'Tag as delegate and defer one day so it leaves today’s pinch.',
        patch: {
          tags: Array.from(new Set([...(task.tags ?? []), 'delegate'])),
          status: 'deferred'
        },
        defer_days: 1
      });
    }
    if (task.priority === 'low' && !task.parent_project_id) {
      out.push({
        task_id: task.id,
        title: task.title,
        kind: 'delete',
        label: `Bury “${task.title}”`,
        detail: 'Mark dead — recoverable later if you change your mind.',
        delete: false,
        patch: { status: 'dead' }
      });
    }
  }

  // Deduplicate by task_id+kind, keep first three actionable suggestions overall
  const seen = new Set<string>();
  const unique: ShrinkSuggestion[] = [];
  for (const s of out) {
    const key = `${s.task_id}:${s.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
    if (unique.length >= 3) break;
  }
  return unique;
}

/**
 * Scan upcoming days for overload (task density + estimated effort).
 * Spec §5.2 — each flag includes shrink suggestions.
 */
export function detectPinchPoints(
  tasks: Task[],
  from: Date = new Date(),
  options: PinchScanOptions = {}
): PinchPoint[] {
  const days = options.days ?? 7;
  const watchTaskCount = options.watchTaskCount ?? 3;
  const overloadTaskCount = options.overloadTaskCount ?? 5;
  const watchMinutes = options.watchMinutes ?? 240;
  const overloadMinutes = options.overloadMinutes ?? 360;
  const defaultMinutes = options.defaultMinutes ?? 45;

  const start = startOfDay(from);
  const pinches: PinchPoint[] = [];

  for (let i = 0; i < days; i += 1) {
    const day = addDays(start, i);
    const { tasks: dayTasks, estimated_minutes } = dayLoad(tasks, day, defaultMinutes);
    if (!dayTasks.length) continue;

    const overloaded =
      dayTasks.length >= overloadTaskCount || estimated_minutes >= overloadMinutes;
    const watch =
      !overloaded &&
      (dayTasks.length >= watchTaskCount || estimated_minutes >= watchMinutes);

    if (!overloaded && !watch) continue;

    const severity: PinchSeverity = overloaded ? 'overloaded' : 'watch';
    const date_key = toDateKey(day);
    const todayKey = toDateKey(start);
    const when = date_key === todayKey ? 'Today' : formatDisplayDate(day);
    const summary =
      severity === 'overloaded'
        ? `${when} looks overloaded — ${dayTasks.length} tasks (~${estimated_minutes}m).`
        : `${when} is packing up — ${dayTasks.length} tasks (~${estimated_minutes}m).`;

    pinches.push({
      date_key,
      date: day,
      severity,
      task_count: dayTasks.length,
      estimated_minutes,
      tasks: dayTasks,
      summary,
      shrink: buildShrinkSuggestions(dayTasks, date_key)
    });
  }

  return pinches;
}

/** In-app due-soon nudges (today / tomorrow). Spec §6.4 + DECISIONS.md. */
export function dueSoonTasks(
  tasks: Task[],
  from: Date = new Date(),
  withinDays = 1
): DueSoonItem[] {
  const start = startOfDay(from);
  const out: DueSoonItem[] = [];
  for (const task of sortByPriorityThenDue(tasks)) {
    if (task.status === 'done' || task.status === 'dead') continue;
    const due = parseDue(task.due_date);
    if (!due) continue;
    const dueDay = startOfDay(due);
    const diff = Math.round((dueDay.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    if (diff < 0 || diff > withinDays) continue;
    out.push({
      task,
      date_key: toDateKey(dueDay),
      days_until: diff,
      label: diff === 0 ? 'Due today' : diff === 1 ? 'Due tomorrow' : `Due in ${diff} days`
    });
  }
  return out;
}

/** Resolve a shrink suggestion into an update payload (due_date shift applied). */
export function applyShrinkPatch(
  task: Task,
  suggestion: ShrinkSuggestion,
  fromDateKey: string
): { mode: 'update'; patch: Partial<Task> } | { mode: 'delete' } {
  if (suggestion.delete) return { mode: 'delete' };

  const patch: Partial<Task> = { ...(suggestion.patch ?? {}) };
  if (suggestion.defer_days != null) {
    const base = parseDue(task.due_date) ?? parseDue(fromDateKey) ?? new Date();
    patch.due_date = toDateKey(addDays(startOfDay(base), suggestion.defer_days));
    if (!patch.status && suggestion.kind === 'defer') patch.status = 'deferred';
  }
  return { mode: 'update', patch };
}
