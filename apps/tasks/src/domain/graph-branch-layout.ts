import { wouldCreateCycle } from '@/domain/graph-model';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

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
  parentId: string | null;
};

export type BranchEdge = {
  from: string;
  to: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
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
};

export type BranchLayout = {
  boxes: BranchBox[];
  edges: BranchEdge[];
  lanes: BranchLane[];
  width: number;
  height: number;
};

const BOX_W = 200;
const BOX_H = 56;
const COL_GAP = 72;
const ROW_GAP = 20;
const LANE_PAD = 28;

function depthOf(task: Task, byId: Map<string, Task>, seen = new Set<string>()): number {
  if (seen.has(task.id)) return 0;
  seen.add(task.id);
  const deps = (task.depends_on ?? []).map((id) => byId.get(id)).filter((t): t is Task => Boolean(t));
  if (!deps.length) return 0;
  return 1 + Math.max(...deps.map((dep) => depthOf(dep, byId, seen)));
}

/** Sugiyama-style layered layout with orthogonal stubs. Used when ELK is unavailable. */
export function layoutBranchFlow(
  tasks: Task[],
  projects: Project[],
  options: { criticalIds?: Set<string>; hideDone?: boolean } = {}
): BranchLayout {
  const visible = options.hideDone ? tasks.filter((t) => t.status !== 'done' && t.status !== 'dead') : tasks;
  const byId = new Map(visible.map((t) => [t.id, t]));
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
  let yCursor = 16;
  let maxX = 320;

  for (const project of projectOrder) {
    const members = groups.get(project.id) ?? [];
    const columns = new Map<number, Task[]>();
    for (const task of members) {
      const depth = depthOf(task, byId);
      const col = columns.get(depth) ?? [];
      col.push(task);
      columns.set(depth, col);
    }
    const depths = [...columns.keys()].sort((a, b) => a - b);
    const rows = Math.max(1, ...depths.map((d) => columns.get(d)!.length));
    const laneH = rows * (BOX_H + ROW_GAP) + LANE_PAD * 2;
    const laneW = Math.max(320, (Math.max(0, ...depths) + 1) * (BOX_W + COL_GAP) + LANE_PAD * 2);
    lanes.push({
      id: project.id,
      label: project.title,
      x: 0,
      y: yCursor,
      width: laneW,
      height: laneH
    });
    for (const depth of depths) {
      const col = columns.get(depth)!;
      col.forEach((task, i) => {
        boxes.push({
          id: task.id,
          title: task.title,
          subtitle: '',
          state: task.status,
          projectId: task.parent_project_id,
          x: LANE_PAD + depth * (BOX_W + COL_GAP),
          y: yCursor + LANE_PAD + i * (BOX_H + ROW_GAP),
          width: BOX_W,
          height: BOX_H,
          column: depth,
          parentId: task.parent_task_id
        });
      });
    }
    maxX = Math.max(maxX, laneW);
    yCursor += laneH + 16;
  }

  const boxById = new Map(boxes.map((b) => [b.id, b]));
  const edges: BranchEdge[] = [];
  for (const task of visible) {
    for (const dep of task.depends_on ?? []) {
      const from = boxById.get(dep);
      const to = boxById.get(task.id);
      if (!from || !to) continue;
      edges.push({
        from: dep,
        to: task.id,
        x0: from.x + from.width,
        y0: from.y + from.height / 2,
        x1: to.x,
        y1: to.y + to.height / 2,
        critical: Boolean(options.criticalIds?.has(dep) && options.criticalIds.has(task.id))
      });
    }
  }

  return { boxes, edges, lanes, width: maxX + 24, height: yCursor + 8 };
}

/** Scale a branch diagram down so the whole map sits in the viewport. */
export function fitBranchView(
  layout: Pick<BranchLayout, 'width' | 'height'>,
  viewport: { width: number; height: number }
): { scale: number; panX: number; panY: number } {
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const scale = Math.min(
    1,
    viewportWidth / Math.max(layout.width, 1),
    viewportHeight / Math.max(layout.height, 1)
  );
  return {
    scale,
    panX: Math.max(0, (viewportWidth - layout.width * scale) / 2),
    panY: Math.max(0, (viewportHeight - layout.height * scale) / 2)
  };
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
        'elk.layered.spacing.nodeNodeBetweenLayers': '72'
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
        y1: to.y + to.height / 2
      };
    });
    const width = Math.max(fallback.width, ...boxes.map((b) => b.x + b.width + 24));
    const height = Math.max(fallback.height, ...boxes.map((b) => b.y + b.height + 24));
    return { ...fallback, boxes, edges: nextEdges, width, height };
  } catch {
    return fallback;
  }
}
