import type { Task } from '@/schemas/task';
import {
  analyzeFocus,
  daysSince,
  fanOut,
  gateVisualState,
  hubComponents,
  isRenderableGateTask,
  rankToReadyGate,
  type HubComponent
} from '@/domain/gates';

/** Native asset tube height at 1× render size — all pipe assets share this. */
export const PIPE_DIAMETER = 48;
export const VALVE_WIDTH = 120;
export const STRAIGHT_LEN = 80;
export const END_CAP_WIDTH = 48;
export const COUPLING_WIDTH = 32;
export const WATER_TILE_WIDTH = 240;
export const CHAIN_GAP = 32;
export const ASSET_BASE = '/assets/pipes';

export type WaterState = 'flowing' | 'pressurised' | 'dry';

export type ChainSegment =
  | {
      kind: 'straight';
      x: number;
      y: number;
      width: number;
      water: WaterState;
      flowDuration?: number;
    }
  | {
      kind: 'elbow';
      x: number;
      y: number;
      orientation: 0 | 90 | 180 | 270;
      dry: boolean;
    }
  | {
      kind: 'junction';
      x: number;
      y: number;
      branch: 'merge' | 'split';
      dry: boolean;
    }
  | {
      kind: 'valve';
      x: number;
      y: number;
      taskId: string;
      title: string;
      status: 'open' | 'closed';
      daysBlocked: number;
      fanOut: number;
      blocked_since: string | null;
    }
  | { kind: 'coupling'; x: number; y: number }
  | { kind: 'end-cap'; x: number; y: number }
  | { kind: 'queued-cap'; x: number; y: number; count: number; label: string };

export type PipeChainLayout = {
  chainId: string;
  mode: 'hub' | 'focus';
  segments: ChainSegment[];
  width: number;
  height: number;
  srSummary: string;
  warnings: string[];
};

export type PipeIllustrationLayout = {
  mode: 'hub' | 'focus';
  focusId: string | null;
  chains: PipeChainLayout[];
  srSummary: string;
  warnings: string[];
  headline: string;
};

function flowDuration(blocked_since: string | null): number {
  const days = daysSince(blocked_since);
  return Math.max(1.5, 6 - Math.sqrt(days));
}

function valveStatus(state: ReturnType<typeof gateVisualState>): 'open' | 'closed' {
  if (state === 'ready' || state === 'resolved') return 'open';
  return 'closed';
}

function waterForUpstreamSegment(nextValveClosed: boolean, downstreamDry: boolean): WaterState {
  if (downstreamDry) return 'dry';
  if (nextValveClosed) return 'pressurised';
  return 'flowing';
}

function layoutLinearChain(
  chainId: string,
  mode: 'hub' | 'focus',
  nodes: Array<{
    id: string;
    title: string;
    rank: number;
    gateState: ReturnType<typeof gateVisualState>;
    blocked_since: string | null;
    fanOut: number;
  }>,
  collapseAfterHead: number | null,
  warnings: string[]
): PipeChainLayout {
  const sorted = [...nodes].sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  const segments: ChainSegment[] = [];
  let x = 0;
  const y = 0;
  const height = PIPE_DIAMETER + 48;

  segments.push({ kind: 'end-cap', x, y });
  x += END_CAP_WIDTH;

  const visible =
    mode === 'hub' && collapseAfterHead != null ? sorted.slice(0, 1) : sorted;

  for (let i = 0; i < visible.length; i++) {
    const node = visible[i]!;
    const next = visible[i + 1];
    const nextClosed = next ? valveStatus(next.gateState) === 'closed' : false;
    const downstreamDry = next ? next.gateState === 'queued' || next.gateState === 'orphan' : false;

    const water = waterForUpstreamSegment(nextClosed, downstreamDry);
    segments.push({
      kind: 'straight',
      x,
      y,
      width: STRAIGHT_LEN,
      water,
      flowDuration: water === 'flowing' || water === 'pressurised' ? flowDuration(node.blocked_since) : undefined
    });
    x += STRAIGHT_LEN;

    segments.push({ kind: 'coupling', x, y });
    x += COUPLING_WIDTH;

    const status = valveStatus(node.gateState);
    segments.push({
      kind: 'valve',
      x,
      y,
      taskId: node.id,
      title: node.title,
      status,
      daysBlocked: Math.floor(daysSince(node.blocked_since)),
      fanOut: node.fanOut,
      blocked_since: node.blocked_since
    });
    x += VALVE_WIDTH;

    if (mode === 'hub' && collapseAfterHead != null && i === 0) {
      if (collapseAfterHead > 0) {
        segments.push({
          kind: 'queued-cap',
          x,
          y,
          count: collapseAfterHead,
          label: `+${collapseAfterHead} queued`
        });
        x += 96;
      } else {
        segments.push({ kind: 'end-cap', x, y });
        x += END_CAP_WIDTH;
      }
      break;
    }
  }

  if (mode === 'focus' || collapseAfterHead == null) {
    segments.push({ kind: 'end-cap', x, y });
    x += END_CAP_WIDTH;
  }

  return {
    chainId,
    mode,
    segments,
    width: x + 24,
    height,
    srSummary: buildChainProse(sorted, warnings),
    warnings
  };
}

function buildChainProse(
  nodes: Array<{ title: string; gateState: ReturnType<typeof gateVisualState>; blocked_since: string | null }>,
  warnings: string[]
): string {
  if (warnings.length) return warnings.join(' ');
  const ready = nodes.filter((n) => n.gateState === 'ready');
  const queued = nodes.filter((n) => n.gateState === 'queued' || n.gateState === 'orphan');
  const resolved = nodes.filter((n) => n.gateState === 'resolved');

  const parts: string[] = [];
  if (resolved.length) {
    parts.push(`${resolved.map((n) => n.title).join(', ')} resolved.`);
  }
  const bottleneck = queued[0] ?? ready[ready.length - 1];
  if (bottleneck) {
    const days = Math.floor(daysSince(bottleneck.blocked_since));
    if (bottleneck.gateState === 'queued' || bottleneck.gateState === 'orphan') {
      parts.push(
        `${bottleneck.title} is the active bottleneck${days ? `, blocked ${days} day${days === 1 ? '' : 's'}` : ''}.`
      );
    } else {
      parts.push(`${bottleneck.title} is the active ready gate.`);
    }
  }
  if (queued.length > 1) {
    parts.push(`${queued.slice(1).map((n) => n.title).join(', ')} are queued behind it.`);
  }
  return parts.join(' ') || 'No active blockers in this chain.';
}

function focusNodes(focusId: string, tasks: Task[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const analysis = analyzeFocus(focusId, tasks);
  const ids = new Set([...analysis.openAncestors, focusId]);
  const nodes = [...ids]
    .map((id) => byId.get(id))
    .filter((task): task is Task => Boolean(task) && isRenderableGateTask(task))
    .map((task) => ({
      id: task.id,
      title: task.title,
      rank: rankToReadyGate(task.id, byId),
      gateState: gateVisualState(task, byId),
      blocked_since: task.blocked_since,
      fanOut: fanOut(task.id, tasks, byId)
    }));

  const focus = byId.get(focusId);
  if (focus && isRenderableGateTask(focus) && !nodes.some((n) => n.id === focusId)) {
    nodes.push({
      id: focus.id,
      title: focus.title,
      rank: Math.max(0, ...nodes.map((n) => n.rank)) + 1,
      gateState: gateVisualState(focus, byId),
      blocked_since: focus.blocked_since,
      fanOut: fanOut(focus.id, tasks, byId)
    });
  }

  return { nodes, warnings: analysis.validationWarnings, hasCycle: analysis.hasCycle };
}

export function layoutFocusChain(focusId: string, tasks: Task[]): PipeChainLayout {
  const { nodes, warnings, hasCycle } = focusNodes(focusId, tasks);
  if (hasCycle || !nodes.length) {
    return {
      chainId: focusId,
      mode: 'focus',
      segments: [],
      width: 320,
      height: PIPE_DIAMETER + 48,
      srSummary: warnings[0] ?? 'Unable to render this blocker chain.',
      warnings
    };
  }
  return layoutLinearChain(focusId, 'focus', nodes, null, warnings);
}

export function layoutHubChain(component: HubComponent): PipeChainLayout {
  const nodes = [
    {
      id: component.readyGateId,
      title: component.title,
      rank: 0,
      gateState: 'ready' as const,
      blocked_since: component.blocked_since,
      fanOut: component.fanOut
    }
  ];
  return layoutLinearChain(component.readyGateId, 'hub', nodes, component.queuedCount, []);
}

export function layoutPipeIllustration(focusId: string | null, tasks: Task[]): PipeIllustrationLayout {
  if (focusId) {
    const chain = layoutFocusChain(focusId, tasks);
    return {
      mode: 'focus',
      focusId,
      chains: chain.segments.length ? [chain] : [],
      srSummary: chain.srSummary,
      warnings: chain.warnings,
      headline: chain.warnings[0] ?? 'Blocker chain focus'
    };
  }

  const components = hubComponents(tasks).filter((c) => c.fanOut > 0 || c.queuedCount > 0);
  const chains = components.slice(0, 6).map((component) => layoutHubChain(component));
  const srSummary =
    chains.length === 0
      ? 'No active bottleneck gates — nothing is waiting on an open, startable blocker.'
      : chains.map((c) => c.srSummary).join(' ');

  return {
    mode: 'hub',
    focusId: null,
    chains,
    srSummary,
    warnings: [],
    headline:
      chains.length === 0
        ? 'No bottlenecks'
        : `${chains.length} bottleneck gate${chains.length === 1 ? '' : 's'} across the hub`
  };
}

/** Memoize on task list identity — caller passes stable reference when unchanged. */
const layoutCache = new WeakMap<Task[], PipeIllustrationLayout>();

export function layoutPipeIllustrationMemoized(focusId: string | null, tasks: Task[]): PipeIllustrationLayout {
  const cached = layoutCache.get(tasks);
  if (cached && cached.focusId === focusId && cached.mode === (focusId ? 'focus' : 'hub')) {
    return cached;
  }
  const layout = layoutPipeIllustration(focusId, tasks);
  layoutCache.set(tasks, layout);
  return layout;
}
