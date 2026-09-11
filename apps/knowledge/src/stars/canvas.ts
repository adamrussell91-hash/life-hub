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

function configureCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext("2d")!;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function paintStars(context: CanvasRenderingContext2D, width: number, height: number, seed: number, count: number) {
  const next = random(seed);
  context.save();
  context.fillStyle = css("--on-dark", "white");
  for (let index = 0; index < count; index += 1) {
    const x = next() * width;
    const y = next() * height;
    const radius = 0.35 + next() * 1.15;
    context.globalAlpha = 0.16 + next() * 0.62;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
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
  let stopped = false;

  const paint = () => {
    if (stopped) return;
    const { context, width, height } = configureCanvas(canvas);
    context.clearRect(0, 0, width, height);
    paintStars(context, width, height, seedOf(proposal.title), Math.max(80, Math.round(width * height / 5000)));
    const padX = Math.min(86, width * 0.12);
    const padY = Math.min(62, height * 0.14);
    const point = (index: number) => ({
      x: padX + layout.points[index]!.x * (width - padX * 2),
      y: padY + layout.points[index]!.y * (height - padY * 2),
    });
    context.save();
    context.strokeStyle = css("--pastel-gold", "white");
    context.lineWidth = 1.35;
    context.globalAlpha = 0.82;
    layout.segments.forEach(segment => {
      if (!proposal.notes[segment.source] || !proposal.notes[segment.target]) return;
      const relation = relationForSegment(proposal, segment.source, segment.target);
      if (!relation) return;
      context.setLineDash(relation && ["complicates", "contrasts"].includes(relation.type) ? [6, 5] : []);
      const start = point(segment.source);
      const end = point(segment.target);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    });
    context.restore();

    layer.innerHTML = "";
    proposal.notes.forEach((note, index) => {
      const location = point(index);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stars-node";
      button.style.left = `${location.x}px`;
      button.style.top = `${location.y}px`;
      button.setAttribute("aria-label", `${note.title}. ${note.role}`);
      button.innerHTML = `<span class="stars-node__light" aria-hidden="true"></span><span class="stars-node__title">${escapeText(note.title)}</span>`;
      const relation = proposal.relations.find(item => item.sourceId === note.pageId || item.targetId === note.pageId);
      button.onclick = () => handlers.onSelectNote?.(note, relation);
      button.ondblclick = () => handlers.onOpenNote?.(note.pageId, note.title);
      layer.append(button);
    });
  };

  const observer = new ResizeObserver(paint);
  observer.observe(host);
  paint();
  return () => {
    stopped = true;
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
  let stopped = false;

  const paint = () => {
    if (stopped) return;
    const { context, width, height } = configureCanvas(canvas);
    context.clearRect(0, 0, width, height);
    const angle = annualSkyRotation(date);
    const next = random(934857);
    context.save();
    context.translate(width / 2, height * 0.48);
    context.rotate(angle);
    context.translate(-width / 2, -height * 0.48);
    context.fillStyle = css("--on-dark", "white");
    const visibleNoteCount = Math.max(0, Math.round(noteCount));
    for (let index = 0; index < visibleNoteCount; index += 1) {
      context.globalAlpha = 0.16 + next() * 0.62;
      context.beginPath();
      context.arc(next() * width, next() * height, 0.35 + next() * 1.15, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    layer.innerHTML = "";
    constellations.forEach(item => {
      const position = rotatePoint(item.sky.x, item.sky.y, angle);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stars-sky-object";
      button.style.left = `${position.x * width}px`;
      button.style.top = `${position.y * height}px`;
      button.style.transform = `translate(-50%, -50%) scale(${item.sky.scale})`;
      button.setAttribute("aria-label", `Open ${item.title}, ${item.notes.length} notes`);
      button.innerHTML = `${miniSymbol(item)}<span>${escapeText(item.title)}</span>`;
      const symbol = button.querySelector<SVGElement>("svg");
      if (symbol) symbol.style.transform = `rotate(${angle + item.sky.rotation}rad)`;
      button.onclick = () => onSelect(item);
      layer.append(button);
    });
  };

  const observer = new ResizeObserver(paint);
  observer.observe(host);
  paint();
  return () => {
    stopped = true;
    observer.disconnect();
    layer.innerHTML = "";
  };
}

function escapeText(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
