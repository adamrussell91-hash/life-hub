// apps/knowledge/src/stars/panorama.ts
import { buildStarsLayout } from "./templates";
import { createStarPopover } from "./popover";
import type { PageManifestEntry } from "../domain/page";
import type { SavedConstellation } from "./schema";
import {
  bindParallax,
  buildDust,
  configureCanvas,
  css,
  drawDust,
  drawMilkyWay,
  drawNebula,
  drawRipples,
  drawShootingStars,
  drawVignette,
  prefersReducedMotion,
  random,
  seedOf,
  stepRipples,
  stepShootingStars,
  type DustStar,
  type Ripple,
  type ShootingStar,
} from "./canvas";
import { buildSkyIndex, skyIndexRange, type MonthBucket } from "./skyIndex";
import { MONTH_WIDTH_PX, clampMonthIndex, monthDeltaForPixels, screenXForMonth, stepInertia } from "./timeline";

const RESOLVED_BUFFER_MONTHS = 1.5;
const FRICTION = 0.94;
const MIN_VELOCITY = 0.0005;

type ResolvedItem = {
  kind: "constellation" | "note";
  id: string;
  title: string;
  screenX: number;
  screenY: number;
  constellation?: SavedConstellation;
};

export type PanoramaHandlers = {
  onSelectConstellation: (item: SavedConstellation) => void;
  onCenterChange?: (monthIndex: number) => void;
};

export type PanoramaController = {
  setCenterMonthIndex(monthIndex: number): void;
  getCenterMonthIndex(): number;
  destroy(): void;
};

function noteY(pageId: string): number {
  return 0.12 + random(seedOf(pageId))() * 0.72;
}

function drawGlyph(context: CanvasRenderingContext2D, item: SavedConstellation, cx: number, cy: number, goldColor: string) {
  const layout = buildStarsLayout(item.symbol.templateId, item.notes.length);
  const radius = 26 * item.sky.scale;
  const cos = Math.cos(item.sky.rotation);
  const sin = Math.sin(item.sky.rotation);
  const point = (index: number) => {
    const p = layout.points[index]!;
    const dx = (p.x - 0.5) * radius * 2;
    const dy = (p.y - 0.5) * radius * 2;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  };
  context.save();
  context.strokeStyle = goldColor;
  context.lineWidth = 1.1;
  layout.segments.forEach(segment => {
    const sourceId = item.notes[segment.source]?.pageId;
    const targetId = item.notes[segment.target]?.pageId;
    const relation = item.relations.find(candidate =>
      (candidate.sourceId === sourceId && candidate.targetId === targetId) ||
      (candidate.sourceId === targetId && candidate.targetId === sourceId));
    if (!relation) return;
    context.globalAlpha = 0.85;
    context.setLineDash(["complicates", "contrasts"].includes(relation.type) ? [4, 4] : []);
    const start = point(segment.source);
    const end = point(segment.target);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  });
  context.setLineDash([]);
  context.fillStyle = "#ffffff";
  layout.points.forEach((_, index) => {
    const p = point(index);
    context.globalAlpha = 0.95;
    context.beginPath();
    context.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function drawHaze(context: CanvasRenderingContext2D, x: number, y: number, count: number, color: string) {
  const radius = Math.min(70, 18 + count * 6);
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "transparent");
  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = Math.min(0.5, 0.12 + count * 0.05);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function mountStarsPanorama(
  host: HTMLElement,
  constellations: SavedConstellation[],
  entries: PageManifestEntry[],
  initialMonthIndex: number,
  handlers: PanoramaHandlers,
): PanoramaController {
  host.innerHTML = `<canvas class="stars-panorama__canvas" aria-hidden="true"></canvas><div class="stars-panorama__hits"></div>`;
  const canvas = host.querySelector<HTMLCanvasElement>("canvas")!;
  const hitLayer = host.querySelector<HTMLElement>(".stars-panorama__hits")!;
  const reduced = prefersReducedMotion();
  const popover = createStarPopover(host);
  const parallax = bindParallax(host, reduced);
  const skyIndex = buildSkyIndex(entries, constellations);
  const shootSeed = random(seedOf(`panorama-${initialMonthIndex}`));

  let stopped = false;
  let raf = 0;
  let size = { width: 0, height: 0 };
  let dust: DustStar[] = [];
  let colors = { onDark: "white", gold: "white" };
  let shootingStars: ShootingStar[] = [];
  let ripples: Ripple[] = [];
  let center = initialMonthIndex;
  let velocity = 0;
  let dragging = false;
  let dragLast = 0;

  function bounds() {
    return skyIndexRange(skyIndex, initialMonthIndex);
  }

  function setCenter(next: number) {
    const { min, max } = bounds();
    center = clampMonthIndex(next, min - 2, max + 2);
    handlers.onCenterChange?.(center);
  }

  function resolvedItems(): ResolvedItem[] {
    const items: ResolvedItem[] = [];
    for (const bucket of skyIndex.values()) {
      if (Math.abs(bucket.monthIndex - center) > RESOLVED_BUFFER_MONTHS) continue;
      const screenX = screenXForMonth(bucket.monthIndex, center, size.width);
      for (const note of bucket.notes) {
        items.push({ kind: "note", id: note.pageId, title: note.title, screenX, screenY: noteY(note.pageId) * size.height });
      }
      for (const item of bucket.constellations) {
        items.push({ kind: "constellation", id: item.id, title: item.title, screenX, screenY: item.sky.y * size.height, constellation: item });
      }
    }
    return items;
  }

  function hazeBuckets(): MonthBucket[] {
    const result: MonthBucket[] = [];
    for (const bucket of skyIndex.values()) {
      if (Math.abs(bucket.monthIndex - center) > RESOLVED_BUFFER_MONTHS) result.push(bucket);
    }
    return result;
  }

  const hitPool = new Map<string, HTMLButtonElement>();

  function keyFor(item: ResolvedItem): string {
    return `${item.kind}:${item.id}`;
  }

  function createHitButton(item: ResolvedItem): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.kind === "constellation" ? "stars-panorama__hit is-constellation" : "stars-panorama__hit is-note";
    button.setAttribute("aria-label", item.kind === "constellation" ? `Open ${item.title}` : item.title);
    const reveal = () => {
      if (item.kind === "note") popover.showNote({ pageId: item.id, title: item.title, excerpt: "", role: "" }, button);
      else if (item.constellation) popover.showConstellation(item.constellation, button, () => handlers.onSelectConstellation(item.constellation!));
    };
    button.addEventListener("pointerenter", event => { if (event.pointerType === "mouse") reveal(); });
    button.addEventListener("focus", reveal);
    button.addEventListener("pointerleave", () => popover.hideSoon());
    button.addEventListener("blur", () => popover.hideSoon());
    if (item.kind === "constellation") button.onclick = () => handlers.onSelectConstellation(item.constellation!);
    return button;
  }

  function syncHits(items: ResolvedItem[]) {
    const seen = new Set<string>();
    for (const item of items) {
      const key = keyFor(item);
      seen.add(key);
      let button = hitPool.get(key);
      if (!button) {
        button = createHitButton(item);
        hitPool.set(key, button);
        hitLayer.append(button);
      }
      button.style.left = `${item.screenX}px`;
      button.style.top = `${item.screenY}px`;
    }
    for (const [key, button] of hitPool) {
      if (!seen.has(key)) {
        button.remove();
        hitPool.delete(key);
      }
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== undefined && event.button !== 0) return;
    dragging = true;
    velocity = 0;
    dragLast = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - dragLast;
    dragLast = event.clientX;
    const delta = -monthDeltaForPixels(dx, MONTH_WIDTH_PX);
    setCenter(center + delta);
    velocity = delta;
    syncHits(resolvedItems());
  }
  function onPointerUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    syncHits(resolvedItems());
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  const frame = (t: number) => {
    if (stopped) return;
    if (!dragging && Math.abs(velocity) > 0) {
      setCenter(center + velocity);
      velocity = stepInertia(velocity, FRICTION, MIN_VELOCITY);
    }
    const items = resolvedItems();
    syncHits(items);
    const context = canvas.getContext("2d")!;
    const { width, height } = size;
    context.clearRect(0, 0, width, height);
    drawNebula(context, width, height, t, 51023, [colors.gold, colors.onDark]);
    drawMilkyWay(context, width, height, t, 61031, colors.onDark);
    parallax.settle();
    drawDust(context, dust, t, parallax.current);
    for (const bucket of hazeBuckets()) {
      const x = screenXForMonth(bucket.monthIndex, center, width);
      if (x < -80 || x > width + 80) continue;
      drawHaze(context, x, height * 0.5, bucket.notes.length + bucket.constellations.length, colors.gold);
    }
    for (const item of items) {
      if (item.kind === "constellation" && item.constellation) {
        drawGlyph(context, item.constellation, item.screenX, item.screenY, colors.gold);
      } else {
        context.save();
        context.globalAlpha = 0.75;
        context.fillStyle = colors.onDark;
        context.beginPath();
        context.arc(item.screenX, item.screenY, 1.6, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
    shootingStars = stepShootingStars(shootingStars, width, height, shootSeed, reduced);
    drawShootingStars(context, shootingStars, colors.onDark);
    ripples = stepRipples(ripples);
    drawRipples(context, ripples, colors.gold);
    drawVignette(context, width, height);
    if (!reduced) raf = requestAnimationFrame(frame);
  };

  const layoutAll = () => {
    if (stopped) return;
    const { context, width, height } = configureCanvas(canvas, host.getBoundingClientRect());
    context.clearRect(0, 0, width, height);
    size = { width, height };
    colors = { onDark: css("--on-dark", "white"), gold: css("--pastel-gold", "white") };
    dust = buildDust(934857, width, height, Math.max(220, Math.round((width * height) / 4200)));
    syncHits(resolvedItems());
    if (reduced) frame(0);
  };

  const observer = new ResizeObserver(layoutAll);
  observer.observe(host);
  layoutAll();
  if (!reduced) raf = requestAnimationFrame(frame);

  return {
    setCenterMonthIndex(monthIndex) {
      velocity = 0;
      setCenter(monthIndex);
      syncHits(resolvedItems());
    },
    getCenterMonthIndex() {
      return center;
    },
    destroy() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      hitLayer.innerHTML = "";
      hitPool.clear();
    },
  };
}
