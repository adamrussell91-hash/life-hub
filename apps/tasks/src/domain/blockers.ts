import type { Task } from '@/schemas/task';
import { isBlocked } from '@/domain/board';

export type BlockerLink = {
  blockerId: string;
  blockedId: string;
  /** True when the blocking task is not done yet. */
  active: boolean;
};

export type BlockerNode = {
  id: string;
  label: string;
  domain: Task['domain'];
  status: Task['status'];
  blocked: boolean;
  depth: number;
  x: number;
  y: number;
};

export type BlockerGraphLayout = {
  nodes: BlockerNode[];
  links: BlockerLink[];
  blockedCount: number;
  activeLinkCount: number;
  totalLinkCount: number;
  width: number;
  height: number;
};

export function buildBlockerLinks(tasks: Task[]): BlockerLink[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const links: BlockerLink[] = [];
  for (const task of tasks) {
    for (const blockerId of task.depends_on) {
      const blocker = byId.get(blockerId);
      if (!blocker) continue;
      links.push({
        blockerId,
        blockedId: task.id,
        active: blocker.status !== 'done'
      });
    }
  }
  return links;
}

function depthForTask(
  taskId: string,
  byId: Map<string, Task>,
  involved: Set<string>,
  cache: Map<string, number>,
  visiting: Set<string> = new Set()
): number {
  const cached = cache.get(taskId);
  if (cached != null) return cached;
  if (visiting.has(taskId)) return 0;
  visiting.add(taskId);

  const task = byId.get(taskId);
  if (!task) {
    cache.set(taskId, 0);
    return 0;
  }

  const deps = task.depends_on.filter((id) => involved.has(id));
  const depth =
    deps.length === 0 ? 0 : Math.max(...deps.map((id) => depthForTask(id, byId, involved, cache, visiting) + 1));
  cache.set(taskId, depth);
  return depth;
}

/** Layered left-to-right layout: blockers on the left, waiting tasks on the right. */
export function layoutBlockerGraph(
  tasks: Task[],
  opts: { colWidth?: number; rowHeight?: number } = {}
): BlockerGraphLayout {
  const colWidth = opts.colWidth ?? 248;
  const rowHeight = opts.rowHeight ?? 54;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const links = buildBlockerLinks(tasks);

  const involved = new Set<string>();
  for (const link of links) {
    involved.add(link.blockerId);
    involved.add(link.blockedId);
  }

  const involvedTasks = tasks.filter((task) => involved.has(task.id));
  const depthCache = new Map<string, number>();
  const columns = new Map<number, Task[]>();

  for (const task of involvedTasks) {
    const depth = depthForTask(task.id, byId, involved, depthCache);
    const column = columns.get(depth) ?? [];
    column.push(task);
    columns.set(depth, column);
  }

  const nodes: BlockerNode[] = [];
  let maxCol = 0;
  let maxRows = 0;

  for (const [col, colTasks] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    maxCol = Math.max(maxCol, col);
    colTasks.sort((a, b) => a.title.localeCompare(b.title));
    maxRows = Math.max(maxRows, colTasks.length);
    colTasks.forEach((task, row) => {
      nodes.push({
        id: task.id,
        label: task.title,
        domain: task.domain,
        status: task.status,
        blocked: isBlocked(task, byId),
        depth: col,
        x: col * colWidth + 28,
        y: row * rowHeight + 56
      });
    });
  }

  return {
    nodes,
    links,
    blockedCount: involvedTasks.filter((task) => isBlocked(task, byId)).length,
    activeLinkCount: links.filter((link) => link.active).length,
    totalLinkCount: links.length,
    width: (maxCol + 1) * colWidth + 56,
    height: Math.max(maxRows * rowHeight + 96, 240)
  };
}

export type BlockerRow = {
  blockedId: string;
  blockedTitle: string;
  blockedStatus: Task['status'];
  blocked: boolean;
  blockerId: string;
  blockerTitle: string;
  blockerStatus: Task['status'];
  active: boolean;
};

export function blockerRows(tasks: Task[], activeOnly = true): BlockerRow[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const rows: BlockerRow[] = [];

  for (const link of buildBlockerLinks(tasks)) {
    if (activeOnly && !link.active) continue;
    const blocked = byId.get(link.blockedId);
    const blocker = byId.get(link.blockerId);
    if (!blocked || !blocker) continue;
    rows.push({
      blockedId: blocked.id,
      blockedTitle: blocked.title,
      blockedStatus: blocked.status,
      blocked: isBlocked(blocked, byId),
      blockerId: blocker.id,
      blockerTitle: blocker.title,
      blockerStatus: blocker.status,
      active: link.active
    });
  }

  return rows.sort((a, b) => {
    const blockedCmp = a.blockedTitle.localeCompare(b.blockedTitle);
    if (blockedCmp !== 0) return blockedCmp;
    return a.blockerTitle.localeCompare(b.blockerTitle);
  });
}
