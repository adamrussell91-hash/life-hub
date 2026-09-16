import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation
} from 'd3-force';

/**
 * Shared canvas force-graph renderer (Phase 4, Features 4.1/4.3/4.4/4.7) —
 * the fork target named in this task's own scoping decision is
 * `apps/tasks/src/views/graph.ts` (centred `d3-force` layout, straight-line
 * links, plain circle nodes, simple hover/click hit-testing), NOT
 * `apps/knowledge/src/archive/forceGraph.ts` (that file's camera/zoom/pan,
 * hub-expand/collapse animation, and cross-fade transitions are deeply
 * coupled to note/topic-specific behaviour and out of proportion to this
 * task's budget — see PHASE-1-PROGRESS.md for the full decision). This
 * component intentionally does NOT provide pan/zoom, animated expand/
 * collapse, or cross-fade transitions between data updates. It DOES
 * provide a real, correctly-simulated force-directed canvas graph with
 * working click-to-select, hover tooltips, and habitat-tinted halos —
 * generic enough to serve World View, EGO Ecology, and Your Network
 * without three separate implementations.
 *
 * Habitat "cluster region" rendering: rather than computing a convex hull
 * across each cluster's member nodes (the interface below tags habitat
 * membership per-NODE, not as a separate cluster/member-list parameter —
 * deliberately, so one node shape serves World/EGO/Your-Network alike), a
 * soft colour halo is drawn behind each node individually, tinted by that
 * node's own `habitat`. Members of the same cluster sit near each other
 * once the simulation settles, so their halos visually merge into a
 * region without this component ever needing hull geometry. Documented as
 * the deliberately simpler choice the task text explicitly permits.
 */

export type HabitatType = 'forest' | 'reef' | 'savannah' | 'wetland' | 'island';

export interface GraphNode {
  id: string;
  kind: 'person' | 'organisation';
  label: string;
  habitat?: HabitatType | null;
  isBridge?: boolean;
  opportunitySignal?: boolean;
  dormant?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationshipType: string;
  layer?: string;
  /** Set by the caller (`views/network-ecology.ts`) after running
   * `classifyRelationshipState` client-side — see that view for the
   * documented data-availability gap this flag depends on. */
  dormant?: boolean;
}

export interface GraphMountOptions {
  onNodeSelect?: (node: GraphNode | null) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  /** From `window.matchMedia('(prefers-reduced-motion: reduce)')`, threaded
   * in by the caller. Checked here only as a plain boolean prop — this
   * component never reads `matchMedia` itself (brief section 49: "Reduced
   * motion mode disables animated environmental transitions"). When true,
   * the simulation is settled synchronously (many manual `.tick()` calls,
   * no live animation) and drawn once, instead of animating tick-by-tick. */
  reducedMotion?: boolean;
}

export interface GraphHandle {
  destroy(): void;
  setData(nodes: GraphNode[], edges: GraphEdge[]): void;
}

interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  relationshipType: string;
  layer?: string;
  dormant?: boolean;
}

/** A node once the simulation has assigned it a position — the shape
 * hit-testing operates over. Exported so hit-testing math is directly
 * unit-testable against known coordinates, without driving a real
 * simulation. */
export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

function tokenColor(name: string, fallback: string): string {
  if (typeof getComputedStyle !== 'function') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blends two live CSS custom-property colours (never a hardcoded literal
 * except as the `tokenColor` fallback, same pattern `apps/tasks/graph.ts`
 * already established). Used for the Mangrove/bridge-person marker, per
 * this task's instruction: "a blend of --success/--marine for Mangrove/
 * bridge overlay". Falls back to `hexA` if either colour cannot be parsed
 * (e.g. a token resolved to a non-hex value in a test environment). */
function blendColor(hexA: string, hexB: string): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const mixed = a.map((v, i) => Math.round((v + b[i]!) / 2));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function bridgeMarkerColor(): string {
  return blendColor(tokenColor('--success', '#2f7a4f'), tokenColor('--marine', '#142b51'));
}

export function opportunityMarkerColor(): string {
  return tokenColor('--high-sea', '#f68620');
}

interface HabitatMeta {
  fillVar: string;
  fillFallback: string;
  accentVar: string;
  accentFallback: string;
  label: string;
}

// Token pairing exactly as specified for this task: Forest uses
// --pastel-sage/--pastel-sage-ink, Reef --pastel-blue/--wave, Savannah
// --pastel-gold/--sand, Wetland --shallow/--pastel-blue, Island --shore/
// --pastel-lilac. `--high-sea` never appears here — reserved exclusively
// for the Opportunity layer accent per its own token comment.
export const HABITAT_META: Record<HabitatType, HabitatMeta> = {
  forest: {
    fillVar: '--pastel-sage',
    fillFallback: '#dfe9e1',
    accentVar: '--pastel-sage-ink',
    accentFallback: '#3c5949',
    label: 'Forest — mature, dense community'
  },
  reef: {
    fillVar: '--pastel-blue',
    fillFallback: '#dceafa',
    accentVar: '--wave',
    accentFallback: '#376fb7',
    label: 'Coral Reef — diverse, overlapping roles'
  },
  savannah: {
    fillVar: '--pastel-gold',
    fillFallback: '#f1e2b6',
    accentVar: '--sand',
    accentFallback: '#f0cfac',
    label: 'Savannah — broad, dispersed network'
  },
  wetland: {
    fillVar: '--shallow',
    fillFallback: '#a7abb9',
    accentVar: '--pastel-blue',
    accentFallback: '#dceafa',
    label: 'Wetland — seasonal, event-driven'
  },
  island: {
    fillVar: '--shore',
    fillFallback: '#eae7da',
    accentVar: '--pastel-lilac',
    accentFallback: '#e8e0f1',
    label: 'Island — specialised, isolated'
  }
};

export const HABITAT_ORDER: HabitatType[] = ['forest', 'reef', 'savannah', 'wetland', 'island'];

export function habitatFillColor(habitat: HabitatType): string {
  const meta = HABITAT_META[habitat];
  return tokenColor(meta.fillVar, meta.fillFallback);
}

export function habitatAccentColor(habitat: HabitatType): string {
  const meta = HABITAT_META[habitat];
  return tokenColor(meta.accentVar, meta.accentFallback);
}

function nodeRadius(node: GraphNode): number {
  return node.kind === 'organisation' ? 15 : 9;
}

function hitRadius(node: GraphNode): number {
  return node.kind === 'organisation' ? 21 : 15;
}

/** Pure hit-testing: last-drawn (last in array) wins on overlap, mirroring
 * normal canvas paint order. Exported and independently testable against
 * known coordinates — no simulation required. */
export function findNodeAt<T extends PositionedNode>(nodes: T[], x: number, y: number): T | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    if (Math.hypot(node.x - x, node.y - y) <= hitRadius(node)) return node;
  }
  return null;
}

function tooltipText(node: GraphNode): string {
  const parts = [node.label, node.kind === 'organisation' ? 'Organisation' : 'Person'];
  if (node.habitat) parts.push(HABITAT_META[node.habitat].label.split(' — ')[0]!);
  if (node.isBridge) parts.push('Bridge person');
  return parts.join(' · ');
}

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

function nodeShapePath(ctx: CanvasRenderingContext2D, node: SimNode, r: number): void {
  if (node.kind === 'organisation') {
    diamondPath(ctx, node.x!, node.y!, r);
  } else {
    ctx.arc(node.x!, node.y!, r, 0, Math.PI * 2);
  }
}

export function mountNetworkGraph(
  host: HTMLElement,
  initialNodes: GraphNode[],
  initialEdges: GraphEdge[],
  options: GraphMountOptions = {}
): GraphHandle {
  let destroyed = false;
  let simulation: Simulation<SimNode, SimLink> | null = null;
  let simNodes: SimNode[] = [];
  let simLinks: SimLink[] = [];
  let selectedId: string | null = null;
  let hoverNode: SimNode | null = null;

  host.replaceChildren();

  const width = host.clientWidth || 720;
  const height = Math.max(420, host.clientHeight || Math.floor((typeof window !== 'undefined' ? window.innerHeight : 720) * 0.55));

  const canvas = document.createElement('canvas');
  canvas.className = 'network-graph-canvas';
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.opacity = options.reducedMotion ? '1' : '0';
  canvas.style.transition = options.reducedMotion ? 'none' : 'opacity 220ms ease';
  host.append(canvas);

  const tip = document.createElement('div');
  tip.className = 'network-graph-tip';
  tip.hidden = true;
  host.append(tip);

  const ctx = canvas.getContext('2d');

  function positionedNodes(): SimNode[] {
    return simNodes.filter((n) => n.x != null && n.y != null);
  }

  function draw(): void {
    if (destroyed || !ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Habitat halos, per-node (documented decision above — no hull).
    for (const node of simNodes) {
      if (node.x == null || node.y == null || !node.habitat) continue;
      ctx.beginPath();
      ctx.fillStyle = habitatFillColor(node.habitat);
      ctx.globalAlpha = 0.4;
      ctx.arc(node.x, node.y, nodeRadius(node) + 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Edges.
    ctx.lineWidth = 1.25;
    for (const link of simLinks) {
      const s = typeof link.source === 'object' ? link.source : null;
      const t = typeof link.target === 'object' ? link.target : null;
      if (!s || !t || s.x == null || t.x == null || s.y == null || t.y == null) continue;
      ctx.strokeStyle = tokenColor('--wave', '#376fb7');
      ctx.globalAlpha = link.dormant ? 0.22 : 0.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Nodes.
    for (const node of simNodes) {
      if (node.x == null || node.y == null) continue;
      const r = nodeRadius(node);
      const isActive = node.id === selectedId || node === hoverNode;

      ctx.beginPath();
      nodeShapePath(ctx, node, r);
      ctx.fillStyle = isActive ? tokenColor('--wave', '#376fb7') : tokenColor('--navy', '#17375e');
      ctx.globalAlpha = node.dormant ? 0.5 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (node.isBridge) {
        ctx.beginPath();
        nodeShapePath(ctx, node, r + 5);
        ctx.strokeStyle = bridgeMarkerColor();
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      if (node.opportunitySignal) {
        ctx.beginPath();
        nodeShapePath(ctx, node, r + 9);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = opportunityMarkerColor();
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (isActive) {
        ctx.fillStyle = tokenColor('--ink', '#13233a');
        ctx.font = `12px ${tokenColor('--font-ui', 'Inter, sans-serif')}`;
        ctx.fillText(node.label.slice(0, 32), node.x + r + 8, node.y + 4);
      }
    }

    if (!options.reducedMotion) {
      // Fade-in happens once, on first successful draw — cheap and
      // idempotent to re-set every frame.
      canvas.style.opacity = '1';
    }
  }

  function toPlainNode(node: SimNode): GraphNode {
    const { x, y, vx, vy, fx, fy, ...rest } = node;
    return rest;
  }

  function handlePointer(event: MouseEvent): SimNode | null {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return findNodeAt(positionedNodes() as PositionedNode[], x, y) as SimNode | null;
  }

  function onMouseMove(event: MouseEvent): void {
    const node = handlePointer(event);
    if (node === hoverNode) return;
    hoverNode = node;
    if (node) {
      const rect = canvas.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = tooltipText(node);
      tip.style.left = `${event.clientX - rect.left + 12}px`;
      tip.style.top = `${event.clientY - rect.top + 12}px`;
    } else {
      tip.hidden = true;
    }
    options.onNodeHover?.(node ? toPlainNode(node) : null);
    draw();
  }

  function onClick(event: MouseEvent): void {
    const node = handlePointer(event);
    selectedId = node ? node.id : null;
    draw();
    options.onNodeSelect?.(node ? toPlainNode(node) : null);
  }

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', () => {
    hoverNode = null;
    tip.hidden = true;
    draw();
  });
  canvas.addEventListener('click', onClick);

  function build(nodes: GraphNode[], edges: GraphEdge[]): void {
    simulation?.stop();

    simNodes = nodes.map((n) => ({ ...n }));
    const idSet = new Set(simNodes.map((n) => n.id));
    simLinks = edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relationshipType: e.relationshipType,
        layer: e.layer,
        dormant: e.dormant
      }));

    if (!simNodes.length) {
      simulation = null;
      draw();
      return;
    }

    simulation = forceSimulation(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((n) => n.id)
          .distance(90)
          .strength(0.4)
      )
      .force('charge', forceManyBody<SimNode>().strength(-520))
      .force('x', forceX<SimNode>(width / 2).strength(0.05))
      .force('y', forceY<SimNode>(height / 2).strength(0.05))
      .force('collide', forceCollide<SimNode>().radius((n) => nodeRadius(n) + 12))
      .on('tick', () => {
        if (!options.reducedMotion) draw();
      });

    if (options.reducedMotion) {
      simulation.stop();
      for (let i = 0; i < 300; i++) simulation.tick();
      draw();
    } else {
      simulation.alpha(1).restart();
    }
  }

  build(initialNodes, initialEdges);

  return {
    destroy(): void {
      destroyed = true;
      simulation?.stop();
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      host.replaceChildren();
    },
    setData(nodes: GraphNode[], edges: GraphEdge[]): void {
      if (destroyed) return;
      selectedId = null;
      hoverNode = null;
      build(nodes, edges);
    }
  };
}
