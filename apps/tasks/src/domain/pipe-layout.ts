import type { Task } from '@/schemas/task';
import {
  analyzeFocus,
  chamberHeightUnits,
  fanOut,
  gateVisualState,
  hubComponents,
  isRenderableGateTask,
  openAncestors,
  rankToReadyGate,
  type GateVisualState,
  type HubComponent
} from '@/domain/gates';

export const PIPE_W = 100;
export const GATE_H = 12;
export const MARGIN = 24;
export const BRANCH_GAP = 128;
export const JUNCTION_H = 36;

export type PipeNodeLayout = {
  id: string;
  title: string;
  rank: number;
  branch: number;
  x: number;
  y: number;
  chamberHeight: number;
  gateState: GateVisualState;
  blocked_since: string | null;
  fanOut: number;
};

export type PipeJunctionLayout = {
  type: 'merge' | 'split';
  x: number;
  y: number;
  width: number;
  branchXs: number[];
};

export type PipeSrRow = {
  task: string;
  status: string;
  waitingOn: string;
  daysBlocked: string;
  role: string;
};

export type FocusPipeLayout = {
  mode: 'focus';
  focusId: string;
  nodes: PipeNodeLayout[];
  junctions: PipeJunctionLayout[];
  width: number;
  height: number;
  summary: string;
  warnings: string[];
  srRows: PipeSrRow[];
};

export type HubPipeLayout = {
  mode: 'hub';
  components: Array<
    HubComponent & {
      x: number;
      y: number;
      chamberHeight: number;
      width: number;
    }
  >;
  width: number;
  height: number;
  summary: string;
  warnings: string[];
  srRows: PipeSrRow[];
};

export type PipeLayout = FocusPipeLayout | HubPipeLayout;

function branchForTask(taskId: string, focus: Task, byId: Map<string, Task>): number {
  if (focus.depends_on.length <= 1) return 0;
  for (let branch = 0; branch < focus.depends_on.length; branch++) {
    const root = focus.depends_on[branch]!;
    const ancestors = openAncestors(focus.id, byId);
    if (taskId === root || ancestors.has(taskId)) {
      const belongs = (id: string): boolean => {
        if (id === root) return true;
        const task = byId.get(id);
        if (!task) return false;
        return task.depends_on.some((depId) => belongs(depId));
      };
      if (belongs(taskId)) return branch;
    }
  }
  return 0;
}

function collectFocusNodes(focusId: string, tasks: Task[]): PipeNodeLayout[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const focus = byId.get(focusId);
  if (!focus) return [];

  const analysis = analyzeFocus(focusId, tasks);
  const ids = new Set<string>([...analysis.openAncestors, focusId]);
  const nodes: PipeNodeLayout[] = [];

  for (const id of ids) {
    const task = byId.get(id);
    if (!task || !isRenderableGateTask(task)) continue;
    nodes.push({
      id,
      title: task.title,
      rank: rankToReadyGate(id, byId),
      branch: branchForTask(id, focus, byId),
      x: 0,
      y: 0,
      chamberHeight: chamberHeightUnits(task.blocked_since),
      gateState: gateVisualState(task, byId),
      blocked_since: task.blocked_since,
      fanOut: fanOut(id, tasks, byId)
    });
  }

  const maxRank = Math.max(0, ...nodes.map((node) => node.rank));
  if (isRenderableGateTask(focus) && !nodes.some((node) => node.id === focusId)) {
    nodes.push({
      id: focus.id,
      title: focus.title,
      rank: maxRank + 1,
      branch: 0,
      x: 0,
      y: 0,
      chamberHeight: chamberHeightUnits(focus.blocked_since),
      gateState: gateVisualState(focus, byId),
      blocked_since: focus.blocked_since,
      fanOut: fanOut(focus.id, tasks, byId)
    });
  }

  const ranks = new Map<number, PipeNodeLayout[]>();
  for (const node of nodes) {
    const list = ranks.get(node.rank) ?? [];
    list.push(node);
    ranks.set(node.rank, list);
  }

  let y = MARGIN;
  for (const rank of [...ranks.keys()].sort((a, b) => a - b)) {
    const row = ranks.get(rank)!.sort((a, b) => a.branch - b.branch);
    row.forEach((node, index) => {
      node.x = MARGIN + node.branch * BRANCH_GAP + index * 8;
      node.y = y;
    });
    const rowChamber = Math.max(...row.map((node) => node.chamberHeight));
    y += GATE_H + rowChamber + JUNCTION_H;
  }

  return nodes;
}

function buildSrRows(nodes: PipeNodeLayout[], tasks: Task[]): PipeSrRow[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return nodes.map((node) => {
    const task = byId.get(node.id);
    const waitingOn =
      task?.depends_on
        .map((id) => byId.get(id)?.title)
        .filter(Boolean)
        .join(', ') || '—';
    return {
      task: node.title,
      status: task?.status.replace('_', ' ') ?? '—',
      waitingOn,
      daysBlocked: node.blocked_since
        ? `${Math.floor((Date.now() - new Date(node.blocked_since).getTime()) / 86_400_000)}`
        : '0',
      role: node.gateState
    };
  });
}

export function layoutFocusPipe(focusId: string, tasks: Task[]): FocusPipeLayout {
  const analysis = analyzeFocus(focusId, tasks);
  const nodes = collectFocusNodes(focusId, tasks);
  const maxX = Math.max(PIPE_W + MARGIN * 2, ...nodes.map((node) => node.x + PIPE_W), 0);
  const maxY =
    nodes.length === 0
      ? 160
      : Math.max(...nodes.map((node) => node.y + GATE_H + node.chamberHeight)) + MARGIN;

  const junctions: PipeJunctionLayout[] = [];
  const byRank = new Map<number, PipeNodeLayout[]>();
  for (const node of nodes) {
    const list = byRank.get(node.rank) ?? [];
    list.push(node);
    byRank.set(node.rank, list);
  }
  for (const row of byRank.values()) {
    if (row.length > 1) {
      junctions.push({
        type: 'merge',
        x: MARGIN,
        y: row[0]!.y + GATE_H + Math.max(...row.map((node) => node.chamberHeight)),
        width: Math.max(...row.map((node) => node.x)) + PIPE_W - MARGIN,
        branchXs: row.map((node) => node.x + PIPE_W / 2)
      });
    }
  }

  const readyCount = analysis.readyGateIds.length;
  const summary =
    analysis.validationWarnings[0] ??
    `${readyCount} ready gate${readyCount === 1 ? '' : 's'} · ${analysis.queuedIds.length} queued`;

  return {
    mode: 'focus',
    focusId,
    nodes,
    junctions,
    width: maxX,
    height: maxY,
    summary,
    warnings: analysis.validationWarnings,
    srRows: buildSrRows(nodes, tasks)
  };
}

export function layoutHubPipes(tasks: Task[], maxVisible = 6): HubPipeLayout {
  const components = hubComponents(tasks)
    .filter((component) => component.fanOut > 0 || component.queuedCount > 0)
    .slice(0, maxVisible);
  let y = MARGIN;
  const laidOut = components.map((component, index) => {
    const chamberHeight = chamberHeightUnits(component.blocked_since);
    const item = {
      ...component,
      x: MARGIN,
      y,
      chamberHeight,
      width: PIPE_W
    };
    y += GATE_H + chamberHeight + 24 + (index < components.length - 1 ? 16 : 0);
    return item;
  });

  const srRows: PipeSrRow[] = laidOut.map((component) => ({
    task: component.title,
    status: 'ready gate',
    waitingOn: component.queuedCount ? `+${component.queuedCount} queued` : '—',
    daysBlocked: component.blocked_since
      ? `${Math.floor((Date.now() - new Date(component.blocked_since).getTime()) / 86_400_000)}`
      : '0',
    role: `clears ${component.fanOut}`
  }));

  return {
    mode: 'hub',
    components: laidOut,
    width: PIPE_W + MARGIN * 2 + 220,
    height: Math.max(y + MARGIN, 160),
    summary:
      components.length === 0
        ? 'No active bottleneck gates — nothing is waiting on an open, startable blocker.'
        : `${components.length} bottleneck gate${components.length === 1 ? '' : 's'} across the hub`,
    warnings: [],
    srRows
  };
}

export function layoutPipe(focusId: string | null, tasks: Task[]): PipeLayout {
  if (focusId) return layoutFocusPipe(focusId, tasks);
  return layoutHubPipes(tasks);
}
