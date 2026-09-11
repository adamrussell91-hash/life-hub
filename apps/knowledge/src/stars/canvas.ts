import { buildStarsLayout } from "./templates";
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

function configureCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext("2d")!;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

type DustStar = { x: number; y: number; r: number; phase: number; speed: number; layer: number; baseAlpha: number };

function buildDust(seed: number, width: number, height: number, count: number): DustStar[] {
  const next = random(seed);
  const stars: DustStar[] = [];
  for (let index = 0; index < count; index += 1) {
    const roll = next();
    const layer = roll < 0.62 ? 0 : roll < 0.88 ? 1 : 2;
    const r = layer === 0 ? 0.3 + next() * 0.5 : layer === 1 ? 0.55 + next() * 0.65 : 0.85 + next() * 1;
    stars.push({
      x: next() * width,
      y: next() * height,
      r,
      phase: next() * Math.PI * 2,
      speed: 0.35 + next() * 1.05,
      layer,
      baseAlpha: 0.14 + next() * 0.56,
    });
  }
  return stars;
}

function drawDust(context: CanvasRenderingContext2D, stars: DustStar[], color: string, t: number, parallax: { x: number; y: number }) {
  context.save();
  context.fillStyle = color;
  for (const star of stars) {
    const depth = star.layer === 0 ? 5 : star.layer === 1 ? 12 : 22;
    const twinkle = 0.5 + 0.5 * Math.sin(t * 0.0011 * star.speed + star.phase);
    context.globalAlpha = Math.max(0, Math.min(1, star.baseAlpha * (0.45 + twinkle * 0.65)));
    context.beginPath();
    context.arc(star.x + parallax.x * depth, star.y + parallax.y * depth, star.r, 0, Math.PI * 2);
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

function createTooltip(host: HTMLElement) {
  const tip = document.createElement("div");
  tip.className = "graph-tip stars-tip";
  tip.hidden = true;
  host.appendChild(tip);
  const hostRect = () => host.getBoundingClientRect();
  return {
    el: tip,
    show(text: string, clientX: number, clientY: number) {
      const rect = hostRect();
      tip.textContent = text;
      tip.hidden = false;
      const left = Math.min(Math.max(clientX - rect.left + 14, 8), rect.width - 8);
      const top = Math.min(Math.max(clientY - rect.top + 14, 8), rect.height - 8);
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

function bindTooltip(button: HTMLElement, tooltip: ReturnType<typeof createTooltip>, text: string) {
  button.setAttribute("title", text);
  const reveal = (event: { clientX: number; clientY: number }) => tooltip.show(text, event.clientX, event.clientY);
  button.addEventListener("pointerenter", reveal);
  button.addEventListener("pointermove", reveal);
  button.addEventListener("pointerdown", reveal);
  button.addEventListener("focus", () => {
    const rect = button.getBoundingClientRect();
    tooltip.show(text, rect.left + rect.width / 2, rect.top);
  });
  button.addEventListener("pointerleave", () => tooltip.hide());
  button.addEventListener("blur", () => tooltip.hide());
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

function relationForSegment(proposal: StarsProposal, source: number, target: number) {
  const sourceId = proposal.notes[source]?.pageId;
  const targetId = proposal.notes[target]?.pageId;
  return proposal.relations.find(relation =>
    (relation.sourceId === sourceId && relation.targetId === targetId) ||
    (relation.sourceId === targetId && relation.targetId === sourceId),
  );
}

export function mountStarsSymbol(host: HTMLElement, proposal: StarsProposal, handlers: SymbolHandlers = {}) {
  host.innerHTML = `<canvas class="stars-symbol__canvas" aria-hidden="true"></canvas><div class="stars-symbol__nodes"></div>`;
  const canvas = host.querySelector<HTMLCanvasElement>("canvas")!;
  const layer = host.querySelector<HTMLElement>(".stars-symbol__nodes")!;
  const layout = buildStarsLayout(proposal.symbol.templateId, proposal.notes.length);
  const reduced = prefersReducedMotion();
  const tooltip = createTooltip(host);
  const parallax = bindParallax(host, reduced);
  let stopped = false;
  let raf = 0;
  let size = { width: 0, height: 0 };
  let dust: DustStar[] = [];
  let colors = { onDark: "white", gold: "white" };
  const nebulaSeed = seedOf(proposal.title);

  const point = (index: number) => {
    const padX = Math.min(86, size.width * 0.12);
    const padY = Math.min(62, size.height * 0.14);
    return {
      x: padX + layout.points[index]!.x * (size.width - padX * 2),
      y: padY + layout.points[index]!.y * (size.height - padY * 2),
    };
  };

  const drawForeground = (context: CanvasRenderingContext2D) => {
    context.save();
    context.strokeStyle = colors.gold;
    context.lineWidth = 1.35;
    context.globalAlpha = 0.82;
    layout.segments.forEach(segment => {
      if (!proposal.notes[segment.source] || !proposal.notes[segment.target]) return;
      const relation = relationForSegment(proposal, segment.source, segment.target);
      if (!relation) return;
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
    parallax.settle();
    drawDust(context, dust, colors.onDark, t, parallax.current);
    drawForeground(context);
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
      button.setAttribute("aria-label", `${note.title}. ${note.role}`);
      button.innerHTML = `<span class="stars-node__light" aria-hidden="true"></span>`;
      bindTooltip(button, tooltip, note.title);
      const relation = proposal.relations.find(item => item.sourceId === note.pageId || item.targetId === note.pageId);
      button.onclick = () => handlers.onSelectNote?.(note, relation);
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

export function mountStarsSky(
  host: HTMLElement,
  constellations: SavedConstellation[],
  date: Date,
  onSelect: (item: SavedConstellation) => void,
  noteCount = 0,
) {
  host.innerHTML = `<canvas class="stars-sky__canvas" aria-hidden="true"></canvas><div class="stars-sky__objects"></div>`;
  const canvas = host.querySelector<HTMLCanvasElement>("canvas")!;
  const layer = host.querySelector<HTMLElement>(".stars-sky__objects")!;
  const reduced = prefersReducedMotion();
  const tooltip = createTooltip(host);
  const parallax = bindParallax(host, reduced);
  let stopped = false;
  let raf = 0;
  let size = { width: 0, height: 0 };
  let dust: DustStar[] = [];
  let colors = { onDark: "white", gold: "white" };
  let shootingStars: ShootingStar[] = [];
  const angle = annualSkyRotation(date);
  const shootSeed = random(seedOf(`${date.toISOString()}-shoot`));

  const frame = (t: number) => {
    if (stopped) return;
    const context = canvas.getContext("2d")!;
    const { width, height } = size;
    context.clearRect(0, 0, width, height);
    drawNebula(context, width, height, t, 51023, [colors.gold, colors.onDark]);
    parallax.settle();
    context.save();
    context.translate(width / 2, height * 0.48);
    context.rotate(angle);
    context.translate(-width / 2, -height * 0.48);
    drawDust(context, dust, colors.onDark, t, parallax.current);
    context.restore();
    shootingStars = stepShootingStars(shootingStars, width, height, shootSeed, reduced);
    drawShootingStars(context, shootingStars, colors.onDark);
    if (!reduced) raf = requestAnimationFrame(frame);
  };

  const layoutAll = () => {
    if (stopped) return;
    const { context, width, height } = configureCanvas(canvas);
    context.clearRect(0, 0, width, height);
    size = { width, height };
    colors = { onDark: css("--on-dark", "white"), gold: css("--pastel-gold", "white") };
    const visibleNoteCount = Math.max(0, Math.round(noteCount));
    dust = buildDust(934857, width, height, visibleNoteCount);

    layer.innerHTML = "";
    constellations.forEach(item => {
      const position = rotatePoint(item.sky.x, item.sky.y, angle);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stars-sky-object";
      button.style.left = `${position.x * width}px`;
      button.style.top = `${position.y * height}px`;
      button.style.transform = `translate(-50%, -50%) scale(${item.sky.scale})`;
      button.style.setProperty("--twinkle-delay", `${(seedOf(item.id) % 4000) / 1000}s`);
      button.setAttribute("aria-label", `Open ${item.title}, ${item.notes.length} notes`);
      button.innerHTML = miniSymbol(item);
      const symbol = button.querySelector<SVGElement>("svg");
      if (symbol) symbol.style.transform = `rotate(${angle + item.sky.rotation}rad)`;
      bindTooltip(button, tooltip, `${item.title} · ${item.notes.length} notes`);
      button.onclick = () => onSelect(item);
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
