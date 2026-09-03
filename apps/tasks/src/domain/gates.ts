import type { Task } from '@/schemas/task';
import { columnForTask } from '@/domain/board';

export type GateVisualState = 'ready' | 'queued' | 'resolved' | 'orphan';

export type GateTask = {
  id: string;
  title: string;
  status: Task['status'];
  blocked_since: string | null;
  depends_on: string[];
  visual: GateVisualState;
  isReady: boolean;
  fanOut: number;
};

export type GateAnalysis = {
  focusId: string;
  openAncestors: string[];
  readyGateIds: string[];
  queuedIds: string[];
  orphanDepIds: string[];
  hasCycle: boolean;
  shouldRender: boolean;
  validationWarnings: string[];
};

const DONE = new Set<Task['status']>(['done', 'dead']);

export function isRenderableGateTask(task: Task | undefined): task is Task {
  if (!task) return false;
  if (DONE.has(task.status)) return false;
  if (task.status === 'in_progress') return false;
  return true;
}

export function depIsDone(depId: string, byId: Map<string, Task>): boolean {
  const dep = byId.get(depId);
  return dep != null && dep.status === 'done';
}

export function isReadyGate(task: Task, byId: Map<string, Task>): boolean {
  if (!isRenderableGateTask(task)) return false;
  if (task.depends_on.length === 0) return true;
  return task.depends_on.every((depId) => depIsDone(depId, byId));
}

export function orphanDepIds(task: Task, byId: Map<string, Task>): string[] {
  return task.depends_on.filter((depId) => {
    const dep = byId.get(depId);
    return !dep || dep.status === 'dead';
  });
}

export function openAncestors(
  taskId: string,
  byId: Map<string, Task>,
  cache = new Map<string, Set<string>>(),
  visiting = new Set<string>()
): Set<string> {
  const cached = cache.get(taskId);
  if (cached) return cached;

  if (visiting.has(taskId)) {
    return new Set();
  }
  visiting.add(taskId);

  const task = byId.get(taskId);
  const out = new Set<string>();
  if (!task) {
    cache.set(taskId, out);
    visiting.delete(taskId);
    return out;
  }

  for (const depId of task.depends_on) {
    const dep = byId.get(depId);
    if (!dep || DONE.has(dep.status)) continue;
    if (dep.status === 'in_progress') continue;
    out.add(depId);
    for (const ancestor of openAncestors(depId, byId, cache, visiting)) {
      out.add(ancestor);
    }
  }

  visiting.delete(taskId);
  cache.set(taskId, out);
  return out;
}

export function readyGatesInSet(ids: Set<string>, byId: Map<string, Task>): string[] {
  return [...ids].filter((id) => {
    const task = byId.get(id);
    return task != null && isReadyGate(task, byId);
  });
}

export function analyzeFocus(focusId: string, tasks: Task[]): GateAnalysis {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const focus = byId.get(focusId);
  const warnings: string[] = [];

  if (!focus) {
    return {
      focusId,
      openAncestors: [],
      readyGateIds: [],
      queuedIds: [],
      orphanDepIds: [],
      hasCycle: false,
      shouldRender: false,
      validationWarnings: ['Focus task not found.']
    };
  }

  if (focus.status === 'in_progress') {
    return {
      focusId,
      openAncestors: [],
      readyGateIds: [],
      queuedIds: [],
      orphanDepIds: orphanDepIds(focus, byId),
      hasCycle: false,
      shouldRender: false,
      validationWarnings: ['In-progress tasks are excluded from gate pipes (Board rule).']
    };
  }

  const ancestors = openAncestors(focusId, byId);
  const ready = readyGatesInSet(ancestors, byId);
  const queued = [...ancestors].filter((id) => !ready.includes(id));
  const orphans = orphanDepIds(focus, byId);
  const hasCycle = ancestors.size > 0 && ready.length === 0;
  const shouldRender =
    columnForTask(focus, byId) === 'blocked' || ancestors.size > 0 || focus.depends_on.length > 0;

  if (hasCycle) {
    warnings.push('Dependency cycle detected — no ready gate in this chain.');
  }
  if (orphans.length) {
    warnings.push('Dangling dependency reference — check orphan gates.');
  }
  if (columnForTask(focus, byId) === 'blocked' && ready.length === 0 && !hasCycle && orphans.length === 0) {
    warnings.push('Task is blocked but no ready gate was found — possible data issue.');
  }

  return {
    focusId,
    openAncestors: [...ancestors],
    readyGateIds: ready,
    queuedIds: queued,
    orphanDepIds: orphans,
    hasCycle,
    shouldRender,
    validationWarnings: warnings
  };
}

export function fanOut(gateId: string, tasks: Task[], byId: Map<string, Task>): number {
  let count = 0;
  for (const task of tasks) {
    if (!isRenderableGateTask(task)) continue;
    if (task.id === gateId) continue;
    if (openAncestors(task.id, byId).has(gateId)) count++;
  }
  return count;
}

export function gateVisualState(task: Task, byId: Map<string, Task>): GateVisualState {
  if (task.status === 'done') return 'resolved';
  if (!isRenderableGateTask(task)) return 'resolved';
  if (orphanDepIds(task, byId).length > 0 && !isReadyGate(task, byId)) return 'orphan';
  if (isReadyGate(task, byId)) return 'ready';
  return 'queued';
}

export function rankToReadyGate(taskId: string, byId: Map<string, Task>, cache = new Map<string, number>()): number {
  const cached = cache.get(taskId);
  if (cached != null) return cached;

  const task = byId.get(taskId);
  if (!task || !isRenderableGateTask(task)) {
    cache.set(taskId, 0);
    return 0;
  }
  if (isReadyGate(task, byId)) {
    cache.set(taskId, 0);
    return 0;
  }

  let best = 0;
  for (const depId of task.depends_on) {
    const dep = byId.get(depId);
    if (!dep || !isRenderableGateTask(dep)) continue;
    best = Math.max(best, rankToReadyGate(depId, byId, cache) + 1);
  }
  cache.set(taskId, best);
  return best;
}

export type HubComponent = {
  readyGateId: string;
  title: string;
  blocked_since: string | null;
  fanOut: number;
  queuedCount: number;
  focusIds: string[];
};

export function hubComponents(tasks: Task[]): HubComponent[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const readyIds = tasks.filter((task) => isReadyGate(task, byId)).map((task) => task.id);
  const seen = new Set<string>();
  const components: HubComponent[] = [];

  for (const gateId of readyIds) {
    if (seen.has(gateId)) continue;
    const gate = byId.get(gateId);
    if (!gate) continue;

    const focusIds = tasks
      .filter((task) => {
        if (!isRenderableGateTask(task)) return false;
        if (task.status === 'done') return false;
        const ancestors = openAncestors(task.id, byId);
        return ancestors.has(gateId) || task.depends_on.includes(gateId);
      })
      .map((task) => task.id);

    const ancestorUnion = new Set<string>();
    for (const focusId of focusIds) {
      for (const id of openAncestors(focusId, byId)) ancestorUnion.add(id);
    }
    ancestorUnion.add(gateId);

    const queuedCount = [...ancestorUnion].filter((id) => id !== gateId && !isReadyGate(byId.get(id)!, byId)).length;

    for (const id of ancestorUnion) seen.add(id);

    components.push({
      readyGateId: gateId,
      title: gate.title,
      blocked_since: gate.blocked_since,
      fanOut: fanOut(gateId, tasks, byId),
      queuedCount,
      focusIds
    });
  }

  return components.sort((a, b) => b.fanOut - a.fanOut || b.queuedCount - a.queuedCount);
}

export function daysSince(iso: string | null, now = Date.now()): number {
  if (!iso) return 0;
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, ms / 86_400_000);
}

export function chamberHeightUnits(blockedSince: string | null, now = Date.now()): number {
  const base = 60;
  const cap = 180;
  const k = 8;
  const days = daysSince(blockedSince, now);
  return Math.min(base + k * Math.sqrt(days), cap);
}
