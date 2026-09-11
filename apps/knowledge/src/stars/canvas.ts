import { buildStarsLayout } from "./templates";
import { createStarPopover } from "./popover";
import type { SavedConstellation, StarsNote, StarsProposal, StarsRelation } from "./schema";

type SymbolHandlers = {
  onSelectNote?: (note: StarsNote, relation?: StarsRelation) => void;
  onOpenNote?: (pageId: string, title: string) => void;
};

function seedOf(value: string) {
  let seed = 2166136261;
  for (const char of value) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function random(seed: number) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function css(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

function configureCanvas(canvas: HTMLCanvasElement, hostRect?: { width: number; height: number }) {
  // Measuring from a rect supplied by an un-transformed ancestor (rather than the
  // canvas's own getBoundingClientRect) keeps drawing/layout math stable even when
  // the canvas sits inside a CSS-scaled pan/zoom camera layer.
  const rect = hostRect ?? canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext("2d")!;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

const STAR_TINTS = ["#ffffff", "#dbe6ff", "#fff2d6", "#ffe1e6"];

function pickTint(next: () => number) {
  const roll = next();
  if (roll < 0.5) return STAR_TINTS[0]!;
  if (roll < 0.8) return STAR_TINTS[1]!;
  if (roll < 0.93) return STAR_TINTS[2]!;
  return STAR_TINTS[3]!;
}

type DustStar = { x: number; y: number; r: number; phase: number; speed: number; layer: number; baseAlpha: number; color: string };

function buildDust(seed: number, width: number, height: number, count: number): DustStar[] {
  const next = random(seed);
  const stars: DustStar[] = [];
  for (let index = 0; index < count; index += 1) {
    const roll = next();
    const layer = roll < 0.6 ? 0 : roll < 0.86 ? 1 : 2;
    const r = layer === 0 ? 0.3 + next() * 0.5 : layer === 1 ? 0.55 + next() * 0.65 : 0.85 + next() * 1;
    stars.push({
      x: next() * width,
      y: next() * height,
      r,
      phase: next() * Math.PI * 2,
      speed: 0.35 + next() * 1.05,
      layer,
      baseAlpha: 0.14 + next() * 0.56,
      color: pickTint(next),
    });
  }
  return stars;
}

function drawDust(context: CanvasRenderingContext2D, stars: DustStar[], t: number, parallax: { x: number; y: number }) {
  context.save();
  for (const star of stars) {
    const depth = star.layer === 0 ? 5 : star.layer === 1 ? 12 : 22;
    const twinkle = 0.5 + 0.5 * Math.sin(t * 0.0011 * star.speed + star.phase);
    const alpha = Math.max(0, Math.min(1, star.baseAlpha * (0.45 + twinkle * 0.65)));
    const x = star.x + parallax.x * depth;
    const y = star.y + parallax.y * depth;
    if (star.layer === 2) {
      const glowR = star.r * 6.5;
      const glow = context.createRadialGradient(x, y, 0, x, y, glowR);
      glow.addColorStop(0, star.color);
      glow.addColorStop(1, "transparent");
      context.globalAlpha = alpha * 0.32;
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, glowR, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = alpha;
    context.fillStyle = star.color;
    context.beginPath();
    context.arc(x, y, star.r, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawNebula(context: CanvasRenderingContext2D, width: number, height: number, t: number, seed: number, colors: string[]) {
  const next = random(seed);
  context.save();
  context.globalCompositeOperation = "lighter";
  colors.forEach((color, index) => {
    const cx0 = 0.22 + next() * 0.56;
    const cy0 = 0.2 + next() * 0.5;
    const wobble = Math.sin(t * 0.00006 + index * 2.4) * 0.035;
    const cx = (cx0 + wobble) * width;
    const cy = (cy0 - wobble * 0.6) * height;
    const radius = (0.4 + next() * 0.22) * Math.max(width, height);
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    context.globalAlpha = 0.16;
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
  context.restore();
}

function drawMilkyWay(context: CanvasRenderingContext2D, width: number, height: number, t: number, seed: number, color: string) {
  const next = random(seed);
  const angle = (-16 + next() * 32) * (Math.PI / 180);
  const cx = width / 2;
  const cy = height / 2;
  context.save();
  context.translate(cx, cy);
  context.rotate(angle + Math.sin(t * 0.00003) * 0.015);
  context.translate(-cx, -cy);
  const bandWidth = Math.max(width, height) * 0.5;
  const gradient = context.createLinearGradient(0, cy - bandWidth / 2, 0, cy + bandWidth / 2);
  gradient.addColorStop(0, "transparent");
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, "transparent");
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = 0.055;
  context.fillStyle = gradient;
  context.fillRect(-width * 0.6, cy - bandWidth / 2, width * 2.2, bandWidth);
  context.restore();
}

function drawVignette(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.22,
    width / 2, height / 2, Math.max(width, height) * 0.75,
  );
  gradient.addColorStop(0, "transparent");
  gradient.addColorStop(1, "rgba(3, 8, 18, 0.42)");
  context.save();
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();
}

type ShootingStar = { x: number; y: number; vx: number; vy: number; age: number; life: number };

function drawShootingStars(context: CanvasRenderingContext2D, stars: ShootingStar[], color: string) {
  context.save();
  context.lineCap = "round";
  for (const star of stars) {
    const alpha = Math.max(0, 1 - star.age / star.life);
    const tailX = star.x - star.vx * 5;
    const tailY = star.y - star.vy * 5;
    const gradient = context.createLinearGradient(star.x, star.y, tailX, tailY);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    context.globalAlpha = alpha;
    context.strokeStyle = gradient;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(star.x, star.y);
    context.lineTo(tailX, tailY);
    context.stroke();
  }
  context.restore();
}

function stepShootingStars(stars: ShootingStar[], width: number, height: number, next: () => number, reduced: boolean) {
  if (reduced) return stars;
  for (const star of stars) {
    star.x += star.vx;
    star.y += star.vy;
    star.age += 1;
  }
  const alive = stars.filter(star => star.age < star.life && star.x < width + 60 && star.y < height + 60);
  if (alive.length < 1 && next() < 0.0035) {
    const speed = 7 + next() * 5;
    const angle = Math.PI / 4 + (next() - 0.5) * 0.3;
    alive.push({
      x: next() * width * 0.5,
      y: -20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: 34 + next() * 18,
    });
  }
  return alive;
}

type Ripple = { x: number; y: number; age: number; life: number };

function stepRipples(ripples: Ripple[]) {
  for (const ripple of ripples) ripple.age += 1;
  return ripples.filter(ripple => ripple.age < ripple.life);
}

function drawRipples(context: CanvasRenderingContext2D, ripples: Ripple[], color: string) {
  context.save();
  context.lineCap = "round";
  for (const ripple of ripples) {
    const progress = ripple.age / ripple.life;
    context.globalAlpha = Math.max(0, (1 - progress) * 0.55);
    context.strokeStyle = color;
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(ripple.x, ripple.y, 4 + progress * 36, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function revealDelay(index: number) {
  return `${Math.min(index, 22) * 42}ms`;
}

function relationForSegment(proposal: StarsProposal, source: number, target: number) {
  const sourceId = proposal.notes[source]?.pageId;
  const targetId = proposal.notes[target]?.pageId;
  return proposal.relations.find(relation =>
    (relation.sourceId === sourceId && relation.targetId === targetId) ||
    (relation.sourceId === targetId && relation.targetId === sourceId),
  );
}

function bindParallax(host: HTMLElement, reduced: boolean) {
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  if (reduced) return { target, current, settle() {} };
  const onMove = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    target.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    target.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  const onLeave = () => {
    target.x = 0;
    target.y = 0;
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointerup", onLeave);
  return {
    target,
    current,
    settle() {
      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.06;
    },
  };
}

export function mountStarsSymbol(host: HTMLElement, proposal: StarsProposal, handlers: SymbolHandlers = {}) {
  host.innerHTML = `<canvas class="stars-symbol__canvas" aria-hidden="true"></canvas><div class="stars-symbol__nodes"></div>`;
  const canvas = host.querySelector<HTMLCanvasElement>("canvas")!;
  const layer = host.querySelector<HTMLElement>(".stars-symbol__nodes")!;
  const layout = buildStarsLayout(proposal.symbol.templateId, proposal.notes.length);
  const reduced = prefersReducedMotion();
  const popover = createStarPopover(host);
  const parallax = bindParallax(host, reduced);
  let stopped = false;
  let raf = 0;
  let size = { width: 0, height: 0 };
  let dust: DustStar[] = [];
  let colors = { onDark: "white", gold: "white" };
  let ripples: Ripple[] = [];
  const nebulaSeed = seedOf(proposal.title);
  const mountedAt = performance.now();

  const point = (index: number) => {
    const padX = Math.min(86, size.width * 0.12);
    const padY = Math.min(62, size.height * 0.14);
    return {
      x: padX + layout.points[index]!.x * (size.width - padX * 2),
      y: padY + layout.points[index]!.y * (size.height - padY * 2),
    };
  };

  const drawForeground = (context: CanvasRenderingContext2D, t: number) => {
    const revealed = reduced ? 1 : Math.min(1, (t - mountedAt) / 700);
    context.save();
    context.strokeStyle = colors.gold;
    context.lineWidth = 1.35;
    layout.segments.forEach((segment, index) => {
      if (!proposal.notes[segment.source] || !proposal.notes[segment.target]) return;
      const relation = relationForSegment(proposal, segment.source, segment.target);
      if (!relation) return;
      const segProgress = Math.max(0, Math.min(1, revealed * layout.segments.length - index));
      if (segProgress <= 0) return;
      context.globalAlpha = 0.82 * segProgress;
      context.setLineDash(["complicates", "contrasts"].includes(relation.type) ? [6, 5] : []);
      const start = point(segment.source);
      const end = point(segment.target);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    });
    context.restore();
  };

  const frame = (t: number) => {
    if (stopped) return;
    const context = canvas.getContext("2d")!;
    const { width, height } = size;
    context.clearRect(0, 0, width, height);
    drawNebula(context, width, height, t, nebulaSeed, [colors.gold, colors.onDark]);
    drawMilkyWay(context, width, height, t, nebulaSeed + 7, colors.onDark);
    parallax.settle();
    drawDust(context, dust, t, parallax.current);
    drawForeground(context, t);
    ripples = stepRipples(ripples);
    drawRipples(context, ripples, colors.gold);
    drawVignette(context, width, height);
    if (!reduced) raf = requestAnimationFrame(frame);
  };

  const layoutAll = () => {
    if (stopped) return;
    const { context, width, height } = configureCanvas(canvas);
    context.clearRect(0, 0, width, height);
    size = { width, height };
    colors = { onDark: css("--on-dark", "white"), gold: css("--pastel-gold", "white") };
    dust = buildDust(nebulaSeed, width, height, Math.max(80, Math.round((width * height) / 5000)));

    layer.innerHTML = "";
    proposal.notes.forEach((note, index) => {
      const location = point(index);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stars-node";
      button.style.left = `${location.x}px`;
      button.style.top = `${location.y}px`;
      button.style.setProperty("--twinkle-delay", `${(seedOf(note.pageId) % 4000) / 1000}s`);
      button.style.setProperty("--reveal-delay", revealDelay(index));
      button.setAttribute("aria-label", `${note.title}. ${note.role}`);
      button.innerHTML = `<span class="stars-node__light" aria-hidden="true"></span>`;
      const relation = proposal.relations.find(item => item.sourceId === note.pageId || item.targetId === note.pageId);
      const reveal = () => popover.showNote(note, button);
      button.addEventListener("pointerenter", event => {
        if (event.pointerType === "mouse") reveal();
      });
      button.addEventListener("focus", reveal);
      button.addEventListener("pointerleave", () => popover.hideSoon());
      button.addEventListener("blur", () => popover.hideSoon());
      button.onclick = () => {
        if (!reduced) ripples.push({ x: location.x, y: location.y, age: 0, life: 26 });
        handlers.onSelectNote?.(note, relation);
      };
      button.ondblclick = () => handlers.onOpenNote?.(note.pageId, note.title);
      layer.append(button);
    });

    if (reduced) frame(0);
  };

  const observer = new ResizeObserver(layoutAll);
  observer.observe(host);
  layoutAll();
  if (!reduced) raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    observer.disconnect();
    layer.innerHTML = "";
  };
}

export function annualSkyRotation(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const next = Date.UTC(date.getUTCFullYear() + 1, 0, 1);
  const progress = (date.getTime() - start) / (next - start);
  return progress * Math.PI * 2;
}

function rotatePoint(x: number, y: number, angle: number) {
  const dx = x - 0.5;
  const dy = y - 0.48;
  return {
    x: 0.5 + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: 0.48 + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

function miniSymbol(item: SavedConstellation) {
  const layout = buildStarsLayout(item.symbol.templateId, item.notes.length);
  const lines = layout.segments.map(segment => {
    const start = layout.points[segment.source]!;
    const end = layout.points[segment.target]!;
    return `<line x1="${start.x * 100}" y1="${start.y * 70}" x2="${end.x * 100}" y2="${end.y * 70}" />`;
  }).join("");
  const stars = layout.points.map(point => `<circle cx="${point.x * 100}" cy="${point.y * 70}" r="1.8" />`).join("");
  return `<svg viewBox="0 0 100 70" aria-hidden="true">${lines}${stars}</svg>`;
}

const SKY_MIN_SCALE = 1;
const SKY_MAX_SCALE = 2.6;
const SKY_ZOOM_STEP = 1.35;

type SkyCamera = { scale: number; x: number; y: number };

export function mountStarsSky(
  host: HTMLElement,
  constellations: SavedConstellation[],
  date: Date,
  onSelect: (item: SavedConstellation) => void,
) {
  host.innerHTML = `
    <div class="stars-sky__camera" data-stars-camera>
      <canvas class="stars-sky__canvas" aria-hidden="true"></canvas>
      <div class="stars-sky__objects"></div>
    </div>
    <div class="stars-sky-zoom" role="group" aria-label="Sky zoom">
      <button type="button" class="btn btn--ghost" data-stars-zoom="in" aria-label="Zoom in">+</button>
      <button type="button" class="btn btn--ghost" data-stars-zoom="out" aria-label="Zoom out">−</button>
      <button type="button" class="btn btn--ghost" data-stars-zoom="reset" aria-label="Reset zoom">⤾</button>
    </div>
  `;
  const cameraEl = host.querySelector<HTMLElement>("[data-stars-camera]")!;
  const canvas = host.querySelector<HTMLCanvasElement>("canvas")!;
  const layer = host.querySelector<HTMLElement>(".stars-sky__objects")!;
  const zoomInBtn = host.querySelector<HTMLButtonElement>('[data-stars-zoom="in"]')!;
  const zoomOutBtn = host.querySelector<HTMLButtonElement>('[data-stars-zoom="out"]')!;
  const zoomResetBtn = host.querySelector<HTMLButtonElement>('[data-stars-zoom="reset"]')!;
  const reduced = prefersReducedMotion();
  const popover = createStarPopover(host);
  const parallax = bindParallax(host, reduced);
  let stopped = false;
  let raf = 0;
  let size = { width: 0, height: 0 };
  let dust: DustStar[] = [];
  let colors = { onDark: "white", gold: "white" };
  let shootingStars: ShootingStar[] = [];
  let ripples: Ripple[] = [];
  let openPopoverId: string | null = null;
  let view: SkyCamera = { scale: SKY_MIN_SCALE, x: 0, y: 0 };
  const angle = annualSkyRotation(date);
  const shootSeed = random(seedOf(`${date.toISOString()}-shoot`));

  function clampView(next: SkyCamera): SkyCamera {
    const scale = Math.max(SKY_MIN_SCALE, Math.min(SKY_MAX_SCALE, next.scale));
    const maxX = (size.width * (scale - 1)) / 2;
    const maxY = (size.height * (scale - 1)) / 2;
    return {
      scale,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }

  function applyView() {
    cameraEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    zoomOutBtn.disabled = view.scale <= SKY_MIN_SCALE;
    zoomInBtn.disabled = view.scale >= SKY_MAX_SCALE;
  }

  function setScale(nextScale: number) {
    view = clampView({ ...view, scale: nextScale });
    applyView();
  }

  zoomInBtn.onclick = () => setScale(view.scale * SKY_ZOOM_STEP);
  zoomOutBtn.onclick = () => setScale(view.scale / SKY_ZOOM_STEP);
  zoomResetBtn.onclick = () => {
    view = { scale: SKY_MIN_SCALE, x: 0, y: 0 };
    applyView();
  };

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    setScale(view.scale * (event.deltaY < 0 ? SKY_ZOOM_STEP : 1 / SKY_ZOOM_STEP));
  }
  cameraEl.addEventListener("wheel", onWheel, { passive: false });

  let dragging = false;
  let dragLast = { x: 0, y: 0 };
  function isDragBlocked(target: EventTarget | null) {
    return target instanceof Element && !!target.closest(".stars-sky-object");
  }
  function onPointerDown(event: PointerEvent) {
    if (event.button !== undefined && event.button !== 0) return;
    if (isDragBlocked(event.target)) return;
    dragging = true;
    dragLast = { x: event.clientX, y: event.clientY };
    cameraEl.setPointerCapture(event.pointerId);
    cameraEl.classList.add("is-dragging");
  }
  function onPointerMoveDrag(event: PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - dragLast.x;
    const dy = event.clientY - dragLast.y;
    dragLast = { x: event.clientX, y: event.clientY };
    view = clampView({ ...view, x: view.x + dx, y: view.y + dy });
    applyView();
  }
  function onPointerUpDrag(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    cameraEl.classList.remove("is-dragging");
    try { cameraEl.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  }
  cameraEl.addEventListener("pointerdown", onPointerDown);
  cameraEl.addEventListener("pointermove", onPointerMoveDrag);
  cameraEl.addEventListener("pointerup", onPointerUpDrag);
  cameraEl.addEventListener("pointercancel", onPointerUpDrag);

  function closeCard() {
    openPopoverId = null;
    popover.hideSoon();
  }

  function onDocumentPointerDown(event: PointerEvent) {
    const target = event.target as Node | null;
    if (target && popover.el.contains(target)) return;
    if (target instanceof Element && target.closest(".stars-sky-object")) return;
    openPopoverId = null;
    popover.hideNow();
  }
  document.addEventListener("pointerdown", onDocumentPointerDown);

  const frame = (t: number) => {
    if (stopped) return;
    const context = canvas.getContext("2d")!;
    const { width, height } = size;
    context.clearRect(0, 0, width, height);
    drawNebula(context, width, height, t, 51023, [colors.gold, colors.onDark]);
    drawMilkyWay(context, width, height, t, 61031, colors.onDark);
    parallax.settle();
    context.save();
    context.translate(width / 2, height * 0.48);
    context.rotate(angle);
    context.translate(-width / 2, -height * 0.48);
    drawDust(context, dust, t, parallax.current);
    context.restore();
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
    // Density scales with the visible area (with a floor) so the sky always reads as
    // full — it must never depend on how many notes/constellations exist, or a small
    // archive renders a sparse, patchy field instead of a real starfield.
    const density = Math.max(220, Math.round((width * height) / 4200));
    dust = buildDust(934857, width, height, density);
    view = clampView(view);
    applyView();

    layer.innerHTML = "";
    constellations.forEach((item, index) => {
      const position = rotatePoint(item.sky.x, item.sky.y, angle);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stars-sky-object";
      button.style.left = `${position.x * width}px`;
      button.style.top = `${position.y * height}px`;
      button.style.setProperty("--sky-scale", String(item.sky.scale));
      button.style.setProperty("--twinkle-delay", `${(seedOf(item.id) % 4000) / 1000}s`);
      button.style.setProperty("--reveal-delay", revealDelay(index));
      button.setAttribute("aria-label", `Open ${item.title}, ${item.notes.length} notes`);
      button.innerHTML = miniSymbol(item);
      const symbol = button.querySelector<SVGElement>("svg");
      if (symbol) symbol.style.transform = `rotate(${angle + item.sky.rotation}rad)`;

      const commit = () => {
        if (!reduced) ripples.push({ x: position.x * width, y: position.y * height, age: 0, life: 26 });
        onSelect(item);
      };
      const showCard = () => {
        openPopoverId = item.id;
        popover.showConstellation(item, button, commit);
      };
      button.addEventListener("pointerenter", event => {
        if (event.pointerType === "mouse") showCard();
      });
      button.addEventListener("focus", showCard);
      button.addEventListener("pointerleave", () => closeCard());
      button.addEventListener("blur", () => closeCard());
      button.onclick = () => {
        if (openPopoverId === item.id && !popover.el.hidden) {
          commit();
          return;
        }
        showCard();
      };
      layer.append(button);
    });

    if (reduced) frame(0);
  };

  const observer = new ResizeObserver(layoutAll);
  observer.observe(host);
  layoutAll();
  if (!reduced) raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener("pointerdown", onDocumentPointerDown);
    observer.disconnect();
    layer.innerHTML = "";
  };
}
