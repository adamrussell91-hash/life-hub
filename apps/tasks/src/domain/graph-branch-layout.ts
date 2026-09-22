import { wouldCreateCycle } from '@/domain/graph-model';
import { projectMilestones } from '@/domain/project-milestones';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { FLOW_G } from '../../../life/js/app/chart-kit/flowchart-lanes.js';

export type BranchBox = {
  id: string;
  title: string;
  subtitle: string;
  state: string;
  projectId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
  row: number;
  parentId: string | null;
  kind: 'task' | 'milestone';
};

export type BranchEdge = {
  from: string;
  to: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  srcCol: number;
  dstCol: number;
  srcX: number;
  dstX: number;
  critical: boolean;
  suggested?: boolean;
};

export type BranchLane = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colour: string;
  rows: number;
};

export type BranchLayout = {
  boxes: BranchBox[];
  edges: BranchEdge[];
  lanes: BranchLane[];
  width: number;
  height: number;
};

type LayoutNode = {
  id: string;
  title: string;
  kind: 'task' | 'milestone';
  task?: Task;
  projectId: string | null;
  parentId: string | null;
  dependsOn: string[];
};

function depthOf(id: string, byId: Map<string, LayoutNode>, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const node = byId.get(id);
  if (!node) return 0;
  const deps = node.dependsOn.filter((dep) => byId.has(dep));
  if (!deps.length) return 0;
  return 1 + Math.max(...deps.map((dep) => depthOf(dep, byId, seen)));
}

function nodesForProject(project: Project, members: Task[]): LayoutNode[] {
  const nodes: LayoutNode[] = members.map((task) => ({
    id: task.id,
    title: task.title,
    kind: 'task',
    task,
    projectId: project.id === 'loose' ? null : project.id,
    parentId: task.parent_task_id,
    dependsOn: task.depends_on ?? []
  }));
  if (project.id === 'loose') return nodes;
  for (const milestone of projectMilestones(project)) {
    nodes.push({
      id: milestone.id,
      title: milestone.title,
      kind: 'milestone',
      projectId: project.id,
      parentId: null,
      dependsOn: milestone.depends_on ?? []
    });
  }
  return nodes;
}

/** Sugiyama-style layered layout with FLOW_G geometry. Used when ELK is unavailable. */
export function layoutBranchFlow(
  tasks: Task[],
  projects: Project[],
  options: { criticalIds?: Set<string>; hideDone?: boolean } = {}
): BranchLayout {
  const visible = options.hideDone ? tasks.filter((t) => t.status !== 'done' && t.status !== 'dead') : tasks;
  const groups = new Map<string, Task[]>();
  for (const task of visible) {
    const key = task.parent_project_id ?? 'loose';
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }
  const projectOrder = [
    ...projects.filter((p) => groups.has(p.id)),
    ...([...groups.keys()].includes('loose') ? [{ id: 'loose', title: 'Loose' } as Project] : [])
  ];

  const boxes: BranchBox[] = [];
  const lanes: BranchLane[] = [];
  let yCursor = 0;
  let maxX = 320;
  const g = FLOW_G;
  const innerW = g.lanePadX * 2 + 5 * g.boxW + 4 * g.colGap;

  for (const project of projectOrder) {
    const members = groups.get(project.id) ?? [];
    const nodes = nodesForProject(project, members);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const columns = new Map<number, LayoutNode[]>();
    for (const node of nodes) {
      const depth = depthOf(node.id, byId);
      const col = columns.get(depth) ?? [];
      col.push(node);
      columns.set(depth, col);
    }
    const depths = [...columns.keys()].sort((a, b) => a - b);
    const rows = Math.max(1, ...depths.map((d) => columns.get(d)!.length));
    const laneH = g.laneHeadH + rows * g.rowPitch - (g.rowPitch - g.boxH) + g.lanePadB;
    const laneW = Math.max(innerW, (Math.max(0, ...depths) + 1) * (g.boxW + g.colGap) + g.lanePadX * 2);
    lanes.push({
      id: project.id,
      label: project.title,
      x: 0,
      y: yCursor,
      width: laneW,
      height: laneH,
      colour: '',
      rows
    });
    for (const depth of depths) {
      const col = columns.get(depth)!;
      col.forEach((node, i) => {
        boxes.push({
          id: node.id,
          title: node.title,
          subtitle: '',
          state: node.kind === 'milestone' ? 'milestone' : (node.task?.status ?? 'open'),
          projectId: node.projectId,
          x: g.lanePadX + depth * (g.boxW + g.colGap),
          y: yCursor + g.laneHeadH + i * g.rowPitch,
          width: g.boxW,
          height: g.boxH,
          column: depth,
          row: i,
          parentId: node.parentId,
          kind: node.kind
        });
      });
    }
    maxX = Math.max(maxX, laneW);
    yCursor += laneH + g.laneGap;
  }

  const boxById = new Map(boxes.map((b) => [b.id, b]));
  const edges: BranchEdge[] = [];
  const allNodes = projectOrder.flatMap((project) => nodesForProject(project, groups.get(project.id) ?? []));
  for (const node of allNodes) {
    for (const dep of node.dependsOn) {
      const from = boxById.get(dep);
      const to = boxById.get(node.id);
      if (!from || !to) continue;
      edges.push({
        from: dep,
        to: node.id,
        x0: from.x + from.width,
        y0: from.y + from.height / 2,
        x1: to.x,
        y1: to.y + to.height / 2,
        srcCol: from.column,
        dstCol: to.column,
        srcX: from.x,
        dstX: to.x,
        critical: Boolean(options.criticalIds?.has(dep) && options.criticalIds.has(node.id))
      });
    }
  }

  return { boxes, edges, lanes, width: maxX + 8, height: Math.max(0, yCursor - g.laneGap) };
}

export function canLink(fromId: string, toId: string, tasks: Task[]): boolean {
  return !wouldCreateCycle(fromId, toId, tasks);
}

/** Prefer ELK layered + orthogonal routing; fall back to Sugiyama. */
export async function layoutBranchFlowAsync(
  tasks: Task[],
  projects: Project[],
  options: { criticalIds?: Set<string>; hideDone?: boolean } = {}
): Promise<BranchLayout> {
  const fallback = layoutBranchFlow(tasks, projects, options);
  try {
    const mod = await import('elkjs/lib/elk.bundled.js');
    const ELK = (mod as { default: new () => { layout: (graph: unknown) => Promise<{ children?: unknown[]; edges?: unknown[] }> } }).default;
    const elk = new ELK();
    const children = fallback.boxes.map((box) => ({
      id: box.id,
      width: box.width,
      height: box.height
    }));
    const edges = fallback.edges.map((edge, i) => ({
      id: `e${i}`,
      sources: [edge.from],
      targets: [edge.to]
    }));
    const result = await elk.layout({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.direction': 'RIGHT',
        'elk.layered.spacing.nodeNodeBetweenLayers': String(FLOW_G.colGap)
      },
      children,
      edges
    });
    const placed = new Map(
      (result.children ?? []).map((node) => {
        const row = node as { id: string; x?: number; y?: number };
        return [row.id, row];
      })
    );
    const boxes = fallback.boxes.map((box) => {
      const next = placed.get(box.id);
      return next ? { ...box, x: next.x ?? box.x, y: next.y ?? box.y } : box;
    });
    const boxById = new Map(boxes.map((b) => [b.id, b]));
    const nextEdges = fallback.edges.map((edge) => {
      const from = boxById.get(edge.from);
      const to = boxById.get(edge.to);
      if (!from || !to) return edge;
      return {
        ...edge,
        x0: from.x + from.width,
        y0: from.y + from.height / 2,
        x1: to.x,
        y1: to.y + to.height / 2,
        srcCol: from.column,
        dstCol: to.column,
        srcX: from.x,
        dstX: to.x
      };
    });
    const width = Math.max(fallback.width, ...boxes.map((b) => b.x + b.width + 24));
    const height = Math.max(fallback.height, ...boxes.map((b) => b.y + b.height + 24));
    return { ...fallback, boxes, edges: nextEdges, width, height };
  } catch {
    return fallback;
  }
}
