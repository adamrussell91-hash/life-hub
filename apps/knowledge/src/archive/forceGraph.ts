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
import { easeInOut, flipQuad, headAt, quadPoint, routeHops, signalLength, sparkEchoes, sparkSeeds, spreadSpark, subQuad, thoughtWords, type Hop, type Quad } from "./showAllPulse";
import {
  buildMemoryIndex,
  findTwins,
  inferLatentCauses,
  linesOfThinking,
  reinstate,
  settleAttractor,
  type LatentCauses,
  type MemoryIndex,
  type Twin,
} from "./showAllMemory";
import { GROW_SPEEDS, LINES_KEY, SETTLE_KEY, createDock, el, readFlag, readGrowSpeed, writeFlag, readSavedViews, writeGrowSpeed, writeSavedViews, type Dock, type DockTool } from "./showAllDock";
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

  /**
   * A fibre: a gentle, stable bend per link so branches read organic, not ruled. The bend is
   * keyed to the sorted pair, so A→B and B→A trace the same curve (impulses can run either way).
   */
  function fibreQuad(from: GraphNodeDatum, to: GraphNodeDatum): Quad {
    const flip = from.id > to.id;
    const source = flip ? to : from;
    const target = flip ? from : to;
    const dx = target.x! - source.x!;
    const dy = target.y! - source.y!;
    const bend = (hashUnit(`${source.id}|${target.id}`) - 0.5) * 0.6;
    const quad: Quad = {
      p0: { x: source.x!, y: source.y! },
      c: { x: (source.x! + target.x!) / 2 - dy * bend, y: (source.y! + target.y!) / 2 + dx * bend },
      p2: { x: target.x!, y: target.y! },
    };
    return flip ? flipQuad(quad) : quad;
  }

  /** Trace a fibre, or the part of it from t0 to t1 (0 at `from`). */
  function fibre(from: GraphNodeDatum, to: GraphNodeDatum, t0 = 0, t1 = 1) {
    const whole = fibreQuad(from, to);
    const quad = t0 <= 0 && t1 >= 1 ? whole : subQuad(whole, t0, t1);
    ctx.moveTo(quad.p0.x, quad.p0.y);
    ctx.quadraticCurveTo(quad.c.x, quad.c.y, quad.p2.x, quad.p2.y);
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
    // [from, to, t0, t1]: a fibre, or the part of it that has grown so far.
    type Fibre = [GraphNodeDatum, GraphNodeDatum, number, number];
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
      // While growing, a fibre extends out of the older note toward the newer one.
      const grownS = sourceLayer.grow ?? 1;
      const grownT = targetLayer.grow ?? 1;
      const piece: Fibre =
        grownS >= 1 && grownT >= 1
          ? [source, target, 0, 1]
          : grownS >= grownT
            ? [source, target, 0, grownT]
            : [target, source, 0, grownS];
      if (piece[3] <= 0.01) continue;
      if (pathEdges?.has(key)) {
        active.push(piece);
        continue;
      }
      if (highlighting && linkDrawState(link, source, target, emphasis).active) {
        active.push(piece);
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
      batch.fibres.push(piece);
      batches.set(bucket, batch);
    }
    // Lighten / darken, not add / multiply: where thousands of fibres cross, colour holds instead
    // of burning out to a white (dark) or black (light) blot.
    ctx.globalCompositeOperation = dark ? "lighten" : "darken";
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    for (const batch of batches.values()) {
      ctx.beginPath();
      for (const [from, to, t0, t1] of batch.fibres) fibre(from, to, t0, t1);
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
      const grown = easeInOut(layer.grow ?? 1);
      const fade = (node.opacity ?? 1) * (dim ? 0.25 : 1) * layer.weight;
      const degree = node.degree ?? 0;
      if (degree >= 5 || hot) {
        const haloR = (((hot ? 10 : 3 + Math.min(degree, 14) * 1.1) * 0.7) / view.k) * grown;
        const halo = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, haloR);
        halo.addColorStop(0, tint(node.color, dark ? 0.35 : 0.1));
        halo.addColorStop(1, dark ? "rgba(0, 0, 0, 0)" : "rgba(255, 255, 255, 0)");
        ctx.fillStyle = halo;
        ctx.globalAlpha = (hot ? 0.75 : dark ? 0.4 : 0.45) * fade;
        ctx.beginPath();
        ctx.arc(node.x, node.y, haloR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = hot ? (dark ? "#ffd2a8" : "#a8501a") : tint(node.color, dark ? 0.3 : 0.2);
      ctx.globalAlpha = (hot ? 1 : dark ? 0.85 : 0.75) * fade;
      ctx.beginPath();
      ctx.arc(node.x, node.y, (((hot ? 2.6 : 0.9 + Math.min(degree, 10) * 0.18) * 1.1) / view.k) * grown, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    if (active.length) {
      ctx.beginPath();
      for (const [from, to, t0, t1] of active) fibre(from, to, t0, t1);
      ctx.strokeStyle = dark ? "#ffb070" : "#c25a14";
      // A path's route sits quietly underneath; the impulse running along it does the talking.
      ctx.globalAlpha = pathEdges?.size ? 0.4 : 0.95;
      ctx.lineWidth = ((pathEdges?.size ? 1.4 : 2) * widthScale) / view.k;
      ctx.stroke();
    }
    drawSignals(map, dark);
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

  // ---------- Map tools: spark, grow, path, recent, walk, bridges, save, export ----------
  let tool: DockTool | null = null;
  let growUntil: number | null = null;
  let growSpanWidth = 1;
  let growRaf = 0;
  /** How long a full replay takes. Slower settings let you watch each branch reach out. */
  let growPlayMs: number = GROW_SPEEDS[0].ms;
  let recentWindow: RecentWindow | null = null;
  let pathSet: Set<string> | null = null;
  let pathEdges: Set<string> | null = null;
  let pathPicks: string[] = [];
  let bridgeSet: Set<string> | null = null;
  /** Spark's lit state: how bright a note is at a moment, or null while still dark. */
  let spark: { levelAt: (id: string, now: number) => number | null; seeds: Set<string>; settled?: Set<string> } | null = null;
  /** Recall / Sharpen: the notes in play, and how dim everything else goes. */
  let litSet: Set<string> | null = null;
  /** Grow with lines of thinking on: notes that began a line, ringing as they appear. */
  let ignitions: Array<{ id: string; at: number; label: string }> = [];
  let memory: { key: unknown; mem: MemoryIndex; causes?: LatentCauses } | null = null;
  let toolTimer = 0;
  type Overlay = { show: boolean; weight: number; mark: boolean; grow?: number };
  const VISIBLE: Overlay = { show: true, weight: 1, mark: false };
  const HIDDEN: Overlay = { show: false, weight: 0, mark: false };

  function overlayOf(node: GraphNodeDatum): Overlay {
    if (!tool || tool === "save" || tool === "export" || tool === "walk") return VISIBLE;
    if (growUntil != null) {
      if (!grownBy(node, growUntil)) return HIDDEN;
      const time = noteTime(node);
      // A new note does not flash in: it buds, and its fibres reach out to it over a moment.
      const ramp = Math.max(1, growSpanWidth * ((900 + growPlayMs * 0.02) / growPlayMs));
      return { show: true, weight: 1, mark: false, grow: time == null ? 1 : Math.min(1, (growUntil - time) / ramp) };
    }
    let weight = 1;
    let mark = false;
    if (spark) {
      const level = spark.levelAt(node.id, performance.now());
      if (level == null) weight = 0.12;
      else {
        weight = 0.3 + 0.7 * level;
        mark = spark.settled ? spark.settled.has(node.id) : spark.seeds.has(node.id);
      }
    }
    if (litSet) {
      if (litSet.has(node.id)) mark = true;
      else weight = Math.min(weight, 0.16);
    }
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

  // ---------- Impulses: charges running down fibres ----------
  type Signal = {
    hops: Hop[];
    start: number;
    /** How long a fibre stays lit after the charge passes. */
    afterglow: number;
    /** Rest before playing again; omit to play once. */
    loop?: number;
    /** Camera rides the charge at this zoom (Walk). */
    follow?: number;
    onArrive?: (id: string) => void;
    arrived: number;
  };
  let signals: Signal[] = [];
  let signalRaf = 0;

  function playSignal(signal: Omit<Signal, "arrived" | "start"> & { delay?: number }) {
    signals.push({ ...signal, start: performance.now() + (signal.delay ?? 0), arrived: 0 });
    if (!signalRaf) signalRaf = requestAnimationFrame(tickSignals);
  }

  function stopSignals() {
    signals = [];
    window.cancelAnimationFrame(signalRaf);
    signalRaf = 0;
  }

  function headPoint(signal: Signal, t: number) {
    const live = headAt(signal.hops, t);
    if (live) {
      const from = nodeMap.get(live.hop.from);
      const to = nodeMap.get(live.hop.to);
      if (from?.x != null && to?.x != null) return quadPoint(fibreQuad(from, to), live.at);
    }
    // Between hops (or before the first) the charge rests on the last note it reached.
    const rested = [...signal.hops].reverse().find(hop => t >= hop.start + hop.duration);
    const node = nodeMap.get(rested ? rested.to : (signal.hops[0]?.from ?? ""));
    return node?.x != null && node.y != null ? { x: node.x, y: node.y } : null;
  }

  function tickSignals() {
    signalRaf = 0;
    const now = performance.now();
    signals = signals.filter(signal => {
      let t = now - signal.start;
      const length = signalLength(signal.hops);
      if (signal.loop != null && t > length + signal.loop) {
        signal.start = now;
        signal.arrived = 0;
        t = 0;
      }
      while (signal.arrived < signal.hops.length) {
        const hop = signal.hops[signal.arrived]!;
        if (t < hop.start + hop.duration) break;
        signal.arrived += 1;
        signal.onArrive?.(hop.to);
      }
      if (signal.follow && t >= 0) {
        const head = headPoint(signal, t);
        if (head) {
          // Glide, never jump: ease the camera a little of the way toward the charge each frame.
          const k = view.k + (signal.follow - view.k) * 0.04;
          const tx = width / 2 - head.x * k;
          const ty = (topInset() + height) / 2 - head.y * k;
          view.k = k;
          view.x += (tx - view.x) * 0.05;
          view.y += (ty - view.y) * 0.05;
        }
      }
      return signal.loop != null || signal.follow != null || t < length + signal.afterglow;
    });
    draw();
    if (signals.length || ignitions.length) signalRaf = requestAnimationFrame(tickSignals);
  }

  /** Each live charge: a bright head with a fading tail, then the fibre it crossed glowing out. */
  function drawSignals(map: Map<string, GraphNodeDatum>, dark: boolean) {
    if (!signals.length && !ignitions.length) return;
    const now = performance.now();
    const head = dark ? "#fff4e3" : "#7a2e05";
    const body = dark ? "#ffb070" : "#c25a14";
    ctx.save();
    // A new line of thinking: a slow ring opens around its first note, and it is named.
    for (const ignition of ignitions) {
      const node = map.get(ignition.id);
      if (node?.x == null || node.y == null) continue;
      const age = (now - ignition.at) / 4000;
      if (age >= 1) continue;
      const open = easeInOut(Math.min(1, age * 1.6));
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.arc(node.x, node.y, (4 + 22 * open) / view.k, 0, Math.PI * 2);
      ctx.strokeStyle = body;
      ctx.globalAlpha = 0.7 * (1 - age);
      ctx.lineWidth = 1.4 / view.k;
      ctx.stroke();
      if (ignition.label) drawHaloText(ignition.label, node.x, node.y - 30 / view.k, {
        font: `600 ${12 / view.k}px Inter, ui-sans-serif, sans-serif`,
        align: "center",
        baseline: "middle",
        color: dark ? "#ffd2a8" : "#7a2e05",
        alpha: Math.min(1, (1 - age) * 1.8),
        halo: dark ? "rgba(3, 5, 10, 0.85)" : "rgba(247, 243, 234, 0.9)",
      });
    }
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (const signal of signals) {
      const t = now - signal.start;
      if (t < 0) continue;
      for (const hop of signal.hops) {
        if (t < hop.start) continue;
        const from = map.get(hop.from);
        const to = map.get(hop.to);
        if (from?.x == null || to?.x == null || from.y == null || to.y == null) continue;
        const raw = (t - hop.start) / hop.duration;
        const strength = 0.35 + 0.65 * hop.strength;
        if (raw < 1) {
          const at = easeInOut(raw);
          // Tail: three overlapping strokes, longest and faintest first.
          for (const [length, alpha, w] of [
            [0.45, 0.18, 3.2],
            [0.22, 0.4, 2.2],
            [0.08, 0.9, 1.6],
          ] as const) {
            ctx.beginPath();
            fibre(from, to, Math.max(0, at - length), at);
            ctx.strokeStyle = body;
            ctx.globalAlpha = alpha * strength;
            ctx.lineWidth = w / view.k;
            ctx.stroke();
          }
          const point = quadPoint(fibreQuad(from, to), at);
          const r = (9 + 6 * hop.strength) / view.k;
          const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, r);
          glow.addColorStop(0, head);
          glow.addColorStop(0.25, body);
          glow.addColorStop(1, dark ? "rgba(0, 0, 0, 0)" : "rgba(247, 243, 234, 0)");
          ctx.fillStyle = glow;
          ctx.globalAlpha = 0.8 * strength;
          ctx.beginPath();
          ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = head;
          ctx.globalAlpha = strength;
          ctx.beginPath();
          ctx.arc(point.x, point.y, (1.6 + 1.2 * hop.strength) / view.k, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const since = t - hop.start - hop.duration;
        const left = 1 - since / signal.afterglow;
        if (left <= 0) continue;
        ctx.beginPath();
        fibre(from, to);
        ctx.strokeStyle = body;
        ctx.globalAlpha = 0.55 * left * strength;
        ctx.lineWidth = 1.4 / view.k;
        ctx.stroke();
        // The note it reached answers with a soft swell — a ring that opens and fades.
        const swell = Math.min(1, since / 700);
        if (swell < 1) {
          ctx.beginPath();
          ctx.arc(to.x, to.y, (3 + 7 * easeInOut(swell)) / view.k, 0, Math.PI * 2);
          ctx.strokeStyle = body;
          ctx.globalAlpha = (1 - swell) * 0.6 * strength;
          ctx.lineWidth = 1 / view.k;
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  const dock: Dock | null = showAllMode ? createDock(host, chooseTool) : null;

  function placeDock() {
    dock?.setTop(topInset() + 10);
  }

  function clearTool() {
    window.cancelAnimationFrame(growRaf);
    growRaf = 0;
    window.clearTimeout(toolTimer);
    toolTimer = 0;
    stopSignals();
    growUntil = null;
    recentWindow = null;
    pathSet = null;
    pathEdges = null;
    pathPicks = [];
    bridgeSet = null;
    spark = null;
    litSet = null;
    ignitions = [];
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
    if (next === "spark") openSpark();
    if (next === "grow") openGrow();
    if (next === "path") openPath();
    if (next === "recent") openRecent("month");
    if (next === "walk") startWalk();
    if (next === "bridges") openBridges();
    if (next === "recall") openRecall();
    if (next === "sharpen") openSharpen();
    if (next === "save") openSave();
    scheduleDraw();
  }

  function leafById(id: string) {
    const node = nodeMap.get(id);
    return node && node.kind === "leaf" ? node : null;
  }

  /** The similarity index behind Spark's settle mode, lines of thinking, Recall and Sharpen. */
  function memoryIndex() {
    if (memory?.key !== liveModel) {
      memory = {
        key: liveModel,
        mem: buildMemoryIndex(simNodes, node => (node.pageId ? options.excerptFor(node.pageId) : "")),
      };
    }
    return memory;
  }

  /** Index on the next tick, after a "Reading your notes…" line has had a chance to paint. */
  function withMemory(panel: HTMLElement | null, run: (entry: NonNullable<typeof memory>) => void) {
    if (memory?.key === liveModel) {
      run(memory);
      return;
    }
    panel?.replaceChildren(el("p", { class: "neural-dock__note", text: "Reading your notes…" }));
    const forTool = tool;
    window.clearTimeout(toolTimer);
    toolTimer = window.setTimeout(() => {
      if (tool !== forTool) return;
      run(memoryIndex());
    }, 30);
  }

  function fill(panel: HTMLElement, ...children: Array<Node | null | false>) {
    panel.replaceChildren(...children.filter((child): child is Node => Boolean(child)));
  }

  function noteName(id: string) {
    return leafById(id)?.label ?? "";
  }

  function noteButton(id: string, meta?: string) {
    const node = leafById(id);
    const button = el("button", { type: "button" }, el("span", { text: node?.label ?? "" }), meta ? el("small", { text: meta }) : null);
    if (node) button.addEventListener("click", () => showNote(node));
    return button;
  }

  function toggle(label: string, on: boolean, hint: string, onChange: (on: boolean) => void) {
    const button = el("button", { type: "button", class: "neural-dock__toggle", title: hint, "aria-pressed": String(on) }, label);
    button.classList.toggle("is-active", on);
    button.addEventListener("click", () => {
      const next = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(next));
      button.classList.toggle("is-active", next);
      onChange(next);
    });
    return button;
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

  function monthYear(time: number | null) {
    return time == null ? "" : new Date(time).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }

  // Spark: drop a thought in. It lands on the notes that mention it, then the charge spreads
  // through their links, fading as it goes. What lights up is what your notes associate with it —
  // and the panel names the ones you had forgotten.
  function openSpark() {
    const input = el("input", {
      type: "text",
      class: "neural-dock__input",
      placeholder: selected ? "A thought, or blank for this note" : "Drop a thought in…",
      "aria-label": "A thought to spark",
      enterkeyhint: "go",
    });
    const go = el("button", { type: "submit", text: "Spark" });
    const form = el("form", { class: "neural-dock__spark" }, input, go);
    const answer = el("div", { class: "neural-dock__answer" });
    let settle = readFlag(SETTLE_KEY);
    const mode = toggle("Settle", settle, "Attractor mode: let the activity settle into the one memory it belongs to", on => {
      settle = on;
      writeFlag(SETTLE_KEY, on);
      if (input.value.trim() || selected) fire(input.value.trim());
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      fire(input.value.trim());
    });
    const hint = el("p", { class: "neural-dock__note" });
    const setHint = () => {
      hint.textContent = settle
        ? "Settle: activity sloshes between ideas, then falls into the one memory your thought belongs to."
        : "Watch where it travels. Your notes answer back.";
    };
    setHint();
    mode.addEventListener("click", setHint);
    dock?.setPanel(el("div", {}, form, el("div", { class: "neural-dock__modes" }, mode), hint, answer));
    window.setTimeout(() => input.focus(), 0);

    function seedsFor(thought: string) {
      let seeds = thought
        ? sparkSeeds(simNodes, thought, node => (node.pageId ? options.excerptFor(node.pageId) : ""), 8)
        : [];
      if (!seeds.length && !thought && selected) {
        const picked = simNodes.find(node => node.kind === "leaf" && node.label === selected);
        if (picked) seeds = [picked.id];
      }
      return seeds;
    }

    function fire(thought: string) {
      stopSignals();
      window.clearTimeout(toolTimer);
      const seeds = seedsFor(thought);
      if (!seeds.length) {
        spark = null;
        answer.replaceChildren(el("p", { class: "neural-dock__note", text: thought ? "Nothing in your notes touches that yet." : "Type a thought, or pick a note first." }));
        scheduleDraw();
        return;
      }
      if (settle) withMemory(answer, entry => fireSettle(entry.mem, seeds));
      else fireSpread(thought, seeds);
    }

    function fireSpread(thought: string, seeds: string[]) {
      const hopMs = 950;
      const result = spreadSpark(simLinks, seeds, { hopMs, decay: 0.7, fanOut: 5 });
      const start = performance.now() + 700;
      spark = {
        seeds: new Set(seeds),
        levelAt: (id, now) => {
          const lit = result.litAt.get(id);
          return lit == null || now - start < lit ? null : (result.level.get(id) ?? 0);
        },
      };
      fitTo(result.level.keys());
      playSignal({ hops: result.hops, afterglow: 5200, delay: 700 });
      answer.replaceChildren(el("p", { class: "neural-dock__note", text: "Listening…" }));
      // Name what came back once the wave has mostly spread.
      toolTimer = window.setTimeout(() => {
        const echoes = sparkEchoes(simNodes, result, seeds, Date.now(), 8, thoughtWords(thought));
        const list = el("ol", { class: "neural-dock__steps" });
        for (const echo of echoes) {
          const meta = [monthYear(echo.written), echo.forgotten ? "forgotten" : ""].filter(Boolean).join(" · ");
          const button = noteButton(echo.id, meta);
          if (echo.forgotten) button.classList.add("is-forgotten");
          list.append(el("li", {}, button));
        }
        const forgotten = echoes.filter(echo => echo.forgotten).length;
        answer.replaceChildren(
          el(
            "div",
            {},
            el("p", { class: "neural-dock__head", text: echoes.length ? "Your notes answer" : "Only the notes you named lit up" }),
            echoes.length ? list : null,
            forgotten
              ? el("p", { class: "neural-dock__note", text: `${forgotten} of these you wrote over a year ago.` })
              : null,
          ),
        );
      }, 700 + Math.min(4200, signalLength(result.hops) * 0.7));
      scheduleDraw();
    }

    // Attractor mode: replay the settling step by step. Activity eases between frames; charges
    // run from the most active note toward each note that switches on.
    function fireSettle(mem: MemoryIndex, seeds: string[]) {
      const settling = settleAttractor(mem, seeds);
      const frameMs = 850;
      const start = performance.now() + 600;
      const last = settling.frames.length - 1;
      const final = new Set(settling.attractor);
      spark = {
        seeds: new Set(seeds),
        levelAt: (id, now) => {
          const t = (now - start) / frameMs;
          if (t < 0) return settling.frames[0]!.get(id) ?? null;
          const f = Math.min(last, Math.floor(t));
          const here = settling.frames[f]!.get(id);
          const next = settling.frames[Math.min(last, f + 1)]!.get(id);
          if (here == null && next == null) return null;
          const mix = easeInOut(t - f);
          return (here ?? 0) * (1 - mix) + (next ?? 0) * mix;
        },
      };
      const hops: Hop[] = [];
      for (let f = 1; f <= last; f++) {
        const before = settling.frames[f - 1]!;
        let added = 0;
        for (const [id, level] of settling.frames[f]!) {
          if (before.has(id) || added >= 24) continue;
          // Charge comes from the active partner that pushed it on hardest.
          const i = mem.index.get(id)!;
          let from = "";
          let push = 0;
          for (const { j, score } of mem.partners[i]!) {
            const value = (before.get(mem.ids[j]!) ?? 0) * score;
            if (value > push) {
              push = value;
              from = mem.ids[j]!;
            }
          }
          if (!from) continue;
          hops.push({ from, to: id, start: (f - 1) * frameMs + added * 25, duration: frameMs * 0.9, strength: Math.max(0.3, level) });
          added += 1;
        }
      }
      playSignal({ hops, afterglow: 2200, delay: 600 });
      fitTo([...seeds, ...settling.attractor]);
      answer.replaceChildren(el("p", { class: "neural-dock__note", text: "Settling…" }));
      toolTimer = window.setTimeout(() => {
        if (spark) spark.settled = final;
        const list = el("ol", { class: "neural-dock__steps" });
        for (const id of settling.attractor.slice(0, 10)) list.append(el("li", {}, noteButton(id)));
        const competing = settling.competing.map(shortName);
        const settledInto = settling.settledTopic ? shortName(settling.settledTopic) : "";
        answer.replaceChildren(
          el(
            "div",
            {},
            competing.length > 1
              ? el("p", { class: "neural-dock__note", text: `Pulled between ${competing.join(", ")} — settled into ${settledInto}.` })
              : el("p", { class: "neural-dock__note", text: `Settled into ${settledInto || "one memory"} in ${last} steps.` }),
            el("p", { class: "neural-dock__head", text: "The memory it fell into" }),
            list,
          ),
        );
        scheduleDraw();
      }, 600 + frameMs * last + 300);
      scheduleDraw();
    }
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
    let fraction = 0;
    let lines = readFlag(LINES_KEY);
    let causes: LatentCauses | null = null;
    const linesPanel = el("div", { class: "neural-dock__lines" });
    const founders = new Map<string, string>();
    const fireCrossed = (from: number, to: number) => {
      if (!causes || to <= from) return;
      const now = performance.now();
      let sent = 0;
      for (const step of causes.steps) {
        const node = leafById(step.note);
        const time = node ? noteTime(node) : null;
        if (time == null || time <= from || time > to) continue;
        const line = founders.get(step.note);
        if (line != null) {
          // Name a line as it begins only while few others are speaking, so names never pile up.
          const speaking = ignitions.filter(item => item.label && now - item.at < 2600).length;
          ignitions.push({ id: step.note, at: now, label: speaking < 2 ? line : "" });
          continue;
        }
        // Joining notes get a quiet charge from the note that explained them; a stretch is brighter.
        if (!step.via || sent >= 6 || signals.length > 40) continue;
        if (step.kind === "join" && Math.random() > 0.35) continue;
        playSignal({
          hops: [{ from: step.via, to: step.note, start: 0, duration: 900, strength: step.kind === "stretch" ? 0.9 : 0.4 }],
          afterglow: 900,
        });
        sent += 1;
      }
      ignitions = ignitions.filter(item => now - item.at < 4200);
    };
    const showLines = () => {
      if (!lines) {
        causes = null;
        founders.clear();
        ignitions = [];
        linesPanel.replaceChildren();
        return;
      }
      withMemory(linesPanel, entry => {
        entry.causes ??= inferLatentCauses(entry.mem);
        causes = entry.causes;
        const named = linesOfThinking(causes);
        founders.clear();
        for (const line of named) {
          const name = shortName(noteName(line.founder));
          founders.set(line.founder, name.length > 40 ? `${name.slice(0, 39)}…` : name);
        }
        const list = el("ol", { class: "neural-dock__steps" });
        for (const line of named) {
          const button = noteButton(line.founder, [monthYear(line.born), `${line.members.length} notes`, line.topic ? shortName(line.topic) : ""].filter(Boolean).join(" · "));
          button.addEventListener("click", () => {
            // Jump the replay to just before this line began, and play on from there.
            if (line.born == null) return;
            const at = Math.max(0, (line.born - span.first) / growSpanWidth - 0.004);
            setAt(at);
            start(at);
          });
          list.append(el("li", {}, button));
        }
        linesPanel.replaceChildren(
          el("p", { class: "neural-dock__note", text: `Each new note either fits a line of thinking you already had, stretches it, or starts a new one. ${named.length} lines began here:` }),
          list,
        );
      });
    };
    const setAt = (next: number) => {
      const before = growUntil;
      fraction = next;
      growUntil = span.first + growSpanWidth * next;
      if (growRaf && before != null) fireCrossed(before, growUntil);
      slider.value = String(Math.round(next * 1000));
      when.textContent = monthYear(growUntil);
      scheduleDraw();
    };
    let started = 0;
    let from = 0;
    const frame = () => {
      const next = Math.min(1, from + (performance.now() - started) / growPlayMs);
      setAt(next);
      if (next < 1) growRaf = requestAnimationFrame(frame);
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
    const speeds = el("div", { class: "neural-dock__segments", role: "group", "aria-label": "Replay speed" });
    const speedButtons = GROW_SPEEDS.map(speed => {
      const button = el("button", { type: "button", text: speed.label, title: `Whole replay in ${Math.round(speed.ms / 1000)} seconds` });
      button.addEventListener("click", () => {
        growPlayMs = speed.ms;
        writeGrowSpeed(speed.ms);
        markSpeed();
        // Keep going from here, at the new pace.
        if (growRaf) start(fraction);
      });
      speeds.append(button);
      return { button, ms: speed.ms };
    });
    const markSpeed = () => {
      for (const { button, ms } of speedButtons) {
        button.classList.toggle("is-active", ms === growPlayMs);
        button.setAttribute("aria-pressed", String(ms === growPlayMs));
      }
    };
    growPlayMs = readGrowSpeed();
    markSpeed();
    const linesToggle = toggle("Lines of thinking", lines, "Latent cause inference: mark where each new line of thinking began", on => {
      lines = on;
      writeFlag(LINES_KEY, on);
      showLines();
    });
    dock?.setPanel(
      el("div", {}, el("div", { class: "neural-dock__grow" }, play, slider, when), speeds, el("div", { class: "neural-dock__modes" }, linesToggle), linesPanel),
    );
    showLines();
    viewTouched = false;
    moveCamera(fitShowAll(), 500);
    setAt(0);
    start(0);
  }

  // Path: click two notes (or a topic name) and watch a charge run the chain that joins them.
  function openPath() {
    stopSignals();
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
    stopSignals();
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
      if (route.length) {
        fitTo(route);
        // Long routes run a little quicker per step so the whole trip stays watchable.
        const hopMs = Math.max(450, Math.min(950, 6500 / route.length));
        playSignal({ hops: routeHops(route, hopMs, 60), afterglow: 2600, loop: 1800, delay: 800 });
      }
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

  // Walk: ride a slow charge from note to linked note. The camera glides with it; the note it
  // is resting on is named in the panel (open it from there), so nothing pops up mid-flight.
  function startWalk() {
    const start = selected ? simNodes.find(node => node.kind === "leaf" && node.label === selected)?.id : undefined;
    const route = walkRoute(simNodes, simLinks, 60, start);
    if (route.length < 2) {
      dock?.setPanel(el("p", { class: "neural-dock__note", text: "Not enough links to walk yet." }));
      return;
    }
    const title = el("p", { class: "neural-dock__walking" });
    const open = el("button", { type: "button", text: "Open" });
    const stop = el("button", { type: "button", class: "neural-dock__quiet", text: "Stop" });
    stop.addEventListener("click", clearTool);
    let here = route[0]!;
    open.addEventListener("click", () => {
      const node = leafById(here);
      if (node?.pageId) onNoteSelect({ pageId: node.pageId, title: node.label, excerpt: options.excerptFor(node.pageId) });
    });
    const name = (id: string) => {
      here = id;
      const node = leafById(id);
      title.textContent = node?.label ?? "";
      title.title = node?.parentKeyword ?? "";
    };
    name(here);
    dock?.setPanel(el("div", {}, title, el("div", { class: "neural-dock__grow" }, open, stop)));
    const first = leafById(here);
    const k = Math.max(overviewK * 3.2, 0.3);
    viewTouched = true;
    if (first) moveCamera(focusShowAll(first, k), 1400);
    playSignal({
      hops: routeHops(route, 2600, 1100),
      afterglow: 9000,
      follow: k,
      delay: 1500,
      onArrive: id => {
        name(id);
        if (id === route[route.length - 1]) toolTimer = window.setTimeout(clearTool, 4000);
      },
    });
  }

  // Bridges: the few notes that hold separate areas of your thinking together, each firing into
  // the topics it joins; and the topics you tag together that never actually link.
  function openBridges() {
    const bridges = keyBridges(simNodes, simLinks);
    bridgeSet = new Set(bridges.map(item => item.id));
    const bridgeList = el("ol", { class: "neural-dock__steps" });
    bridges.forEach((bridge, index) => {
      const node = leafById(bridge.id);
      if (!node) return;
      const button = el(
        "button",
        { type: "button", title: `Links into ${bridge.topics.join(", ")}` },
        el("span", { text: bridge.label }),
        el("small", { text: [node.parentKeyword, ...bridge.topics].filter(Boolean).map(topic => shortName(topic!)).join(" ↔ ") }),
      );
      button.addEventListener("click", () => showNote(node));
      bridgeList.append(el("li", {}, button));
      // Show the bridging: charges leave the note along each link into another topic.
      const hops: Hop[] = [];
      for (const link of simLinks) {
        if (link.kind !== "backbone" && link.kind !== "overlap") continue;
        const a = typeof link.source === "string" ? link.source : link.source.id;
        const b = typeof link.target === "string" ? link.target : link.target.id;
        const other = a === bridge.id ? b : b === bridge.id ? a : null;
        if (!other) continue;
        const topic = nodeMap.get(other)?.parentKeyword;
        if (!topic || topic === node.parentKeyword) continue;
        hops.push({ from: bridge.id, to: other, start: hops.length * 160, duration: 1300, strength: 0.8 });
        if (hops.length >= 6) break;
      }
      if (hops.length) playSignal({ hops, afterglow: 1400, loop: 2200, delay: 600 + index * 450 });
    });
    const gaps = missingLinks(simNodes, simLinks, liveModel.hubTies ?? []);
    const gapList = el("ul", { class: "neural-dock__steps" });
    for (const gap of gaps) {
      const button = el("button", { type: "button", text: `${shortName(gap.a)} · ${shortName(gap.b)}`, title: `${gap.a} and ${gap.b}` });
      button.addEventListener("click", () => {
        // Show the closest the two topics come: the path between their best-linked notes.
        const a = topicRepresentative(simNodes, gap.a, simLinks);
        const b = topicRepresentative(simNodes, gap.b, simLinks);
        if (!a || !b) return;
        stopSignals();
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
        el("p", { class: "neural-dock__head", text: "Bridges" }),
        el("p", {
          class: "neural-dock__note",
          text: "Notes that tie different topics together. Without them those areas of your thinking would never touch.",
        }),
        bridgeList,
        gaps.length ? el("p", { class: "neural-dock__head", text: "Gaps" }) : null,
        gaps.length
          ? el("p", { class: "neural-dock__note", text: "Topics you tag together whose notes never link. Tap one to see how far apart they are — a note there could join them." })
          : null,
        gaps.length ? gapList : null,
      ),
    );
    fitTo(bridgeSet);
  }

  // Recall (reinstatement): click a note to bring back what was active when you wrote it —
  // the notes around it in time and the ones it calls up.
  function openRecall() {
    dock?.setPanel(el("p", { class: "neural-dock__note", text: "Click a note to bring back what you were thinking about when you wrote it." }));
  }

  function recall(node: GraphNodeDatum) {
    const leaf = node.kind === "leaf" ? node : topicRepresentative(simNodes, node.label, simLinks);
    if (!leaf) return;
    const panel = el("div", {});
    dock?.setPanel(panel);
    withMemory(panel, entry => {
      stopSignals();
      const back = reinstate(entry.mem, leaf.id);
      litSet = new Set([leaf.id, ...back.context, ...back.associations]);
      // The index fires and the scattered pieces light up: one charge out to each.
      const hops: Hop[] = [
        ...back.context.map((id, index) => ({ from: leaf.id, to: id, start: index * 90, duration: 1400, strength: 0.75 })),
        ...back.associations.map((id, index) => ({ from: leaf.id, to: id, start: 300 + index * 120, duration: 1100, strength: 0.5 })),
      ];
      playSignal({ hops, afterglow: 3000, delay: 300 });
      fitTo(litSet);
      const contextList = el("ol", { class: "neural-dock__steps" });
      for (const id of back.context.slice(0, 12)) {
        const other = leafById(id);
        contextList.append(el("li", {}, noteButton(id, other?.parentKeyword ? shortName(other.parentKeyword) : "")));
      }
      const callList = el("ol", { class: "neural-dock__steps" });
      for (const id of back.associations) callList.append(el("li", {}, noteButton(id)));
      const topics = back.topics.slice(0, 4).map(item => `${shortName(item.topic)} (${item.count})`).join(", ");
      fill(
        panel,
        el("p", { class: "neural-dock__head", text: leaf.label }),
        el("p", { class: "neural-dock__note", text: back.written ? `Written ${new Date(back.written).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.` : "No date on this note." }),
        topics ? el("p", { class: "neural-dock__note", text: `That week you were also in: ${topics}.` }) : null,
        back.context.length ? el("p", { class: "neural-dock__head", text: "Around the same time" }) : null,
        back.context.length ? contextList : null,
        el("p", { class: "neural-dock__head", text: "What it calls up" }),
        callList,
      );
      scheduleDraw();
    });
  }

  // Sharpen (representational differentiation): notes so alike they compete. Copies can merge;
  // near-twins get the words only each one uses — the difference worth making sharper.
  function openSharpen() {
    const panel = el("div", {});
    dock?.setPanel(panel);
    withMemory(panel, entry => {
      const twins = findTwins(entry.mem, { limit: 14 });
      const copies = twins.filter(twin => twin.alike >= 0.95);
      const near = twins.filter(twin => twin.alike < 0.95);
      const row = (twin: Twin) => {
        const pick = el("button", { type: "button", class: "neural-dock__pair" }, el("span", { text: `${noteName(twin.a)}` }), el("small", { text: "and" }), el("span", { text: noteName(twin.b) }));
        pick.addEventListener("click", () => {
          stopSignals();
          litSet = new Set([twin.a, twin.b]);
          // Two memories competing: a charge runs back and forth between them.
          playSignal({
            hops: [
              { from: twin.a, to: twin.b, start: 0, duration: 1100, strength: 0.9 },
              { from: twin.b, to: twin.a, start: 1300, duration: 1100, strength: 0.9 },
            ],
            afterglow: 1200,
            loop: 600,
          });
          fitTo(litSet);
          scheduleDraw();
        });
        const differ =
          twin.onlyA.length || twin.onlyB.length
            ? el("p", { class: "neural-dock__differ", text: `Only the first: ${twin.onlyA.join(", ") || "—"} · Only the second: ${twin.onlyB.join(", ") || "—"}` })
            : null;
        return el("li", {}, pick, differ);
      };
      fill(
        panel,
        el("p", { class: "neural-dock__note", text: "Notes so alike they compete for the same place in your memory. Merge the copies; for the rest, sharpen what makes each one its own." }),
        copies.length ? el("p", { class: "neural-dock__head", text: "Copies — merge these" }) : null,
        copies.length ? el("ul", { class: "neural-dock__steps neural-dock__pairs" }, ...copies.map(row)) : null,
        near.length ? el("p", { class: "neural-dock__head", text: "Twins — sharpen the difference" }) : null,
        near.length ? el("ul", { class: "neural-dock__steps neural-dock__pairs" }, ...near.map(row)) : null,
        twins.length ? null : el("p", { class: "neural-dock__note", text: "No two notes compete. Every memory has its own place." }),
      );
    });
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
    if (showAllMode && tool === "recall") {
      recall(node);
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
      window.clearTimeout(toolTimer);
      stopSignals();
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
