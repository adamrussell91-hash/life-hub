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
  SHOW_ALL_SPOKE_ALPHA,
  fitViewBelowInset,
  applyForceStageResize,
  applyShowAllStrandStroke,
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
  showAllLabelVisible,
  resolveBackgroundClick,
  resolveEnterKey,
  resolveNodeClick,
  showAllLinkShouldDraw,
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
import { hubLabelVariants, placeHubLabels, showAllDrawRings } from "./showAllDraw";
import { layoutShowAll } from "./showAllGraph";
import {
  SHOW_ALL_MORPH_MS,
  SHOW_ALL_RETUNE_MORPH_MS,
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

  if (showAllMode) {
    layoutShowAll(simNodes, model.hubTies ?? [], showAllShape());
    const fitted = fitShowAll();
    if (fitted) {
      // Open slightly wide and settle in while fading up: one calm arrival, never a jump.
      Object.assign(view, {
        k: fitted.k * 0.94,
        x: width / 2 - (width / 2 - fitted.x) * 0.94,
        y: height / 2 - (height / 2 - fitted.y) * 0.94,
      });
      camera = { from: { ...view }, to: fitted, start: performance.now(), duration: SHOW_ALL_REVEAL_MS };
    }
    canvas.style.opacity = "0";
    revealStart = performance.now();
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
      layoutShowAll(settled, liveModel.hubTies ?? [], showAllShape());
      startMorph(settled, SHOW_ALL_RETUNE_MORPH_MS);
    }, SHOW_ALL_RETUNE_MS);
  }

  function setModel(next: ArchiveGraphModel) {
    liveModel = next;
    const settled = next.nodes.map(node => ({ ...node, opacity: 1 }));
    layoutShowAll(settled, next.hubTies ?? [], showAllShape());
    simLinks = next.links.map(link => ({ ...link }));
    if (selected && !settled.some(node => node.label === selected)) {
      selected = null;
      onNoteSelect(null);
    }
    viewTouched = false;
    startMorph(settled, SHOW_ALL_MORPH_MS);
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
    const showAll = options.variant === "showAll";
    const searching = Boolean(options.search.trim());
    const highlightLinks = Boolean(hover || selected || searching);
    const linksToDraw = simLinks;
    const batchShowAll = showAll && !highlightLinks;

    if (showAll) drawHubTies(map, emphasis);

    if (batchShowAll) {
      const spokesByColor = new Map<string, Array<{ x1: number; y1: number; x2: number; y2: number }>>();
      for (const link of linksToDraw) {
        if (link.kind !== "spoke") continue;
        const { source, target } = linkEnds(link, map);
        if (!source || !target || source.x == null || target.x == null || source.y == null || target.y == null) continue;
        if (source.departing || target.departing) continue;
        const leaf = source.kind === "leaf" ? source : target.kind === "leaf" ? target : null;
        const leafOnScreen = Boolean(leaf && onScreen(leaf.x ?? 0, leaf.y ?? 0));
        if (!showAllLinkShouldDraw(link.kind, view.k, leafOnScreen, false)) continue;
        const bucket = spokesByColor.get(link.color) ?? [];
        bucket.push({ x1: source.x, y1: source.y, x2: target.x, y2: target.y });
        spokesByColor.set(link.color, bucket);
      }
      applyShowAllStrandStroke(ctx, { active: false, viewK: view.k });
      ctx.globalAlpha = SHOW_ALL_SPOKE_ALPHA;
      for (const [color, segments] of spokesByColor) {
        ctx.beginPath();
        for (const segment of segments) {
          ctx.moveTo(segment.x1, segment.y1);
          ctx.lineTo(segment.x2, segment.y2);
        }
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (const link of batchShowAll ? [] : linksToDraw) {
      const { source, target } = linkEnds(link, map);
      if (!source || !target || source.x == null || target.x == null || source.y == null || target.y == null) continue;
      if (source.departing || target.departing) continue;
      const leaf = source.kind === "leaf" ? source : target.kind === "leaf" ? target : null;
      const leafOnScreen = Boolean(leaf && onScreen(leaf.x ?? 0, leaf.y ?? 0));
      const { active, dim } = linkDrawState(link, source, target, emphasis);
      const emphasized = active && !dim;
      if (showAll && dim && !emphasized) continue;
      if (showAll && !showAllLinkShouldDraw(link.kind, view.k, leafOnScreen, emphasized)) continue;
      if (showAll && link.kind !== "spoke" && !emphasized && !onScreen(source.x, source.y) && !onScreen(target.x, target.y)) continue;
      const fade = Math.min(source.opacity ?? 1, target.opacity ?? 1);

      ctx.beginPath();
      if (showAll) {
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
      } else {
        curve(ctx, source.x, source.y, target.x, target.y);
      }

      if (showAll) {
        applyShowAllStrandStroke(ctx, { active, viewK: view.k });
        if (link.kind === "spoke") {
          ctx.strokeStyle = active ? "#e07a2f" : link.color;
          ctx.globalAlpha = (dim ? 0.05 : active ? 0.75 : SHOW_ALL_SPOKE_ALPHA) * fade;
        } else if (active) {
          ctx.strokeStyle = "#e07a2f";
          ctx.globalAlpha = 0.9 * fade;
        } else {
          ctx.strokeStyle = link.color;
          ctx.globalAlpha = (dim ? 0.05 : link.kind === "overlap" || link.kind === "backbone" ? overlapLinkAlpha() : 0.2) * fade;
        }
      } else if (link.kind === "spoke") {
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

    if (showAll) {
      const drawRings = showAllDrawRings(view.k);
      for (const node of simNodes) {
        if (node.kind === "major" || node.x == null || node.y == null) continue;
        if (!onScreen(node.x, node.y)) continue;
        const { hot, dim } = nodeDrawState(node, emphasis);
        const drawR = canvasRadius(node.r, view.k, 2.2);
        const fade = node.opacity ?? 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, drawR, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = (dim ? 0.14 : hot ? 1 : 0.86) * fade;
        ctx.fill();
        if (drawRings || hot) {
          ctx.globalAlpha = (dim ? 0.3 : 0.9) * fade;
          ctx.lineWidth = (hot ? 2 : 1) / view.k;
          ctx.strokeStyle = hot ? "#e07a2f" : "#fff";
          ctx.stroke();
        }
        if (showAllLabelVisible(node, view.k, hover === node, hot && Boolean(selected))) {
          drawHaloText(node.label.length > 32 ? `${node.label.slice(0, 31)}…` : node.label, node.x + drawR + 6 / view.k, node.y, {
            font: `500 ${11 / view.k}px Inter, ui-sans-serif, sans-serif`,
            align: "left",
            baseline: "middle",
            color: node.ink,
            alpha: fade,
          });
        }
        ctx.globalAlpha = 1;
      }
      const hubs = simNodes.filter(
        node => node.kind === "major" && node.x != null && node.y != null && onScreen(node.x, node.y, 160),
      );
      const labelFont = `600 ${13 / view.k}px Inter, ui-sans-serif, sans-serif`;
      ctx.font = labelFont;
      const labels = placeHubLabels(
        hubs.map(node => ({
          id: node.id,
          x: node.x!,
          y: node.y!,
          coreR: hubCoreRadius(node),
          pinned: node === hover || node.label === selected,
          candidates: hubLabelVariants(node.label).map(text => ({ text, width: ctx.measureText(text).width })),
        })),
        16 / view.k,
        5 / view.k,
        {
          x0: (4 - view.x) / view.k,
          y0: (topInset() - view.y) / view.k,
          x1: (width - 4 - view.x) / view.k,
          y1: (height - 4 - view.y) / view.k,
        },
      );
      for (const node of hubs) drawShowAllHub(node, emphasis);
      for (const node of hubs) {
        const label = labels.get(node.id);
        if (!label) continue;
        const { dim } = nodeDrawState(node, emphasis);
        drawHaloText(label.text, (label.box.x0 + label.box.x1) / 2, (label.box.y0 + label.box.y1) / 2, {
          font: labelFont,
          align: "center",
          baseline: "middle",
          color: node.ink,
          alpha: (dim ? 0.4 : 1) * (node.opacity ?? 1),
        });
      }
      ctx.restore();
      return;
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

  function hubFocus(emphasis: ReturnType<typeof drawArgs>) {
    const pick = (node: GraphNodeDatum | null | undefined) => (node?.kind === "major" ? node.label : null);
    const selectedHub = selected ? pick(simNodes.find(node => node.kind === "major" && node.label === selected)) : null;
    return selectedHub ?? pick(hover) ?? (emphasis.query.trim() ? "" : null);
  }

  /** Shared notes between topics, drawn as soft bands under everything else — the nexus. */
  function drawHubTies(map: Map<string, GraphNodeDatum>, emphasis: ReturnType<typeof drawArgs>) {
    const ties = liveModel.hubTies ?? [];
    if (!ties.length) return;
    const max = ties[0]!.weight || 1;
    const focus = hubFocus(emphasis);
    const noteFocus = Boolean(selected) && focus == null;
    ctx.save();
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    for (const tie of ties) {
      const share = tie.weight / max;
      if (share < 0.1) continue;
      const a = map.get(`major:${tie.a}`);
      const b = map.get(`major:${tie.b}`);
      if (!a || !b || a.departing || b.departing || a.x == null || a.y == null || b.x == null || b.y == null) continue;
      const touches = focus != null && focus !== "" && (tie.a === focus || tie.b === focus);
      const dim = (focus != null && !touches) || noteFocus;
      const fade = Math.min(a.opacity ?? 1, b.opacity ?? 1);
      const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      gradient.addColorStop(0, a.color);
      gradient.addColorStop(1, b.color);
      ctx.strokeStyle = gradient;
      ctx.globalAlpha = (touches ? 0.55 + 0.35 * share : dim ? 0.035 : 0.08 + 0.3 * share) * fade;
      ctx.lineWidth = (1 + 9 * Math.sqrt(share) + (touches ? 1.5 : 0)) / view.k;
      ctx.beginPath();
      curve(ctx, a.x, a.y, b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHaloText(
    text: string,
    x: number,
    y: number,
    style: { font: string; align: CanvasTextAlign; baseline: CanvasTextBaseline; color: string; alpha: number },
  ) {
    ctx.font = style.font;
    ctx.textAlign = style.align;
    ctx.textBaseline = style.baseline;
    ctx.lineJoin = "round";
    ctx.globalAlpha = style.alpha;
    ctx.strokeStyle = "rgba(251, 248, 242, 0.92)";
    ctx.lineWidth = 4 / view.k;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = style.color;
    ctx.fillText(text, x, y);
    ctx.lineJoin = "miter";
    ctx.globalAlpha = 1;
  }

  /** A topic hub: a soft glow and a solid core with its note count. Labels are placed separately. */
  function drawShowAllHub(node: GraphNodeDatum, emphasis: ReturnType<typeof drawArgs>) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const { hot, dim } = nodeDrawState(node, emphasis);
    const fade = node.opacity ?? 1;
    const coreR = hubCoreRadius(node);
    const glowR = coreR * 2.6;
    const glow = ctx.createRadialGradient(x, y, coreR * 0.6, x, y, glowR);
    glow.addColorStop(0, node.soft);
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.globalAlpha = (dim ? 0.15 : hot ? 0.95 : 0.7) * fade;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = (dim ? 0.35 : 1) * fade;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, Math.PI * 2);
    ctx.fillStyle = node.color;
    ctx.fill();
    ctx.lineWidth = (hot ? 3 : 2) / view.k;
    ctx.strokeStyle = hot ? "#e07a2f" : "#fff";
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = `700 ${11 / view.k}px Inter, ui-sans-serif, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(node.count), x, y + 0.5 / view.k);
    ctx.globalAlpha = 1;
  }

  /** Hubs hold a steady on-screen size so the map always has anchors, at any zoom. */
  function hubCoreRadius(node: GraphNodeDatum) {
    return Math.max(node.r, 13 / view.k);
  }

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      viewTouched = true;
      camera = null;
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
    scheduleDraw();
  }

  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          applyHostSize();
        })
      : null;
  resizeObserver?.observe(host);

  draw();
  if (showAllMode) kickAnimations();

  return attachGraphSearch(
    () => {
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
  );
}
