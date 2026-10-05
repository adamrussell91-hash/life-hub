import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import {
  SHOW_ALL_RETUNE_MS,
  SHOW_ALL_STRAND_WIDTH,
  showAllStrandWidth,
  fitViewBelowInset,
  applyForceStageResize,
  applyShowAllTuning,
  attachGraphSearch,
  canvasRadius,
  constellationCollisionRadius,
  constellationLinkDistance,
  constellationLinkStrength,
  constellationNodeCharge,
  constellationTargetStrength,
  fitViewToNodes,
  focusViewOnNode,
  forceStageSize,
  initialForceView,
  linkDrawState,
  nodeDrawState,
  nodeHoverTip,
  overlapLinkAlpha,
  resolveBackgroundClick,
  resolveEnterKey,
  resolveNodeClick,
  showAllShape,
  showAllTuningRestarts,
  simulationNodes,
  type ForceGraphVariant,
  type GraphMount,
  type ShowAllTuning,
  type ViewState,
} from "./forceGraphBehavior";
import {
  applyConstellationHubClick,
  collapseConstellation,
  type ArchiveGraphModel,
  type GraphLinkDatum,
  type GraphNodeDatum,
} from "./keywordGraph";
import { selectionCluster } from "./graphFocus";
import { hubLabelVariants, placeHubLabels, readShowAllTheme, type ShowAllTheme } from "./showAllDraw";
import { layoutShowAll } from "./showAllGraph";
import { branchLoads, placeTopicAnchors } from "./showAllNeural";
import { createDock, el, readSavedViews, writeSavedViews, type Dock, type DockTool } from "./showAllDock";
import {
  RECENT_WINDOWS,
  grownBy,
  growthSpan,
  isRecent,
  keyBridges,
  missingLinks,
  noteTime,
  shortestNotePath,
  topicRepresentative,
  walkRoute,
  type RecentWindow,
} from "./showAllInsights";
import type { RelaxLink, RelaxNode, RelaxShape } from "./showAllRelax";
import { cachedRelax, relaxNow, relaxRunsInWorker, requestRelax } from "./showAllRelaxClient";
import {
  SHOW_ALL_MORPH_MS,
  SHOW_ALL_REVEAL_MS,
  applyShowAllMorph,
  easeOutCubic,
  planShowAllMorph,
  tweenView,
  type ShowAllMorph,
} from "./showAllLayout";

export type { ForceGraphVariant };

export type ForceGraphHandlers = {
  onNoteSelect?: (note: { pageId: string; title: string; excerpt: string } | null) => void;
};

export type ForceGraphOptions = {
  variant: ForceGraphVariant;
  search: string;
  excerptFor: (pageId: string) => string;
};

function curve(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const bend = Math.min(120, dist * 0.22);
  const cx = mx - (dy / dist) * bend;
  const cy = my + (dx / dist) * bend;
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
}

function linkEnds(link: GraphLinkDatum, map: Map<string, GraphNodeDatum>) {
  const source = typeof link.source === "string" ? map.get(link.source) : link.source;
  const target = typeof link.target === "string" ? map.get(link.target) : link.target;
  return { source, target };
}

export function mountForceGraph(
  host: HTMLElement,
  model: ArchiveGraphModel,
  handlers: ForceGraphHandlers,
  options: ForceGraphOptions = { variant: "constellation", search: "", excerptFor: () => "" },
): GraphMount {
  let { width, height } = forceStageSize(host, window);
  host.innerHTML = "";
  host.style.height = `${height}px`;
  const onNoteSelect = handlers.onNoteSelect ?? (() => {});

  const canvas = document.createElement("canvas");
  canvas.className = "graph-canvas";
  canvas.width = Math.floor(width * devicePixelRatio);
  canvas.height = Math.floor(height * devicePixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  host.appendChild(canvas);

  const tip = document.createElement("div");
  tip.className = "graph-tip";
  tip.hidden = true;
  host.appendChild(tip);

  const ctx = canvas.getContext("2d")!;
  const showAllMode = options.variant === "showAll";
  const anchor = model.nodes.find(node => node.kind === "major" && node.x != null && node.y != null);
  const view = initialForceView(options.variant, width, height, {
    x: anchor?.x ?? 760,
    y: anchor?.y ?? 560,
  });
  if (options.variant === "constellation") {
    const fitted = fitViewToNodes(model.nodes, width, height, 72, 0.2);
    if (fitted) Object.assign(view, fitted);
  }

  let hover: GraphNodeDatum | null = null;
  let selected: string | null = null;
  let dragged: GraphNodeDatum | null = null;

  let liveModel = model;
  let simNodes: GraphNodeDatum[] = model.nodes.map(node => ({ ...node, opacity: 1 }));
  let simLinks: GraphLinkDatum[] = model.links.map(link => ({ ...link }));
  let nodeMap = new Map(simNodes.map(node => [node.id, node]));
  let maxWeight = 1;
  for (const link of simLinks) if (link.weight > maxWeight) maxWeight = link.weight;
  let drawRaf = 0;
  let retuneTimer = 0;
  let simulation: Simulation<GraphNodeDatum, GraphLinkDatum> = createSimulation();

  // Show All: one deterministic layout, no physics. Every change of picture is an animation.
  let morph: { plan: ShowAllMorph; start: number; duration: number } | null = null;
  let camera: { from: ViewState; to: ViewState; start: number; duration: number } | null = null;
  let revealStart = 0;
  let animRaf = 0;
  let viewTouched = false;

  function refreshLookups() {
    nodeMap = new Map(simNodes.map(node => [node.id, node]));
    maxWeight = 1;
    for (const link of simLinks) if (link.weight > maxWeight) maxWeight = link.weight;
  }

  /** The toolbar floats over the top of the stage; never fit the map underneath it. */
  function topInset() {
    const toolbar = host.parentElement?.querySelector<HTMLElement>(".graph-toolbar");
    if (!toolbar) return 0;
    const bar = toolbar.getBoundingClientRect();
    const stage = host.getBoundingClientRect();
    const overlap = bar.bottom - stage.top;
    return overlap > 0 && overlap < height * 0.6 ? overlap : 0;
  }

  function fitShowAll(nodes: GraphNodeDatum[] = simNodes) {
    return fitViewBelowInset(
      nodes.filter(node => !node.departing),
      width,
      height,
      topInset(),
      width < 520 ? 18 : 48,
      0.04,
    );
  }

  function tickAnimations() {
    animRaf = 0;
    const now = performance.now();
    let running = false;
    if (revealStart) {
      const progress = (now - revealStart) / SHOW_ALL_REVEAL_MS;
      canvas.style.opacity = String(easeOutCubic(progress));
      if (progress >= 1) {
        revealStart = 0;
        canvas.style.opacity = "";
      } else running = true;
    }
    if (morph) {
      const progress = (now - morph.start) / morph.duration;
      simNodes = applyShowAllMorph(morph.plan, progress);
      if (progress >= 1) {
        morph = null;
        refreshLookups();
      } else running = true;
    }
    if (camera) {
      const progress = (now - camera.start) / camera.duration;
      Object.assign(view, tweenView(camera.from, camera.to, progress));
      if (progress >= 1) camera = null;
      else running = true;
    }
    draw();
    if (running) animRaf = requestAnimationFrame(tickAnimations);
  }

  function kickAnimations() {
    if (!animRaf) animRaf = requestAnimationFrame(tickAnimations);
  }

  function moveCamera(to: ViewState | null, duration = 520) {
    if (!to) return;
    camera = { from: { ...view }, to, start: performance.now(), duration };
    kickAnimations();
  }

  function startMorph(settled: GraphNodeDatum[], duration: number) {
    // Fit to where the notes are going, before the plan rewinds them to where they are now.
    const target = !viewTouched || duration >= SHOW_ALL_MORPH_MS ? fitShowAll(settled) : null;
    if (target) overviewK = target.k;
    const plan = planShowAllMorph(simNodes, settled);
    simNodes = plan.nodes;
    refreshLookups();
    morph = { plan, start: performance.now(), duration };
    moveCamera(target, duration);
    kickAnimations();
  }

  /** Centre a node in the visible part of the stage (below the toolbar). */
  function focusShowAll(node: GraphNodeDatum, k: number) {
    const framed = focusViewOnNode(node, width, height, k);
    if (!framed) return null;
    return { ...framed, y: framed.y + topInset() / 2 };
  }

  // Neural relax: seed (instant) → relaxed off-screen → shown. A token drops stale results.
  let loads = new Map<string, number>();
  let loadsFor: GraphLinkDatum[] | null = null;
  /** The zoom the overview was fitted at; topic names wait until you zoom well past it. */
  let overviewK = 0;
  let zoneLabelBoxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  let theme: ShowAllTheme = readShowAllTheme();
  let relaxToken = 0;
  let disposed = false;
  let growing = false;

  function relaxShape(): RelaxShape {
    const shape = showAllShape();
    return { spread: shape.spread, gather: 0.5 + shape.lean * 0.83 };
  }

  function relaxInput(nodes: GraphNodeDatum[], links: GraphLinkDatum[]) {
    const leaves = nodes.filter(node => node.kind === "leaf" && !node.departing);
    const relaxNodes: RelaxNode[] = leaves.map(node => ({ id: node.id, x: node.x ?? 0, y: node.y ?? 0 }));
    const relaxLinks: RelaxLink[] = [];
    for (const link of links) {
      if (link.kind !== "backbone" && link.kind !== "overlap") continue;
      relaxLinks.push({
        source: typeof link.source === "string" ? link.source : link.source.id,
        target: typeof link.target === "string" ? link.target : link.target.id,
        backbone: link.kind === "backbone",
      });
    }
    return { leaves, relaxNodes, relaxLinks };
  }

  function applyRelaxed(nodes: GraphNodeDatum[], leaves: GraphNodeDatum[], positions: Float64Array, links: GraphLinkDatum[]) {
    if (positions.length !== leaves.length * 2) return;
    leaves.forEach((node, i) => {
      const x = positions[i * 2]!;
      const y = positions[i * 2 + 1]!;
      node.x = x;
      node.y = y;
      node.fx = x;
      node.fy = y;
      node.vx = 0;
      node.vy = 0;
    });
    placeTopicAnchors(nodes, links);
  }

  /**
   * Seed `nodes`, relax them, then call `ready`. Inline when there is no worker or it is cached.
   * While the first map is still growing, whichever layout lands first is simply revealed — a
   * newer request (grouping, slider) supersedes the first one rather than leaving it stuck.
   */
  function growLayout(nodes: GraphNodeDatum[], links: GraphLinkDatum[], whenShown: (nodes: GraphNodeDatum[]) => void) {
    const token = ++relaxToken;
    const ready = (laidOut: GraphNodeDatum[]) => {
      if (!growing) {
        whenShown(laidOut);
        return;
      }
      simNodes = laidOut;
      simLinks = links;
      refreshLookups();
      reveal();
    };
    layoutShowAll(nodes, liveModel.hubTies ?? [], showAllShape(), links);
    const { leaves, relaxNodes, relaxLinks } = relaxInput(nodes, links);
    const shape = relaxShape();
    const hit = cachedRelax(relaxNodes, relaxLinks, shape) ?? (relaxRunsInWorker() ? null : relaxNow(relaxNodes, relaxLinks, shape));
    if (hit) {
      applyRelaxed(nodes, leaves, hit, links);
      ready(nodes);
      return;
    }
    void requestRelax(relaxNodes, relaxLinks, shape).then(positions => {
      if (token !== relaxToken || disposed) return;
      applyRelaxed(nodes, leaves, positions, links);
      ready(nodes);
    });
  }

  function reveal() {
    growing = false;
    const fitted = fitShowAll();
    if (fitted) {
      Object.assign(view, {
        k: fitted.k * 0.94,
        x: width / 2 - (width / 2 - fitted.x) * 0.94,
        y: height / 2 - (height / 2 - fitted.y) * 0.94,
      });
      camera = { from: { ...view }, to: fitted, start: performance.now(), duration: SHOW_ALL_REVEAL_MS };
      overviewK = fitted.k;
    }
    canvas.style.opacity = "0";
    revealStart = performance.now();
    placeDock();
    kickAnimations();
  }



  function scheduleDraw() {
    if (drawRaf) return;
    drawRaf = requestAnimationFrame(() => {
      drawRaf = 0;
      draw();
    });
  }

  function onScreen(x: number, y: number, pad = 64) {
    const sx = view.x + x * view.k;
    const sy = view.y + y * view.k;
    return sx >= -pad && sy >= -pad && sx <= width + pad && sy <= height + pad;
  }

  function createSimulation(alpha = 0.86) {
    const nodesForSim = simulationNodes(options.variant, simNodes);
    if (showAllMode) return forceSimulation<GraphNodeDatum>([]).stop();
    const sim = forceSimulation(nodesForSim)
      .force(
        "link",
        forceLink<GraphNodeDatum, GraphLinkDatum>(simLinks)
          .id(node => node.id)
          .distance(constellationLinkDistance)
          .strength(constellationLinkStrength),
      )
      .force(
        "charge",
        forceManyBody<GraphNodeDatum>().strength(constellationNodeCharge).distanceMax(1200),
      )
      .force(
        "x",
        forceX<GraphNodeDatum>(node => node.x ?? 760).strength(constellationTargetStrength),
      )
      .force(
        "y",
        forceY<GraphNodeDatum>(node => node.y ?? 560).strength(constellationTargetStrength),
      )
      .force(
        "collide",
        forceCollide<GraphNodeDatum>().radius(constellationCollisionRadius).strength(0.95),
      )
      .alpha(alpha)
      .alphaDecay(0.02)
      .velocityDecay(0.4)
      .on("tick", scheduleDraw);

    return sim;
  }

  function restartSimulation(alpha?: number) {
    simulation.stop();
    simulation = createSimulation(alpha);
  }

  function setTuning(partial: Partial<ShowAllTuning>) {
    applyShowAllTuning(partial);
    scheduleDraw();
    if (options.variant !== "showAll" || !showAllTuningRestarts(partial)) return;
    window.clearTimeout(retuneTimer);
    retuneTimer = window.setTimeout(() => {
      const settled = simNodes.filter(node => !node.departing).map(node => ({ ...node, opacity: 1 }));
      growLayout(settled, simLinks, nodes => startMorph(nodes, SHOW_ALL_MORPH_MS * 0.7));
    }, SHOW_ALL_RETUNE_MS);
  }

  function setModel(next: ArchiveGraphModel) {
    liveModel = next;
    const settled = next.nodes.map(node => ({ ...node, opacity: 1 }));
    const nextLinks = next.links.map(link => ({ ...link }));
    if (selected && !settled.some(node => node.label === selected)) {
      selected = null;
      onNoteSelect(null);
    }
    growLayout(settled, nextLinks, nodes => {
      simLinks = nextLinks;
      viewTouched = false;
      startMorph(nodes, SHOW_ALL_MORPH_MS);
    });
  }

  function byId() {
    return nodeMap;
  }

  function applyConstellationView(nodes: GraphNodeDatum[], expandedLabel: string | null) {
    if (expandedLabel) {
      const hub = nodes.find(node => node.kind !== "leaf" && node.label === expandedLabel);
      const focused = hub ? focusViewOnNode(hub, width, height) : null;
      if (focused) Object.assign(view, focused);
      return;
    }
    const fitted = fitViewToNodes(nodes, width, height, 72, 0.2);
    if (fitted) Object.assign(view, fitted);
  }

  function collapseLeaves() {
    const next = collapseConstellation(liveModel, simNodes);
    simNodes = next.nodes;
    simLinks = next.links;
    refreshLookups();
  }

  function expandHub(label: string) {
    const next = applyConstellationHubClick(liveModel, simNodes, label);
    simNodes = next.nodes;
    simLinks = next.links;
    selected = next.expandedLabel;
    refreshLookups();
    applyConstellationView(simNodes, next.expandedLabel);
    restartSimulation();
  }

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  };

  const findNode = (x: number, y: number) => {
    let hit: GraphNodeDatum | null = null;
    let best = Infinity;
    for (let i = simNodes.length - 1; i >= 0; i--) {
      const node = simNodes[i];
      if (node.departing) continue;
      if (showAllMode && node.kind === "major") continue;
      const dx = (node.x ?? 0) - x;
      const dy = (node.y ?? 0) - y;
      const dist = Math.hypot(dx, dy);
      const minPx = node.kind === "major" ? (showAllMode ? 14 : 6) : node.kind === "minor" ? 4 : 2.4;
      const hitR = canvasRadius(node.r, view.k, options.variant === "showAll" ? minPx : 1.6);
      const pad = node.kind === "major" ? 8 : node.kind === "minor" ? 6 : 4;
      if (dist <= hitR + pad && dist < best) {
        best = dist;
        hit = node;
      }
    }
    if (!hit && showAllMode) {
      // A zone is picked by its label.
      for (const [id, box] of zoneLabelBoxes) {
        if (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) return nodeMap.get(id) ?? null;
      }
    }
    return hit;
  };

  function drawArgs() {
    const cluster = selectionCluster(simNodes, selected, simLinks);
    return { query: options.search, nodes: simNodes, selected, hover, links: simLinks, cluster };
  }

  function draw() {
    const map = byId();
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);

    const emphasis = drawArgs();
    if (showAllMode) {
      drawShowAllFrame(map, emphasis);
      ctx.restore();
      return;
    }

    for (const link of simLinks) {
      const { source, target } = linkEnds(link, map);
      if (!source || !target || source.x == null || target.x == null || source.y == null || target.y == null) continue;
      if (source.departing || target.departing) continue;
      const { active, dim } = linkDrawState(link, source, target, emphasis);
      const fade = Math.min(source.opacity ?? 1, target.opacity ?? 1);

      ctx.beginPath();
      curve(ctx, source.x, source.y, target.x, target.y);

      if (link.kind === "spoke") {
        ctx.setLineDash([4 / view.k, 5 / view.k]);
        ctx.strokeStyle = active ? "#e07a2f" : link.color;
        ctx.globalAlpha = (dim ? 0.05 : active ? 0.75 : 0.4) * fade;
        ctx.lineWidth = 1.1 / view.k;
      } else if (link.kind === "orbit") {
        ctx.setLineDash([3 / view.k, 6 / view.k]);
        ctx.strokeStyle = active ? "#e07a2f" : link.color;
        ctx.globalAlpha = (dim ? 0.06 : active ? 0.7 : 0.28) * fade;
        ctx.lineWidth = 1.4 / view.k;
      } else {
        ctx.setLineDash([]);
        const thick = 1 + (link.weight / maxWeight) * 4.5;
        if (active) {
          ctx.strokeStyle = "#e07a2f";
          ctx.globalAlpha = 0.9 * fade;
          ctx.lineWidth = (thick + 1.4) / view.k;
        } else {
          ctx.strokeStyle = link.color;
          ctx.globalAlpha = (dim ? 0.05 : link.kind === "overlap" || link.kind === "backbone" ? overlapLinkAlpha() : 0.2) * fade;
          ctx.lineWidth = thick / view.k;
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.globalAlpha = 1;
    }

    for (const node of simNodes) {
      if (node.kind !== "leaf" || node.x == null || node.y == null) continue;
      if (options.variant === "showAll" && !onScreen(node.x, node.y)) continue;
      const { hot, dim } = nodeDrawState(node, emphasis);
      const drawR = canvasRadius(node.r, view.k, options.variant === "showAll" ? 2.4 : 1.6);
      ctx.beginPath();
      ctx.arc(node.x, node.y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = dim ? 0.18 : hot ? 1 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1 / view.k;
      ctx.strokeStyle = "#fff";
      ctx.stroke();

      const parentOpen = simNodes.some(
        item => item.kind !== "leaf" && item.label === node.parentKeyword && item.expanded,
      );
      if (parentOpen || hover === node || view.k > 0.85) {
        ctx.fillStyle = dim ? "rgba(19, 35, 58, 0.35)" : node.ink;
        ctx.font = `500 ${Math.max(10, 11 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const text = node.label.length > 36 ? `${node.label.slice(0, 35)}…` : node.label;
        ctx.fillText(text, node.x + drawR + 6, node.y);
      }
    }

    for (const node of simNodes) {
      if (node.kind !== "minor" || node.x == null || node.y == null) continue;
      const { hot, dim } = nodeDrawState(node, emphasis);
      const drawR = canvasRadius(node.r, view.k, options.variant === "showAll" ? 4 : 2.8);
      ctx.beginPath();
      ctx.arc(node.x, node.y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.globalAlpha = dim ? 0.25 : hot ? 1 : 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = (hot ? 2.4 : 1.2) / view.k;
      ctx.strokeStyle = hot ? "#e07a2f" : "#fff";
      ctx.stroke();

      ctx.strokeStyle = node.ink;
      ctx.lineWidth = 1.4 / view.k;
      ctx.beginPath();
      if (node.expanded) {
        ctx.moveTo(node.x - 3.5, node.y);
        ctx.lineTo(node.x + 3.5, node.y);
      } else {
        ctx.moveTo(node.x - 3.5, node.y);
        ctx.lineTo(node.x + 3.5, node.y);
        ctx.moveTo(node.x, node.y - 3.5);
        ctx.lineTo(node.x, node.y + 3.5);
      }
      ctx.stroke();

      if (view.k > 0.55 || hot) {
        ctx.fillStyle = dim ? "rgba(19, 35, 58, 0.35)" : node.ink;
        ctx.font = `600 ${Math.max(11, 12 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const text = node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label;
        ctx.fillText(text, node.x + node.r + 7, node.y);
      }
    }

    for (const node of simNodes) {
      if (node.kind !== "major" || node.x == null || node.y == null) continue;
      const { hot, dim } = nodeDrawState(node, emphasis);
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(
        node.x - node.r * 0.3,
        node.y - node.r * 0.3,
        4,
        node.x,
        node.y,
        node.r,
      );
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.45, node.soft);
      gradient.addColorStop(1, node.color);
      ctx.globalAlpha = dim ? 0.28 : 1;
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = (hot ? 3 : 1.6) / view.k;
      ctx.strokeStyle = hot ? "#e07a2f" : node.ink;
      ctx.stroke();

      ctx.fillStyle = node.ink;
      ctx.font = `700 ${Math.max(14, 16 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.fillText(node.expanded ? "−" : "+", node.x, node.y + 1);

      if (view.k > 0.4) {
        ctx.font = `600 ${Math.max(12, 14 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(node.label, node.x, node.y + node.r + 10);
        ctx.font = `500 ${Math.max(10, 11 / Math.sqrt(view.k))}px Inter, ui-sans-serif, sans-serif`;
        ctx.fillStyle = dim ? "rgba(19, 35, 58, 0.28)" : "rgba(19, 35, 58, 0.62)";
        const shown = simNodes.filter(
          item => item.kind === "leaf" && item.parentKeyword === node.label,
        ).length;
        ctx.fillText(
          node.expanded && shown < node.count ? `showing ${shown} of ${node.count}` : `${node.count} notes`,
          node.x,
          node.y + node.r + 28,
        );
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }


  /** Topic colour lifted toward white (dark field) or deepened (light field). */
  function tint(hex: string, amount: number) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1]!, 16);
    const shift = (c: number) =>
      theme === "dark" ? Math.round(c + (255 - c) * amount) : Math.round(c * (1 - amount));
    return `rgb(${shift((n >> 16) & 255)}, ${shift((n >> 8) & 255)}, ${shift(n & 255)})`;
  }

  function hashUnit(seed: string) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
  }

  /** A fibre: a gentle, stable bend per link so branches read organic, not ruled. */
  function fibre(source: GraphNodeDatum, target: GraphNodeDatum, key: string) {
    const dx = target.x! - source.x!;
    const dy = target.y! - source.y!;
    const bend = (hashUnit(key) - 0.5) * 0.6;
    ctx.moveTo(source.x!, source.y!);
    ctx.quadraticCurveTo((source.x! + target.x!) / 2 - dy * bend, (source.y! + target.y!) / 2 + dx * bend, target.x!, target.y!);
  }

  function drawShowAllFrame(map: Map<string, GraphNodeDatum>, emphasis: ReturnType<typeof drawArgs>) {
    const dark = theme === "dark";
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = dark ? "#03050a" : "#f7f3ea";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (growing) {
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.fillStyle = dark ? "rgba(244, 239, 230, 0.55)" : "rgba(19, 35, 58, 0.5)";
      ctx.font = "500 13px Inter, ui-sans-serif, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Growing your map…", width / 2, topInset() + (height - topInset()) / 2);
    }
    ctx.restore();
    if (growing) return;

    if (loadsFor !== simLinks) {
      loads = branchLoads(simNodes, simLinks);
      loadsFor = simLinks;
    }
    const highlighting = Boolean(hover || selected || options.search.trim()) && !pathSet;
    const base = overlapLinkAlpha();
    const widthScale = showAllStrandWidth() / SHOW_ALL_STRAND_WIDTH;
    type Fibre = [GraphNodeDatum, GraphNodeDatum, string];
    const batches = new Map<string, { color: string; alpha: number; width: number; fibres: Fibre[] }>();
    const active: Fibre[] = [];
    for (const link of simLinks) {
      if (link.kind !== "overlap" && link.kind !== "backbone") continue;
      const { source, target } = linkEnds(link, map);
      if (!source || !target || source.x == null || target.x == null || source.y == null || target.y == null) continue;
      if (source.departing || target.departing) continue;
      if (!onScreen(source.x, source.y, 200) && !onScreen(target.x, target.y, 200)) continue;
      const key = source.id < target.id ? `${source.id}|${target.id}` : `${target.id}|${source.id}`;
      const sourceLayer = overlayOf(source);
      const targetLayer = overlayOf(target);
      if (!sourceLayer.show || !targetLayer.show) continue;
      if (pathEdges?.has(key)) {
        active.push([source, target, key]);
        continue;
      }
      if (highlighting && linkDrawState(link, source, target, emphasis).active) {
        active.push([source, target, key]);
        continue;
      }
      const fade = Math.min(source.opacity ?? 1, target.opacity ?? 1) * Math.min(sourceLayer.weight, targetLayer.weight);
      const backbone = link.kind === "backbone";
      // Trunks thick, twigs fine: width follows how many notes the branch carries.
      const load = backbone ? (loads.get(key) ?? 1) : 0;
      const width = backbone ? Math.round((0.5 + Math.min(3.2, Math.log2(1 + load) * 0.55)) * 4) / 4 : 0.6;
      const color = tint(source.color, dark ? 0.08 : 0.15);
      const alpha = Math.min(1, (highlighting ? 0.25 : 1) * (backbone ? base * 1.7 : base * 0.5) * fade);
      const bucket = `${color}|${alpha.toFixed(2)}|${width}`;
      const batch = batches.get(bucket) ?? { color, alpha, width, fibres: [] };
      batch.fibres.push([source, target, key]);
      batches.set(bucket, batch);
    }
    ctx.globalCompositeOperation = dark ? "lighter" : "multiply";
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    for (const batch of batches.values()) {
      ctx.beginPath();
      for (const [source, target, key] of batch.fibres) fibre(source, target, key);
      ctx.strokeStyle = batch.color;
      ctx.globalAlpha = batch.alpha;
      ctx.lineWidth = (batch.width * widthScale) / view.k;
      ctx.stroke();
    }

    // Notes: small cell bodies; well-linked ones get a soft glow (dark) or wash (light).
    for (const node of simNodes) {
      if (node.kind !== "leaf" || node.x == null || node.y == null) continue;
      if (!onScreen(node.x, node.y)) continue;
      const layer = overlayOf(node);
      if (!layer.show) continue;
      const state = nodeDrawState(node, emphasis);
      const hot = state.hot || layer.mark;
      const dim = state.dim && !layer.mark;
      const fade = (node.opacity ?? 1) * (dim ? 0.25 : 1) * layer.weight;
      const degree = node.degree ?? 0;
      if (degree >= 5 || hot) {
        const haloR = ((hot ? 10 : 3 + Math.min(degree, 14) * 1.1) * 0.7) / view.k;
        const halo = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, haloR);
        halo.addColorStop(0, tint(node.color, dark ? 0.55 : 0.1));
        halo.addColorStop(1, dark ? "rgba(0, 0, 0, 0)" : "rgba(255, 255, 255, 0)");
        ctx.fillStyle = halo;
        ctx.globalAlpha = (hot ? 0.9 : dark ? 0.32 : 0.45) * fade;
        ctx.beginPath();
        ctx.arc(node.x, node.y, haloR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = hot ? (dark ? "#fff3e6" : "#a8501a") : tint(node.color, dark ? 0.3 : 0.2);
      ctx.globalAlpha = (hot ? 1 : dark ? 0.85 : 0.75) * fade;
      ctx.beginPath();
      ctx.arc(node.x, node.y, ((hot ? 2.6 : 0.9 + Math.min(degree, 10) * 0.18) * 1.1) / view.k, 0, Math.PI * 2);
      ctx.fill();
    }

    if (active.length) {
      ctx.beginPath();
      for (const [source, target, key] of active) fibre(source, target, key);
      ctx.strokeStyle = dark ? "#ffb070" : "#c25a14";
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = (2 * widthScale) / view.k;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    const ink = dark ? "#f4efe6" : "#13233a";
    const halo = dark ? "rgba(3, 5, 10, 0.85)" : "rgba(247, 243, 234, 0.9)";
    // Words stay out of the overview. Topic names appear only once you zoom in (or for the topic
    // you are hovering or have selected), and then only where they do not collide (C1).
    const zoomedIn = overviewK > 0 && view.k >= overviewK * 1.7;
    const zones = simNodes.filter(
      node =>
        node.kind === "major" &&
        !node.departing &&
        node.x != null &&
        node.y != null &&
        (zoomedIn || node === hover || node.label === selected),
    );
    zones.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const labelFont = `600 ${12 / view.k}px Inter, ui-sans-serif, sans-serif`;
    ctx.font = labelFont;
    const labels = placeHubLabels(
      zones.map(node => ({
        id: node.id,
        x: node.x!,
        y: node.y!,
        coreR: 0,
        pinned: node === hover || node.label === selected,
        candidates: hubLabelVariants(node.label).map(text => ({ text, width: ctx.measureText(text).width })),
      })),
      15 / view.k,
      0,
      {
        x0: (4 - view.x) / view.k,
        y0: (topInset() - view.y) / view.k,
        x1: (width - 4 - view.x) / view.k,
        y1: (height - 4 - view.y) / view.k,
      },
      28 / view.k,
    );
    zoneLabelBoxes = new Map([...labels].map(([id, label]) => [id, label.box]));
    // Zoom to reveal. Overview: no words. ~3× in: the knots (best-linked notes) are named.
    // ~6× in: every note on screen. Always: the hovered note, the selected note and a path's ends.
    // Every name goes through the collision pass, so nothing overprints (C1).
    const zoom = overviewK > 0 ? view.k / overviewK : 1;
    const noteFont = `500 ${11 / view.k}px Inter, ui-sans-serif, sans-serif`;
    ctx.font = noteFont;
    const wanted: Array<{ node: GraphNodeDatum; pinned: boolean }> = [];
    for (const node of simNodes) {
      if (node.kind !== "leaf" || node.x == null || node.y == null || !onScreen(node.x, node.y, 0)) continue;
      if (!overlayOf(node).show) continue;
      const pinned = node === hover || pathPicks.includes(node.id) || (Boolean(selected) && node.label === selected);
      const knot = (node.degree ?? 0) >= 7 && zoom >= 3.5;
      if (pinned || knot || zoom >= 8) wanted.push({ node, pinned });
    }
    wanted.sort((x, y) => Number(y.pinned) - Number(x.pinned) || (y.node.degree ?? 0) - (x.node.degree ?? 0) || x.node.id.localeCompare(y.node.id));
    // Topic names were placed first; note names keep clear of them.
    const topicBoxes = [...labels.values()].map((label, index) => ({
      id: `zone-box:${index}`,
      x: label.box.x0,
      y: label.box.y0,
      coreR: 0,
      keepOut: label.box,
      candidates: [],
    }));
    const noteLabels = placeHubLabels(
      [
        ...topicBoxes,
        ...wanted.slice(0, 160).map(({ node, pinned }) => {
          const text = node.label.length > 30 ? `${node.label.slice(0, 29)}…` : node.label;
          return { id: node.id, x: node.x!, y: node.y!, coreR: 4 / view.k, pinned, candidates: [{ text, width: ctx.measureText(text).width }] };
        }),
      ],
      14 / view.k,
      2 / view.k,
      {
        x0: (4 - view.x) / view.k,
        y0: (topInset() - view.y) / view.k,
        x1: (width - 4 - view.x) / view.k,
        y1: (height - 4 - view.y) / view.k,
      },
      3 / view.k,
    );
    for (const { node } of wanted) {
      const label = noteLabels.get(node.id);
      if (!label) continue;
      drawHaloText(label.text, (label.box.x0 + label.box.x1) / 2, (label.box.y0 + label.box.y1) / 2, {
        font: noteFont,
        align: "center",
        baseline: "middle",
        color: ink,
        alpha: (node.opacity ?? 1) * overlayOf(node).weight,
        halo,
      });
    }
    for (const node of zones) {
      const label = labels.get(node.id);
      if (!label) continue;
      const { hot, dim } = nodeDrawState(node, emphasis);
      drawHaloText(label.text, (label.box.x0 + label.box.x1) / 2, (label.box.y0 + label.box.y1) / 2, {
        font: labelFont,
        align: "center",
        baseline: "middle",
        color: hot && hover === node ? (dark ? "#ffb070" : "#c25a14") : tint(node.color, dark ? 0.55 : 0.35),
        alpha: (dim ? 0.3 : hot ? 1 : 0.8) * (node.opacity ?? 1),
        halo,
      });
    }


  }

  function drawHaloText(
    text: string,
    x: number,
    y: number,
    style: { font: string; align: CanvasTextAlign; baseline: CanvasTextBaseline; color: string; alpha: number; halo?: string },
  ) {
    ctx.font = style.font;
    ctx.textAlign = style.align;
    ctx.textBaseline = style.baseline;
    ctx.lineJoin = "round";
    ctx.globalAlpha = style.alpha;
    ctx.strokeStyle = style.halo ?? "rgba(251, 248, 242, 0.92)";
    ctx.lineWidth = 4 / view.k;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = style.color;
    ctx.fillText(text, x, y);
    ctx.lineJoin = "miter";
    ctx.globalAlpha = 1;
  }

  // ---------- Map tools: grow, path, recent, walk, bridges, save, export ----------
  let tool: DockTool | null = null;
  let growUntil: number | null = null;
  let growSpanWidth = 1;
  let growRaf = 0;
  let recentWindow: RecentWindow | null = null;
  let pathSet: Set<string> | null = null;
  let pathEdges: Set<string> | null = null;
  let pathPicks: string[] = [];
  let bridgeSet: Set<string> | null = null;
  let walkTimer = 0;
  const VISIBLE = { show: true, weight: 1, mark: false };
  const HIDDEN = { show: false, weight: 0, mark: false };

  function overlayOf(node: GraphNodeDatum) {
    if (!tool || tool === "save" || tool === "export" || tool === "walk") return VISIBLE;
    if (growUntil != null) {
      if (!grownBy(node, growUntil)) return HIDDEN;
      const time = noteTime(node);
      // Notes that have just grown glow for a moment.
      return { show: true, weight: 1, mark: time != null && growUntil - time < growSpanWidth * 0.025 };
    }
    let weight = 1;
    let mark = false;
    if (recentWindow) {
      if (isRecent(node, recentWindow, Date.now())) mark = true;
      else weight = 0.12;
    }
    if (pathSet) {
      if (pathSet.has(node.id)) mark = true;
      else weight = Math.min(weight, pathPicks.length ? 0.4 : 0.14);
    }
    if (bridgeSet) {
      if (bridgeSet.has(node.id)) mark = true;
      else weight = Math.min(weight, 0.3);
    }
    return { show: true, weight, mark };
  }

  const dock: Dock | null = showAllMode ? createDock(host, chooseTool) : null;

  function placeDock() {
    dock?.setTop(topInset() + 10);
  }

  function clearTool() {
    window.cancelAnimationFrame(growRaf);
    growRaf = 0;
    window.clearTimeout(walkTimer);
    walkTimer = 0;
    growUntil = null;
    recentWindow = null;
    pathSet = null;
    pathEdges = null;
    pathPicks = [];
    bridgeSet = null;
    tool = null;
    dock?.setActive(null);
    dock?.setPanel(null);
    scheduleDraw();
  }

  function chooseTool(next: DockTool) {
    if (growing) return;
    const same = tool === next;
    clearTool();
    if (same && next !== "export") return;
    if (next === "export") {
      exportImage();
      return;
    }
    tool = next;
    dock?.setActive(next);
    if (next === "grow") openGrow();
    if (next === "path") openPath();
    if (next === "recent") openRecent("month");
    if (next === "walk") startWalk();
    if (next === "bridges") openBridges();
    if (next === "save") openSave();
    scheduleDraw();
  }

  function leafById(id: string) {
    const node = nodeMap.get(id);
    return node && node.kind === "leaf" ? node : null;
  }

  function showNote(node: GraphNodeDatum, k?: number) {
    selected = node.label;
    if (node.pageId) onNoteSelect({ pageId: node.pageId, title: node.label, excerpt: options.excerptFor(node.pageId) });
    viewTouched = true;
    moveCamera(focusShowAll(node, k ?? Math.max(view.k, overviewK * 3)), 900);
    scheduleDraw();
  }

  function fitTo(ids: Iterable<string>) {
    const nodes = [...ids].map(id => nodeMap.get(id)).filter((node): node is GraphNodeDatum => Boolean(node));
    if (!nodes.length) return;
    viewTouched = true;
    moveCamera(fitViewBelowInset(nodes, width, height, topInset() + 60, Math.min(160, width * 0.18), 0.04), 900);
  }

  // Grow: replay the map in the order notes were written.
  function openGrow() {
    const span = growthSpan(simNodes);
    if (!span) {
      dock?.setPanel(el("p", { class: "neural-dock__note", text: "These notes have no dates to replay." }));
      return;
    }
    growSpanWidth = Math.max(1, span.last - span.first);
    const slider = el("input", { type: "range", min: "0", max: "1000", value: "0", "aria-label": "Point in time" });
    const when = el("span", { class: "neural-dock__when" });
    const play = el("button", { type: "button", text: "Pause" });
    const setAt = (fraction: number) => {
      growUntil = span.first + growSpanWidth * fraction;
      slider.value = String(Math.round(fraction * 1000));
      when.textContent = new Date(growUntil).toLocaleDateString(undefined, { month: "short", year: "numeric" });
      scheduleDraw();
    };
    let started = 0;
    let from = 0;
    const PLAY_MS = 16000;
    const frame = () => {
      const fraction = Math.min(1, from + (performance.now() - started) / PLAY_MS);
      setAt(fraction);
      if (fraction < 1) growRaf = requestAnimationFrame(frame);
      else {
        growRaf = 0;
        play.textContent = "Replay";
      }
    };
    const start = (at: number) => {
      from = at >= 1 ? 0 : at;
      started = performance.now();
      play.textContent = "Pause";
      window.cancelAnimationFrame(growRaf);
      growRaf = requestAnimationFrame(frame);
    };
    play.addEventListener("click", () => {
      if (growRaf) {
        window.cancelAnimationFrame(growRaf);
        growRaf = 0;
        play.textContent = "Play";
        return;
      }
      start(Number(slider.value) / 1000);
    });
    slider.addEventListener("input", () => {
      window.cancelAnimationFrame(growRaf);
      growRaf = 0;
      play.textContent = "Play";
      setAt(Number(slider.value) / 1000);
    });
    dock?.setPanel(el("div", { class: "neural-dock__grow" }, play, slider, when));
    viewTouched = false;
    moveCamera(fitShowAll(), 500);
    setAt(0);
    start(0);
  }

  // Path: click two notes (or a topic name) to see the chain that joins them.
  function openPath() {
    pathPicks = [];
    pathSet = new Set();
    pathEdges = new Set();
    renderPathPanel([]);
  }

  function renderPathPanel(route: string[]) {
    if (!dock) return;
    if (route.length < 2) {
      const text =
        pathPicks.length === 0
          ? "Click a note to start."
          : route.length === 0 && pathPicks.length === 2
            ? "Those two never connect."
            : "Now click the note to reach.";
      dock.setPanel(el("p", { class: "neural-dock__note", text }));
      return;
    }
    const list = el("ol", { class: "neural-dock__steps" });
    for (const id of route) {
      const node = leafById(id);
      if (!node) continue;
      const button = el("button", { type: "button", text: node.label });
      button.addEventListener("click", () => showNote(node));
      list.append(el("li", {}, button));
    }
    const again = el("button", { type: "button", class: "neural-dock__quiet", text: "New path" });
    again.addEventListener("click", openPath);
    dock.setPanel(el("div", {}, el("p", { class: "neural-dock__note", text: `${route.length - 1} steps` }), list, again));
  }

  function pickForPath(node: GraphNodeDatum) {
    const leaf = node.kind === "leaf" ? node : topicRepresentative(simNodes, node.label, simLinks);
    if (!leaf) return;
    if (pathPicks.length >= 2) pathPicks = [];
    pathPicks.push(leaf.id);
    pathSet = new Set(pathPicks);
    pathEdges = new Set();
    if (pathPicks.length === 2) {
      const route = shortestNotePath(simLinks, pathPicks[0]!, pathPicks[1]!);
      pathSet = new Set(route.length ? route : pathPicks);
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!;
        const b = route[i]!;
        pathEdges.add(a < b ? `${a}|${b}` : `${b}|${a}`);
      }
      if (route.length) fitTo(route);
      renderPathPanel(route);
    } else {
      renderPathPanel([]);
    }
    scheduleDraw();
  }

  // Recent: light up what was written in the last week / month / quarter / year.
  function openRecent(window: RecentWindow) {
    recentWindow = window;
    const now = Date.now();
    const count = simNodes.filter(node => node.kind === "leaf" && isRecent(node, window, now)).length;
    const group = el("div", { class: "neural-dock__segments", role: "group", "aria-label": "How recent" });
    for (const item of RECENT_WINDOWS) {
      const button = el("button", { type: "button", text: item.label, "aria-pressed": String(item.id === window) });
      if (item.id === window) button.classList.add("is-active");
      button.addEventListener("click", () => openRecent(item.id));
      group.append(button);
    }
    dock?.setPanel(el("div", {}, group, el("p", { class: "neural-dock__note", text: count ? `${count.toLocaleString()} notes` : "Nothing in that time." })));
    scheduleDraw();
  }

  // Walk: drift from note to linked note, opening each one.
  function startWalk() {
    const start = selected ? simNodes.find(node => node.kind === "leaf" && node.label === selected)?.id : undefined;
    const route = walkRoute(simNodes, simLinks, 60, start);
    let index = 0;
    const stop = el("button", { type: "button", text: "Stop" });
    stop.addEventListener("click", clearTool);
    dock?.setPanel(el("div", { class: "neural-dock__grow" }, stop));
    const step = () => {
      const node = route[index] ? leafById(route[index]!) : null;
      if (!node || tool !== "walk") {
        if (tool === "walk") clearTool();
        return;
      }
      showNote(node, Math.max(overviewK * 3.2, 0.3));
      index += 1;
      walkTimer = window.setTimeout(step, 3600);
    };
    step();
  }

  // Bridges: the notes that join topics, and the topics that never meet.
  function openBridges() {
    const bridges = keyBridges(simNodes, simLinks);
    bridgeSet = new Set(bridges.map(item => item.id));
    const bridgeList = el("ol", { class: "neural-dock__steps" });
    for (const bridge of bridges) {
      const node = leafById(bridge.id);
      if (!node) continue;
      const button = el("button", { type: "button", text: bridge.label, title: bridge.topics.join(" · ") });
      button.addEventListener("click", () => showNote(node));
      bridgeList.append(el("li", {}, button));
    }
    const gaps = missingLinks(simNodes, simLinks, liveModel.hubTies ?? []);
    const gapList = el("ul", { class: "neural-dock__steps" });
    for (const gap of gaps) {
      const button = el("button", { type: "button", text: `${shortName(gap.a)} · ${shortName(gap.b)}`, title: `${gap.a} and ${gap.b}` });
      button.addEventListener("click", () => {
        // Show the closest the two topics come: the path between their best-linked notes.
        const a = topicRepresentative(simNodes, gap.a, simLinks);
        const b = topicRepresentative(simNodes, gap.b, simLinks);
        if (!a || !b) return;
        tool = "path";
        dock?.setActive("path");
        bridgeSet = null;
        pathPicks = [a.id];
        pickForPath(b);
      });
      gapList.append(el("li", {}, button));
    }
    dock?.setPanel(
      el(
        "div",
        {},
        el("p", { class: "neural-dock__head", text: "Key bridges" }),
        bridgeList,
        gaps.length ? el("p", { class: "neural-dock__head", text: "Missing links" }) : null,
        gaps.length ? gapList : null,
      ),
    );
    fitTo(bridgeSet);
  }

  function shortName(label: string) {
    return label.split(/\s+and\s+/i)[0]!;
  }

  // Save: keep views by world centre and zoom relative to the overview, so they survive resizes.
  function openSave() {
    const render = () => {
      const views = readSavedViews();
      const list = el("ul", { class: "neural-dock__steps" });
      views.forEach((saved, index) => {
        const go = el("button", { type: "button", text: saved.name });
        go.addEventListener("click", () => {
          const k = saved.zoom * (overviewK || view.k);
          const centreY = topInset() + (height - topInset()) / 2;
          viewTouched = true;
          moveCamera({ k, x: width / 2 - saved.cx * k, y: centreY - saved.cy * k }, 800);
        });
        const remove = el("button", { type: "button", class: "neural-dock__quiet", text: "×", "aria-label": `Forget ${saved.name}` });
        remove.addEventListener("click", () => {
          writeSavedViews(views.filter((_, i) => i !== index));
          render();
        });
        list.append(el("li", { class: "neural-dock__saved" }, go, remove));
      });
      const save = el("button", { type: "button", text: "Save this view" });
      save.addEventListener("click", () => {
        const centreY = topInset() + (height - topInset()) / 2;
        const name = `View ${views.length + 1} · ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
        writeSavedViews([
          { name, cx: (width / 2 - view.x) / view.k, cy: (centreY - view.y) / view.k, zoom: view.k / (overviewK || view.k), at: new Date().toISOString() },
          ...views,
        ]);
        render();
      });
      dock?.setPanel(el("div", {}, save, views.length ? list : null));
    };
    render();
  }

  // Export: the current view, background included, as a PNG.
  function exportImage() {
    draw();
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `knowledge-map-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      viewTouched = true;
      camera = null;
      if (tool === "walk") clearTool();
      const world = toWorld(event.clientX, event.clientY);
      const minK = options.variant === "showAll" ? 0.05 : 0.28;
      const next = Math.min(2.4, Math.max(minK, view.k * (event.deltaY < 0 ? 1.08 : 0.92)));
      view.x = event.clientX - canvas.getBoundingClientRect().left - world.x * next;
      view.y = event.clientY - canvas.getBoundingClientRect().top - world.y * next;
      view.k = next;
      scheduleDraw();
    },
    { passive: false },
  );

  canvas.addEventListener("pointerdown", event => {
    const world = toWorld(event.clientX, event.clientY);
    const node = findNode(world.x, world.y);
    if (node) {
      dragged = node;
      node.fx = node.x;
      node.fy = node.y;
      if (options.variant !== "showAll") simulation.alphaTarget(0.15).restart();
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...view };
    const onMove = (move: PointerEvent) => {
      if (Math.hypot(move.clientX - startX, move.clientY - startY) >= 4) {
        viewTouched = true;
        camera = null;
      }
      view.x = origin.x + (move.clientX - startX);
      view.y = origin.y + (move.clientY - startY);
      scheduleDraw();
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (resolveBackgroundClick(Math.hypot(up.clientX - startX, up.clientY - startY)) === "clear") {
        selected = null;
        onNoteSelect(null);
        if (options.variant === "constellation") {
          collapseLeaves();
          applyConstellationView(simNodes, null);
          restartSimulation();
        } else {
          if (showAllMode) {
            viewTouched = false;
            moveCamera(fitShowAll());
          }
          scheduleDraw();
        }
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  canvas.addEventListener("pointermove", event => {
    const world = toWorld(event.clientX, event.clientY);
    if (dragged) {
      dragged.x = world.x;
      dragged.y = world.y;
      dragged.fx = world.x;
      dragged.fy = world.y;
      scheduleDraw();
      return;
    }
    const node = findNode(world.x, world.y);
    const hoverChanged = hover !== node;
    hover = node;
    canvas.style.cursor = node ? "pointer" : "grab";
    if (node) {
      tip.hidden = false;
      tip.textContent = nodeHoverTip(node);
      tip.style.left = `${event.clientX - host.getBoundingClientRect().left + 12}px`;
      tip.style.top = `${event.clientY - host.getBoundingClientRect().top + 12}px`;
    } else {
      tip.hidden = true;
    }
    if (hoverChanged) scheduleDraw();
  });

  canvas.addEventListener("pointerup", event => {
    if (!dragged) return;
    const node = dragged;
    dragged = null;
    if (options.variant === "showAll") {
      node.fx = node.x ?? 0;
      node.fy = node.y ?? 0;
    } else {
      node.fx = null;
      node.fy = null;
    }
    if (options.variant !== "showAll") simulation.alphaTarget(0);
    const world = toWorld(event.clientX, event.clientY);
    const still = findNode(world.x, world.y);
    if (!(still && still.id === node.id)) return;
    if (event.detail >= 2 && (node.kind === "major" || node.kind === "minor")) return;

    if (showAllMode && tool === "path") {
      pickForPath(node);
      return;
    }
    if (showAllMode && tool === "walk") clearTool();
    const action = resolveNodeClick(options.variant, node, selected, options.excerptFor);
    if (action.kind === "expandHub") {
      onNoteSelect(null);
      expandHub(action.label);
      return;
    }
    if (action.kind === "selectHub") {
      selected = action.selected;
      onNoteSelect(null);
      if (showAllMode && action.selected) {
        viewTouched = true;
        moveCamera(focusShowAll(node, Math.max(view.k, 0.42)));
      }
      scheduleDraw();
      return;
    }
    if (action.kind === "selectNote") {
      selected = action.selected;
      onNoteSelect(action.note);
      if (showAllMode) {
        viewTouched = true;
        moveCamera(focusShowAll(node, Math.max(view.k, 1.05)));
      }
      scheduleDraw();
    }
  });

  canvas.addEventListener("pointerleave", () => {
    hover = null;
    tip.hidden = true;
    scheduleDraw();
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && tool) {
      clearTool();
      return;
    }
    if (event.key !== "Enter") return;
    const note = resolveEnterKey(selected, simNodes, options.excerptFor);
    if (note) onNoteSelect(note);
  };
  window.addEventListener("keydown", onKeyDown);

  function applyHostSize() {
    const next = applyForceStageResize(
      { width, height, k: view.k, x: view.x, y: view.y },
      forceStageSize(host, window),
    );
    if (next.width === width && next.height === height) return;
    width = next.width;
    height = next.height;
    view.k = next.k;
    view.x = next.x;
    view.y = next.y;
    if (options.variant === "constellation" && !simNodes.some(node => node.expanded)) {
      const fitted = fitViewToNodes(simNodes, width, height, 72, 0.2);
      if (fitted) Object.assign(view, fitted);
    }
    if (showAllMode && !viewTouched) {
      const fitted = fitShowAll();
      if (fitted) {
        if (camera) camera.to = fitted;
        else Object.assign(view, fitted);
      }
    }
    canvas.width = Math.floor(width * devicePixelRatio);
    canvas.height = Math.floor(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    placeDock();
    scheduleDraw();
  }

  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          applyHostSize();
        })
      : null;
  resizeObserver?.observe(host);

  // Start growing the map only now, once every piece of state above exists: a cached or inline
  // layout reveals synchronously.
  if (showAllMode) {
    growing = true;
    growLayout(simNodes, simLinks, () => {});
  }
  draw();
  if (showAllMode) kickAnimations();

  return attachGraphSearch(
    () => {
      disposed = true;
      window.cancelAnimationFrame(growRaf);
      window.clearTimeout(walkTimer);
      resizeObserver?.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(retuneTimer);
      simulation.stop();
      if (drawRaf) cancelAnimationFrame(drawRaf);
      if (animRaf) cancelAnimationFrame(animRaf);
      host.innerHTML = "";
    },
    query => {
      options.search = query;
      scheduleDraw();
    },
    setModel,
    setTuning,
    next => {
      theme = next;
      scheduleDraw();
    },
  );
}
