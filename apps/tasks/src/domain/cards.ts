import type { Task, TaskPriority, TaskStatus } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { parseDue, toDateKey } from '@/domain/queries';

export type DueChipKind = 'today' | 'soon' | 'later';

/** Board-facing names for the stock status ids (todo → open, doing → in_progress). */
export const BOARD_STATUS_LABELS: Record<string, string> = {
  open: 'To do',
  in_progress: 'Doing',
  done: 'Done',
  deferred: 'Deferred',
  dead: 'Dead'
};

/** Pre-board labels still sitting in seeded / saved property configs. */
const LEGACY_STOCK_STATUS_LABELS: Record<string, string> = {
  open: 'open',
  in_progress: 'in progress',
  done: 'done',
  deferred: 'deferred',
  dead: 'dead'
};

export function statusLabel(status: string): string {
  return BOARD_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

/**
 * Rewrite stock status labels that still say "open" / "in progress" so the
 * task page matches Board columns (To do / Doing / Done). Custom labels stay.
 */
export function alignStockStatusLabelsWithBoard<
  T extends { statuses: Array<{ id: string; label: string }> }
>(config: T): T {
  let changed = false;
  const statuses = config.statuses.map((entry) => {
    const board = BOARD_STATUS_LABELS[entry.id];
    const legacy = LEGACY_STOCK_STATUS_LABELS[entry.id];
    if (!board) return entry;
    if (entry.label === legacy || entry.label === entry.id) {
      changed = true;
      return { ...entry, label: board };
    }
    return entry;
  });
  return changed ? { ...config, statuses } : config;
}

export function statusBadgeClass(status: string): string {
  const safe = status.replace(/[^a-z_]/g, '');
  return `status-badge status-badge--${safe}`;
}

export function formatRelativeUpdated(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 45) return 'Updated just now';
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `Updated ${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return 'Updated yesterday';
  return `Updated ${Math.floor(seconds / 86400)}d ago`;
}

export function dueChipKind(due: string | null, now = new Date()): DueChipKind | null {
  const parsed = parseDue(due);
  if (!parsed) return null;
  const diff = Math.round(
    (new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
  if (diff <= 0) return 'today';
  if (diff <= 2) return 'soon';
  return 'later';
}

export function dueChipLabel(due: string | null, now = new Date()): string | null {
  const kind = dueChipKind(due, now);
  if (!kind) return null;
  const parsed = parseDue(due);
  if (!parsed) return null;
  if (kind === 'today') return toDateKey(parsed) === toDateKey(now) ? 'Today' : 'Overdue';
  if (kind === 'soon') return 'Soon';
  return 'Later';
}

export function priorityDotValue(priority: TaskPriority): string {
  return priority === 'medium' ? 'default' : priority;
}

export type ProjectProgress = {
  done: number;
  total: number;
  pct: number;
  dueToday: number;
  open: Task[];
};

export function projectChildTasks(project: Project, tasks: Task[]): Task[] {
  return tasks.filter(
    (task) => task.parent_project_id === project.id && task.status !== 'dead'
  );
}

export function projectProgress(project: Project, tasks: Task[], now = new Date()): ProjectProgress {
  const children = projectChildTasks(project, tasks);
  const done = children.filter((task) => task.status === 'done').length;
  const total = children.length;
  const todayKey = toDateKey(now);
  const dueToday = children.filter((task) => {
    if (task.status === 'done') return false;
    const due = parseDue(task.due_date);
    return due ? toDateKey(due) === todayKey : false;
  }).length;
  return {
    done,
    total,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
    dueToday,
    open: children.filter((task) => task.status !== 'done')
  };
}

export function taskPageHash(id: string): string {
  return `#/task/${encodeURIComponent(id)}`;
}

export function projectPageHash(id: string): string {
  return `#/project/${encodeURIComponent(id)}`;
}

/** Dedicated create page for an excursion — not the list. */
export function newExcursionHash(templateId?: string | null): string {
  if (!templateId) return '#/excursions/new';
  return `#/excursions/new?template=${encodeURIComponent(templateId)}`;
}

export function isOpenStatus(status: TaskStatus): boolean {
  return status === 'open' || status === 'in_progress' || status === 'deferred';
}
