import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

export type BranchNodeKind = 'project' | 'task';

export type BranchNode = {
  id: string;
  kind: BranchNodeKind;
  label: string;
  depth: number;
  x: number;
  y: number;
  parent_id: string | null;
  depends_on: string[];
};

export type BranchEdge = {
  from: string;
  to: string;
  kind: 'parent' | 'depends_on';
};

export type BranchLayout = {
  nodes: BranchNode[];
  edges: BranchEdge[];
  width: number;
  height: number;
};

/**
 * Hierarchical layout for one project — parent_project / parent_task + depends_on
 * (spec §6.5 Branch). Not hub-wide.
 */
export function layoutProjectBranch(
  project: Project,
  tasks: Task[],
  options: { rowHeight?: number; colWidth?: number; padding?: number } = {}
): BranchLayout {
  const rowHeight = options.rowHeight ?? 72;
  const colWidth = options.colWidth ?? 200;
  const padding = options.padding ?? 48;

  const projectTasks = tasks.filter(
    (t) => t.parent_project_id === project.id && t.status !== 'dead'
  );
  const byId = new Map(projectTasks.map((t) => [t.id, t]));

  // Roots: no parent_task_id (or parent missing)
  const roots = projectTasks.filter((t) => !t.parent_task_id || !byId.has(t.parent_task_id));
  const children = new Map<string, Task[]>();
  for (const task of projectTasks) {
    if (task.parent_task_id && byId.has(task.parent_task_id)) {
      const list = children.get(task.parent_task_id) ?? [];
      list.push(task);
      children.set(task.parent_task_id, list);
    }
  }

  type Placed = { id: string; kind: BranchNodeKind; label: string; depth: number; order: number };
  const placed: Placed[] = [
    { id: project.id, kind: 'project', label: project.title, depth: 0, order: 0 }
  ];

  function walk(task: Task, depth: number, orderBase: number): number {
    placed.push({
      id: task.id,
      kind: 'task',
      label: task.title,
      depth,
      order: orderBase
    });
    const kids = children.get(task.id) ?? [];
    let next = orderBase;
    kids.forEach((kid, i) => {
      next = walk(kid, depth + 1, orderBase + i);
    });
    return Math.max(next, orderBase) + Math.max(kids.length, 1);
  }

  let cursor = 0;
  for (const root of roots) {
    cursor = walk(root, 1, cursor) + 1;
  }

  // Also include orphan depends-only tasks already in placed
  const placedIds = new Set(placed.map((p) => p.id));
  for (const task of projectTasks) {
    if (!placedIds.has(task.id)) {
      placed.push({
        id: task.id,
        kind: 'task',
        label: task.title,
        depth: 1,
        order: cursor++
      });
      placedIds.add(task.id);
    }
  }

  const maxDepth = Math.max(...placed.map((p) => p.depth), 0);
  const maxOrder = Math.max(...placed.map((p) => p.order), 0);
  const nodes: BranchNode[] = placed.map((p) => ({
    id: p.id,
    kind: p.kind,
    label: p.label,
    depth: p.depth,
    x: padding + p.depth * colWidth,
    y: padding + p.order * rowHeight,
    parent_id:
      p.kind === 'project'
        ? null
        : byId.get(p.id)?.parent_task_id && placedIds.has(byId.get(p.id)!.parent_task_id!)
          ? byId.get(p.id)!.parent_task_id!
          : project.id,
    depends_on: byId.get(p.id)?.depends_on.filter((id) => placedIds.has(id)) ?? []
  }));

  const edges: BranchEdge[] = [];
  for (const node of nodes) {
    if (node.parent_id) {
      edges.push({ from: node.parent_id, to: node.id, kind: 'parent' });
    }
    for (const dep of node.depends_on) {
      edges.push({ from: dep, to: node.id, kind: 'depends_on' });
    }
  }

  return {
    nodes,
    edges,
    width: padding * 2 + (maxDepth + 1) * colWidth,
    height: padding * 2 + (maxOrder + 1) * rowHeight
  };
}
