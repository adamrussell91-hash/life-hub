/**
 * Mind map / concept map model, layout and drawing, shared by Tasks and Teaching.
 * Every view of a block (outline preview, canvas editor, read-only, full screen)
 * is drawn by the functions in this file so they can never disagree.
 */

export type GraphKind = 'mind' | 'concept';
export type GraphMode = 'outline' | 'canvas';

export type GraphNode = {
  id: string;
  label: string;
  parent_id?: string | null;
  color?: string;
  x?: number;
  y?: number;
};

export type GraphEdge = { id: string; from: string; to: string; label?: string };

export type GraphContent = {
  title?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  mode?: GraphMode;
};

export const COLOURS = ['blue', 'sage', 'peach', 'lilac', 'gold'] as const;
export type Colour = (typeof COLOURS)[number];

export const LINK_VERBS = ['leads to', 'causes', 'is part of', 'contrasts with', 'is an example of', 'depends on'];
export const MAX_NODES = 24;
export const MAX_EDGES = 40;

/* Teaching's previous editor stored swatch hex values. */
const LEGACY_HEX: Record<string, Colour> = {
  '#dceafa': 'blue',
  '#376fb7': 'blue',
  '#dfe9e1': 'sage',
  '#f2dfd0': 'peach',
  '#f68620': 'peach',
  '#e8e0f1': 'lilac',
  '#f1e2b6': 'gold'
};

export function colourOf(value: string | undefined): Colour | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if ((COLOURS as readonly string[]).includes(v)) return v as Colour;
  return LEGACY_HEX[v];
}

export function modeOf(kind: GraphKind, content: GraphContent): GraphMode {
  if (content.mode === 'outline' || content.mode === 'canvas') return content.mode;
  const placed = content.nodes.length > 0 && content.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  return kind === 'concept' && placed ? 'canvas' : 'outline';
}

export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let i = used.size + 1;
  while (used.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

export const esc = (s: string): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Some generated mind maps only say who hangs off whom through edges; read those as parents. */
export function withParents(kind: GraphKind, content: GraphContent): GraphContent {
  if (kind !== 'mind') return content;
  const ids = new Set(content.nodes.map((n) => n.id));
  const parentOf = new Map<string, string>();
  for (const e of content.edges ?? []) if (ids.has(e.from) && e.from !== e.to && !parentOf.has(e.to)) parentOf.set(e.to, e.from);
  if (!content.nodes.some((n) => n.parent_id == null && parentOf.has(n.id))) return content;
  const root = content.nodes.find((n) => n.parent_id == null && !parentOf.has(n.id));
  return {
    ...content,
    nodes: content.nodes.map((n) => (n.parent_id == null && n !== root && parentOf.has(n.id) ? { ...n, parent_id: parentOf.get(n.id)! } : n))
  };
}

/* ── Tree ── */

export type TreeNode = GraphNode & { kids: TreeNode[]; depth: number; branch: Colour | 'navy' };

/** Tree in input order (outline order is meaningful). Extra roots and orphaned cycles hang off the first root. */
export function buildTree(nodes: GraphNode[]): TreeNode | null {
  const byId = new Map<string, TreeNode>(nodes.map((n) => [n.id, { ...n, kids: [], depth: 0, branch: 'navy' }]));
  const all = [...byId.values()];
  const root = all.find((n) => n.parent_id == null || !byId.has(n.parent_id)) ?? all[0];
  if (!root) return null;
  const parentOf = new Map<string, TreeNode>();
  root.parent_id = null;
  for (const n of all) {
    if (n === root) continue;
    const p = n.parent_id != null ? byId.get(n.parent_id) : undefined;
    const parent = p && p !== n ? p : root;
    parent.kids.push(n);
    parentOf.set(n.id, parent);
    n.parent_id = parent.id;
  }
  const reached = new Set<string>();
  const walk = (n: TreeNode, depth: number, branch: Colour | 'navy') => {
    reached.add(n.id);
    n.depth = depth;
    n.branch = branch;
    n.kids.forEach((k, i) => walk(k, depth + 1, depth === 0 ? (colourOf(k.color) ?? COLOURS[i % COLOURS.length]!) : branch));
  };
  walk(root, 0, 'navy');
  for (const n of all) {
    if (reached.has(n.id)) continue;
    const old = parentOf.get(n.id);
    if (old) old.kids = old.kids.filter((k) => k !== n);
    root.kids.push(n);
    parentOf.set(n.id, root);
    n.parent_id = root.id;
    reached.clear();
    walk(root, 0, 'navy');
  }
  return root;
}

export function flatten(root: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    out.push(n);
    n.kids.forEach(walk);
  };
  walk(root);
  return out;
}

const leafWeight = (n: TreeNode): number => (n.kids.length ? n.kids.reduce((s, k) => s + leafWeight(k), 0) : 1);

/* ── Text ── */

let measureCtx: CanvasRenderingContext2D | null | undefined;
export function textWidth(text: string, size: number, weight: number): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (measureCtx) {
    measureCtx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
    const w = measureCtx.measureText(text).width;
    if (w > 0 || !text) return w;
  }
  return text.length * size * 0.56;
}

type Box = { size: number; weight: number; padX: number; padY: number; lineH: number; maxW: number };

export type Placed = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  box: Box;
  depth: number;
  branch: Colour | 'navy';
  parent_id?: string | null;
  side?: number;
};

function wrapLines(text: string, box: Box): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const max = box.maxW - box.padX * 2;
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || textWidth(next, box.size, box.weight) <= max) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = `${lines[2]}…`;
  }
  return lines;
}

function sized(n: { label: string }, box: Box, minW = 0) {
  const lines = wrapLines(n.label || 'Untitled', box);
  const widest = Math.max(...lines.map((l) => textWidth(l, box.size, box.weight)), minW - box.padX * 2);
  return { lines, box, w: Math.ceil(widest + box.padX * 2), h: Math.ceil(lines.length * box.lineH + box.padY * 2) };
}

export type Rect = { x: number; y: number; w: number; h: number };

export function boundsOf(rects: Array<{ x: number; y: number; w: number; h: number }>, pad: number): Rect {
  if (!rects.length) return { x: -pad, y: -pad, w: pad * 2, h: pad * 2 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x - r.w / 2);
    y0 = Math.min(y0, r.y - r.h / 2);
    x1 = Math.max(x1, r.x + r.w / 2);
    y1 = Math.max(y1, r.y + r.h / 2);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/* ── Geometry ── */

type Pt = { x: number; y: number };
const fmt = (v: number) => v.toFixed(1);

export function rectExit(n: Rect, tx: number, ty: number, pad = 0): Pt {
  const dx = tx - n.x;
  const dy = ty - n.y;
  if (!dx && !dy) return { x: n.x, y: n.y };
  const hw = n.w / 2 + pad;
  const hh = n.h / 2 + pad;
  const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: n.x + dx * s, y: n.y + dy * s };
}

function cubicAt(p: Pt[], t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p[0]!.x + 3 * u * u * t * p[1]!.x + 3 * u * t * t * p[2]!.x + t * t * t * p[3]!.x,
    y: u * u * u * p[0]!.y + 3 * u * u * t * p[1]!.y + 3 * u * t * t * p[2]!.y + t * t * t * p[3]!.y
  };
}

function quadAt(p: Pt[], t: number): Pt {
  const u = 1 - t;
  return { x: u * u * p[0]!.x + 2 * u * t * p[1]!.x + t * t * p[2]!.x, y: u * u * p[0]!.y + 2 * u * t * p[1]!.y + t * t * p[2]!.y };
}

function taperedPath(p: Pt[], w0: number, w1: number): string {
  const N = 28;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) pts.push(cubicAt(p, i / N));
  const left: string[] = [];
  const right: string[] = [];
  pts.forEach((pt, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(N, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / N)) / 2;
    left.push(`${fmt(pt.x - (dy / len) * w)},${fmt(pt.y + (dx / len) * w)}`);
    right.push(`${fmt(pt.x + (dy / len) * w)},${fmt(pt.y - (dx / len) * w)}`);
  });
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}

function textLines(n: Placed, x: number, colour: string, anchor = 'middle'): string {
  const { box } = n;
  const top = n.y - (n.lines.length * box.lineH) / 2 + box.lineH * 0.72;
  const tspans = n.lines.map((line, i) => `<tspan x="${fmt(x)}" y="${fmt(top + i * box.lineH)}">${esc(line)}</tspan>`).join('');
  return `<text font-size="${box.size}" font-weight="${box.weight}" style="fill:${colour}" text-anchor="${anchor}">${tspans}</text>`;
}

export type Chip = { id: string; label: string; w: number; h: number; x: number; y: number; missing: boolean; at: (t: number) => Pt };

function chipFor(id: string, label: string | undefined, at: (t: number) => Pt): Chip {
  const missing = !String(label ?? '').trim();
  const text = missing ? 'add a verb' : String(label).trim();
  return { id, label: text, missing, at, w: Math.ceil(textWidth(text, 12, 500) + 18), h: 22, x: 0, y: 0 };
}

/** Labels try positions along their curve until one clears the boxes and earlier labels. */
function placeChips(chips: Chip[], obstacles: Rect[]): void {
  const placed: Rect[] = [];
  const hit = (a: Rect, b: Rect) => Math.abs(a.x - b.x) * 2 < a.w + b.w + 6 && Math.abs(a.y - b.y) * 2 < a.h + b.h + 4;
  for (const chip of chips) {
    let best: Rect | null = null;
    for (const t of [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75]) {
      const at = chip.at(t);
      const r = { x: at.x, y: at.y, w: chip.w, h: chip.h };
      if (![...obstacles, ...placed].some((o) => hit(r, o))) {
        best = r;
        break;
      }
      best ||= r;
    }
    chip.x = best!.x;
    chip.y = best!.y;
    placed.push(best!);
  }
}

function chipSvg(c: Chip, selected: boolean, interactive: boolean): string {
  const stroke = c.missing ? 'var(--high-sea-ink)' : selected ? 'var(--wave)' : 'var(--line)';
  const dash = c.missing ? ' stroke-dasharray="3 3"' : '';
  const attrs = interactive ? ` class="graph-svg__chip${selected ? ' is-selected' : ''}" data-edge="${esc(c.id)}"` : ' class="graph-svg__chip"';
  return (
    `<g${attrs}><rect x="${fmt(c.x - c.w / 2)}" y="${fmt(c.y - c.h / 2)}" width="${c.w}" height="${c.h}" rx="11" style="fill:var(--paper);stroke:${stroke}"${dash} stroke-width="${selected ? 1.5 : 1}"/>` +
    `<text x="${fmt(c.x)}" y="${fmt(c.y + 4)}" font-size="12" font-weight="500" style="fill:${c.missing ? 'var(--high-sea-ink)' : 'var(--orca)'}" text-anchor="middle">${esc(c.label)}</text></g>`
  );
}

let markerSeq = 0;
function arrowDefs(): { id: string; defs: string } {
  const id = `graph-arrow-${++markerSeq}`;
  return {
    id,
    defs: `<defs><marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.2 L9 5 L1 8.8 Z" style="fill:var(--orca)"/></marker></defs>`
  };
}

const inkOf = (c: Colour | 'navy') => (c === 'navy' ? 'var(--navy)' : `var(--pastel-${c}-ink)`);
const fillOf = (c: Colour | 'navy') => (c === 'navy' ? 'var(--pastel-blue)' : `var(--pastel-${c})`);
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

export type Scene = { markup: string; bounds: Rect; nodes: Map<string, Placed>; chips: Chip[]; root?: Placed };

type DrawState = {
  selected?: string | null;
  selectedEdge?: string | null;
  hover?: string | null;
  linkFrom?: string | null;
  linkTarget?: string | null;
  pointer?: Pt | null;
  interactive?: boolean;
};

function nodeGroup(n: Placed, inner: string, ringRx: number, state: DrawState): string {
  const sel = n.id === state.selected ? ' is-selected' : '';
  const target = n.id === state.linkTarget ? ' is-target' : '';
  const l = n.x - n.w / 2;
  const t = n.y - n.h / 2;
  const ring = state.interactive
    ? `<rect class="graph-svg__ring" x="${fmt(l - 5)}" y="${fmt(t - 5)}" width="${n.w + 10}" height="${n.h + 10}" rx="${ringRx}"/>`
    : '';
  return `<g class="graph-svg__node${sel}${target}" data-id="${esc(n.id)}"><title>${esc(n.label || 'Untitled')}</title>${ring}${inner}</g>`;
}

/* ── Mind map, outline mode: a logic chart that reads left to right, or an indented tree when narrow ── */

const MIND_CHART_BOX = (depth: number): Box =>
  depth === 0
    ? { size: 16, weight: 600, padX: 18, padY: 12, lineH: 21, maxW: 210 }
    : depth === 1
      ? { size: 14, weight: 600, padX: 14, padY: 9, lineH: 19, maxW: 190 }
      : { size: 13, weight: 500, padX: 2, padY: 7, lineH: 18, maxW: 190 };

export function drawMindChart(content: GraphContent, layout: 'right' | 'indent', state: DrawState = {}): Scene {
  const root = buildTree(content.nodes);
  const nodes = new Map<string, Placed>();
  if (!root) return { markup: '', bounds: boundsOf([], 0), nodes, chips: [] };
  const tree = flatten(root);
  const placed = new Map<TreeNode, Placed>();
  for (const t of tree) {
    const s = sized(t, MIND_CHART_BOX(t.depth));
    const p: Placed = { id: t.id, label: t.label, x: 0, y: 0, ...s, depth: t.depth, branch: t.branch, parent_id: t.depth ? t.parent_id : null };
    placed.set(t, p);
    nodes.set(t.id, p);
  }
  const P = (t: TreeNode) => placed.get(t)!;

  if (layout === 'indent') {
    let y = 0;
    for (const t of tree) {
      const p = P(t);
      p.side = 1;
      p.x = t.depth * 26 + p.w / 2;
      p.y = y + p.h / 2;
      y += p.h + (t.depth === 0 ? 18 : 8);
    }
  } else {
    const hGap = 44;
    const vGap = 14;
    const subH = new Map<TreeNode, number>();
    const sub = (t: TreeNode): number => {
      if (!subH.has(t)) subH.set(t, Math.max(P(t).h, t.kids.reduce((s, k) => s + sub(k), 0) + vGap * Math.max(0, t.kids.length - 1)));
      return subH.get(t)!;
    };
    const place = (t: TreeNode, nearX: number, top: number) => {
      const p = P(t);
      p.side = 1;
      p.x = nearX + p.w / 2;
      p.y = top + sub(t) / 2;
      let next = p.y - (t.kids.reduce((s, k) => s + sub(k), 0) + vGap * Math.max(0, t.kids.length - 1)) / 2;
      for (const k of t.kids) {
        place(k, p.x + p.w / 2 + hGap, next);
        next += sub(k) + vGap;
      }
    };
    const r = P(root);
    r.side = 0;
    const total = root.kids.reduce((s, k) => s + sub(k), 0) + vGap * Math.max(0, root.kids.length - 1);
    let top = -total / 2;
    for (const k of root.kids) {
      place(k, r.w / 2 + hGap, top);
      top += sub(k) + vGap;
    }
  }

  let links = '';
  let boxes = '';
  for (const t of tree) {
    const n = P(t);
    if (t.depth) {
      const p = nodes.get(n.parent_id!) ?? P(root);
      const width = t.depth === 1 ? 2.25 : 1.6;
      let d: string;
      if (layout === 'indent') {
        const px = p.x - p.w / 2 + (p.depth >= 2 ? 6 : 14);
        const py = p.y + p.h / 2;
        const cx = n.x - n.w / 2;
        const cy = t.depth >= 2 ? n.y + n.h / 2 : n.y;
        d = `M${fmt(px)} ${fmt(py)} V${fmt(cy - 8)} Q${fmt(px)} ${fmt(cy)} ${fmt(px + 8)} ${fmt(cy)} H${fmt(cx)}`;
      } else {
        const sx = p.x + p.w / 2;
        const sy = p.depth >= 2 ? p.y + p.h / 2 : p.y;
        const ex = n.x - n.w / 2;
        const ey = t.depth >= 2 ? n.y + n.h / 2 : n.y;
        const mx = (sx + ex) / 2;
        d = `M${fmt(sx)} ${fmt(sy)} C${fmt(mx)} ${fmt(sy)} ${fmt(mx)} ${fmt(ey)} ${fmt(ex)} ${fmt(ey)}`;
      }
      links += `<path d="${d}" style="fill:none;stroke:${mix(inkOf(n.branch), 55)}" stroke-width="${width}" stroke-linecap="round"/>`;
    }
    const l = n.x - n.w / 2;
    const top = n.y - n.h / 2;
    let body: string;
    if (t.depth === 0) {
      body = `<rect x="${fmt(l)}" y="${fmt(top)}" width="${n.w}" height="${n.h}" rx="14" style="fill:var(--navy)"/>` + textLines(n, n.x, '#fff');
    } else if (t.depth === 1) {
      body =
        `<rect x="${fmt(l)}" y="${fmt(top)}" width="${n.w}" height="${n.h}" rx="12" style="fill:${fillOf(n.branch)};stroke:${mix(inkOf(n.branch), 22)}"/>` +
        textLines(n, n.x, inkOf(n.branch));
    } else {
      body =
        `<rect x="${fmt(l)}" y="${fmt(top)}" width="${n.w}" height="${n.h}" style="fill:transparent"/>` +
        `<path d="M${fmt(l)} ${fmt(top + n.h)} H${fmt(l + n.w)}" style="fill:none;stroke:${mix(inkOf(n.branch), 60)}" stroke-width="2" stroke-linecap="round"/>` +
        textLines(n, l + n.box.padX, 'var(--ink)', 'start');
    }
    boxes += nodeGroup(n, body, t.depth >= 2 ? 8 : 18, state);
  }
  const list = [...nodes.values()];
  return { markup: links + boxes, bounds: boundsOf(list, 6), nodes, chips: [], root: P(root) };
}

/* ── Mind map, canvas mode: organic branches on ellipse rings, or wherever the user put them ── */

const MIND_CANVAS_BOX = (depth: number): Box =>
  depth === 0
    ? { size: 17, weight: 600, padX: 22, padY: 14, lineH: 22, maxW: 220 }
    : depth === 1
      ? { size: 14, weight: 600, padX: 16, padY: 9, lineH: 19, maxW: 190 }
      : { size: 13, weight: 500, padX: 12, padY: 7, lineH: 17, maxW: 150 };

const RINGS: Array<[number, number]> = [
  [0, 0],
  [185, 112],
  [350, 196]
];

/** Radial positions for every node; saved x/y win, and unsaved nodes follow their parent's offset. */
export function mindCanvasPositions(nodes: GraphNode[]): Map<string, Pt> {
  const root = buildTree(nodes);
  const out = new Map<string, Pt>();
  if (!root) return out;
  const auto = new Map<string, Pt>();
  const total = leafWeight(root) || 1;
  auto.set(root.id, { x: 0, y: 0 });
  const spread = (n: TreeNode, a0: number, a1: number) => {
    let a = a0;
    const weight = leafWeight(n);
    for (const k of n.kids) {
      const span = ((a1 - a0) * leafWeight(k)) / weight;
      const mid = a + span / 2;
      const d = Math.min(k.depth, 6);
      const [rx, ry] = RINGS[d] ?? [350 + (d - 2) * 150, 196 + (d - 2) * 84];
      auto.set(k.id, { x: Math.round(Math.cos(mid) * rx), y: Math.round(Math.sin(mid) * ry) });
      spread(k, a, a + span);
      a += span;
    }
  };
  const start = -Math.PI / 2 - Math.PI / total;
  spread(root, start, start + Math.PI * 2);
  const saved = (n: TreeNode) => (Number.isFinite(n.x) && Number.isFinite(n.y) ? { x: n.x!, y: n.y! } : null);
  const walk = (n: TreeNode, parent: TreeNode | null) => {
    const own = saved(n);
    if (own) out.set(n.id, own);
    else if (!parent) out.set(n.id, auto.get(n.id)!);
    else {
      const pa = auto.get(parent.id)!;
      const pp = out.get(parent.id)!;
      const me = auto.get(n.id)!;
      out.set(n.id, { x: pp.x + me.x - pa.x, y: pp.y + me.y - pa.y });
    }
    n.kids.forEach((k) => walk(k, n));
  };
  walk(root, null);
  return out;
}

export function drawMindCanvas(content: GraphContent, positions: Map<string, Pt>, state: DrawState = {}): Scene {
  const root = buildTree(content.nodes);
  const nodes = new Map<string, Placed>();
  if (!root) return { markup: '', bounds: boundsOf([], 0), nodes, chips: [] };
  const tree = flatten(root);
  for (const t of tree) {
    const pos = positions.get(t.id) ?? { x: 0, y: 0 };
    nodes.set(t.id, { id: t.id, label: t.label, ...pos, ...sized(t, MIND_CANVAS_BOX(t.depth)), depth: t.depth, branch: t.branch, parent_id: t.depth ? t.parent_id : null });
  }
  const r = nodes.get(root.id)!;
  let ribbons = '';
  let boxes = '';
  for (const n of nodes.values()) {
    if (!n.depth) continue;
    const p = nodes.get(n.parent_id!) ?? r;
    const dx = n.x - p.x;
    const dy = n.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = len * 0.12;
    const px = -dy / len;
    const py = dx / len;
    const pts = [
      { x: p.x, y: p.y },
      { x: p.x + dx * 0.35 + px * bend, y: p.y + dy * 0.35 + py * bend },
      { x: p.x + dx * 0.7 + px * bend * 0.35, y: p.y + dy * 0.7 + py * bend * 0.35 },
      { x: n.x, y: n.y }
    ];
    const [w0, w1] = n.depth === 1 ? [13, 4] : [5, 1.6];
    ribbons += `<path d="${taperedPath(pts, w0, w1)}" style="fill:${mix(inkOf(n.branch), 42)}"/>`;
  }
  for (const n of nodes.values()) {
    const l = n.x - n.w / 2;
    const t = n.y - n.h / 2;
    let card: string;
    if (n.depth === 0) {
      card = `<rect class="graph-svg__card" x="${fmt(l)}" y="${fmt(t)}" width="${n.w}" height="${n.h}" rx="20" style="fill:var(--navy)"/>` + textLines(n, n.x, '#fff');
    } else if (n.depth === 1) {
      card =
        `<rect class="graph-svg__card" x="${fmt(l)}" y="${fmt(t)}" width="${n.w}" height="${n.h}" rx="${Math.min(n.h / 2, 18)}" style="fill:${fillOf(n.branch)};stroke:#fff" stroke-width="2"/>` +
        textLines(n, n.x, inkOf(n.branch));
    } else {
      card =
        `<rect class="graph-svg__card" x="${fmt(l)}" y="${fmt(t)}" width="${n.w}" height="${n.h}" rx="${Math.min(n.h / 2, 16)}" style="fill:#fff;stroke:${mix(inkOf(n.branch), 40)}" stroke-width="1.5"/>` +
        textLines(n, n.x, 'var(--ink)');
    }
    boxes += nodeGroup(n, card, n.depth === 0 ? 24 : Math.min(n.h / 2 + 5, 22), state);
  }
  let extra = '';
  const s = state.selected ? nodes.get(state.selected) : undefined;
  if (s && state.interactive) {
    const cx = s.x;
    const cy = s.y + s.h / 2 + 16;
    extra = `<g class="graph-svg__handle" data-act="add-child"><title>Add a sub-idea (Tab)</title><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="12"/><path d="M${fmt(cx - 5)} ${fmt(cy)} H${fmt(cx + 5)} M${fmt(cx)} ${fmt(cy - 5)} V${fmt(cy + 5)}"/></g>`;
  }
  return { markup: ribbons + boxes + extra, bounds: boundsOf([...nodes.values()], 28), nodes, chips: [], root: r };
}

/* ── Concept map, outline mode: layered (cycles broken by DFS, barycentre ordering) ── */

const CONCEPT_BOX: Box = { size: 14, weight: 600, padX: 14, padY: 9, lineH: 19, maxW: 170 };

function conceptPlaced(content: GraphContent, box: Box, extraW = 0): Map<string, Placed> {
  const map = new Map<string, Placed>();
  content.nodes.forEach((n, i) => {
    const s = sized(n, box);
    map.set(n.id, { id: n.id, label: n.label, x: 0, y: 0, ...s, w: s.w + extraW, depth: 1, branch: colourOf(n.color) ?? COLOURS[i % COLOURS.length]! });
  });
  return map;
}

const liveEdges = (content: GraphContent, ids: Map<string, unknown>) =>
  content.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);

export function layeredPositions(content: GraphContent, compact = false): Map<string, Pt> {
  const nodes = conceptPlaced(content, CONCEPT_BOX);
  const edges = liveEdges(content, nodes);
  const out = new Map<string, GraphEdge[]>([...nodes.keys()].map((id) => [id, []]));
  edges.forEach((e) => out.get(e.from)!.push(e));
  const seen = new Map<string, number>();
  const reversed = new Set<string>();
  const visit = (id: string) => {
    seen.set(id, 1);
    for (const e of out.get(id)!) {
      const s = seen.get(e.to);
      if (s === 1) reversed.add(e.id);
      else if (!s) visit(e.to);
    }
    seen.set(id, 2);
  };
  nodes.forEach((_, id) => seen.get(id) || visit(id));
  const dag = edges.map((e) => (reversed.has(e.id) ? { ...e, from: e.to, to: e.from } : e));
  const layer = new Map([...nodes.keys()].map((id) => [id, 0]));
  for (let i = 0; i < nodes.size; i++) for (const e of dag) layer.set(e.to, Math.max(layer.get(e.to)!, layer.get(e.from)! + 1));
  const layers: Placed[][] = [];
  nodes.forEach((n) => (layers[layer.get(n.id)!] ||= []).push(n));
  const rows = layers.filter(Boolean);
  const pos = new Map<string, number>();
  const reindex = () => rows.forEach((l) => l.forEach((n, i) => pos.set(n.id, i)));
  reindex();
  const bc = new Map<string, number>();
  for (let sweep = 0; sweep < 6; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? rows.slice(1) : rows.slice(0, -1).reverse();
    for (const l of order) {
      for (const n of l) {
        const nb = dag.filter((e) => (down ? e.to === n.id : e.from === n.id)).map((e) => pos.get(down ? e.from : e.to)!);
        bc.set(n.id, nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : pos.get(n.id)!);
      }
      l.sort((a, b) => bc.get(a.id)! - bc.get(b.id)!);
      reindex();
    }
  }
  const colGap = compact ? 18 : 40;
  const rowGap = compact ? 78 : 86;
  const result = new Map<string, Pt>();
  let y = 0;
  for (const l of rows) {
    const rowH = Math.max(...l.map((n) => n.h));
    const width = l.reduce((s, n) => s + n.w, 0) + colGap * (l.length - 1);
    let x = -width / 2;
    for (const n of l) {
      result.set(n.id, { x: x + n.w / 2, y: y + rowH / 2 });
      x += n.w + colGap;
    }
    y += rowH + rowGap;
  }
  return result;
}

export function drawConceptLayered(content: GraphContent, compact: boolean, state: DrawState = {}): Scene {
  const nodes = conceptPlaced(content, CONCEPT_BOX);
  const at = layeredPositions(content, compact);
  nodes.forEach((n) => Object.assign(n, at.get(n.id)));
  const { id: marker, defs } = arrowDefs();
  type Geo = { e: GraphEdge; s: Placed; t: Placed; dir: number; sdx: number; tdx: number };
  const attach = new Map<string, Array<{ g: Geo; end: 's' | 't'; other: Placed }>>();
  const geo: Geo[] = liveEdges(content, nodes).map((e) => {
    const s = nodes.get(e.from)!;
    const t = nodes.get(e.to)!;
    const dir = t.y > s.y + 1 ? 1 : -1;
    const g: Geo = { e, s, t, dir, sdx: 0, tdx: 0 };
    const sk = `${s.id}\u0000${dir > 0 ? 'b' : 't'}`;
    const tk = `${t.id}\u0000${dir > 0 ? 't' : 'b'}`;
    if (!attach.has(sk)) attach.set(sk, []);
    if (!attach.has(tk)) attach.set(tk, []);
    attach.get(sk)!.push({ g, end: 's', other: t });
    attach.get(tk)!.push({ g, end: 't', other: s });
    return g;
  });
  for (const [key, list] of attach) {
    const n = nodes.get(key.split('\u0000')[0]!)!;
    list.sort((a, b) => a.other.x - b.other.x);
    const step = Math.min(22, (n.w - 28) / Math.max(1, list.length));
    list.forEach((a, i) => {
      const off = (i - (list.length - 1) / 2) * step;
      if (a.end === 's') a.g.sdx = off;
      else a.g.tdx = off;
    });
  }
  let paths = '';
  const chips: Chip[] = [];
  for (const g of geo) {
    const x0 = g.s.x + g.sdx;
    const y0 = g.s.y + (g.dir * g.s.h) / 2;
    const x3 = g.t.x + g.tdx;
    const y3 = g.t.y - (g.dir * g.t.h) / 2 - g.dir * 3;
    const dy = Math.max(28, Math.abs(y3 - y0) * 0.45) * g.dir;
    const pts = [{ x: x0, y: y0 }, { x: x0, y: y0 + dy }, { x: x3, y: y3 - dy }, { x: x3, y: y3 }];
    const chip = chipFor(g.e.id, g.e.label, (t) => cubicAt(pts, t));
    paths += `<path d="M${fmt(x0)} ${fmt(y0)} C${fmt(x0)} ${fmt(y0 + dy)} ${fmt(x3)} ${fmt(y3 - dy)} ${fmt(x3)} ${fmt(y3)}" style="fill:none;stroke:var(--orca)" stroke-width="1.5"${chip.missing ? ' stroke-dasharray="4 4"' : ''} marker-end="url(#${marker})" opacity="0.85"/>`;
    chips.push(chip);
  }
  placeChips(chips, [...nodes.values()]);
  const boxes = [...nodes.values()]
    .map((n) =>
      nodeGroup(
        n,
        `<rect x="${fmt(n.x - n.w / 2)}" y="${fmt(n.y - n.h / 2)}" width="${n.w}" height="${n.h}" rx="12" style="fill:${fillOf(n.branch)};stroke:${mix(inkOf(n.branch), 25)}"/>` +
          textLines(n, n.x, inkOf(n.branch)),
        16,
        state
      )
    )
    .join('');
  const chipMarkup = chips.map((c) => chipSvg(c, false, false)).join('');
  return { markup: defs + paths + boxes + chipMarkup, bounds: boundsOf([...nodes.values(), ...chips], 8), nodes, chips };
}

/* ── Concept map, canvas mode: cards where the user put them, links with a draggable port ── */

const CONCEPT_CANVAS_BOX: Box = { size: 14, weight: 600, padX: 16, padY: 11, lineH: 19, maxW: 180 };

export function conceptCanvasPositions(content: GraphContent): Map<string, Pt> {
  const placedAll = content.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  if (placedAll) return new Map(content.nodes.map((n) => [n.id, { x: n.x!, y: n.y! }]));
  const auto = layeredPositions(content);
  const scale = 1.25;
  return new Map(
    content.nodes.map((n) => {
      const a = auto.get(n.id) ?? { x: 0, y: 0 };
      return [n.id, Number.isFinite(n.x) && Number.isFinite(n.y) ? { x: n.x!, y: n.y! } : { x: Math.round(a.x * scale), y: Math.round(a.y * 1.1) }];
    })
  );
}

export function drawConceptCanvas(content: GraphContent, positions: Map<string, Pt>, state: DrawState = {}): Scene {
  const nodes = conceptPlaced(content, CONCEPT_CANVAS_BOX, 14);
  nodes.forEach((n) => Object.assign(n, positions.get(n.id) ?? { x: 0, y: 0 }));
  const { id: marker, defs } = arrowDefs();
  let paths = '';
  const chips: Chip[] = [];
  for (const e of liveEdges(content, nodes)) {
    const s = nodes.get(e.from)!;
    const t = nodes.get(e.to)!;
    const mx = (s.x + t.x) / 2;
    const my = (s.y + t.y) / 2;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const ctrl = { x: mx - (dy / len) * len * 0.12, y: my + (dx / len) * len * 0.12 };
    const a = rectExit(s, ctrl.x, ctrl.y, 2);
    const b = rectExit(t, ctrl.x, ctrl.y, 5);
    const pts = [a, ctrl, b];
    const chip = chipFor(e.id, e.label, (tt) => quadAt(pts, tt));
    paths += `<path d="M${fmt(a.x)} ${fmt(a.y)} Q${fmt(ctrl.x)} ${fmt(ctrl.y)} ${fmt(b.x)} ${fmt(b.y)}" style="fill:none;stroke:var(--orca)" stroke-width="1.6" opacity="0.8"${chip.missing ? ' stroke-dasharray="4 4"' : ''} marker-end="url(#${marker})"/>`;
    chips.push(chip);
  }
  placeChips(chips, [...nodes.values()]);
  const boxes = [...nodes.values()]
    .map((n) => {
      const l = n.x - n.w / 2;
      const t = n.y - n.h / 2;
      const showPort = state.interactive && (n.id === state.selected || n.id === state.hover);
      const port = showPort
        ? `<g class="graph-svg__port" data-port="${esc(n.id)}"><title>Drag to another concept to link</title><circle cx="${fmt(n.x + n.w / 2)}" cy="${fmt(n.y)}" r="9" style="fill:var(--paper);stroke:var(--wave)" stroke-width="1.5"/><circle cx="${fmt(n.x + n.w / 2)}" cy="${fmt(n.y)}" r="4" style="fill:var(--wave)"/></g>`
        : '';
      return nodeGroup(
        n,
        `<rect class="graph-svg__card" x="${fmt(l)}" y="${fmt(t)}" width="${n.w}" height="${n.h}" rx="14" style="fill:#fff;stroke:var(--line)"/>` +
          `<rect x="${fmt(l)}" y="${fmt(t)}" width="${n.w}" height="${n.h}" rx="14" style="fill:${fillOf(n.branch)}" opacity="0.45"/>` +
          `<circle cx="${fmt(l + 16)}" cy="${fmt(n.y)}" r="5" style="fill:${inkOf(n.branch)}"/>` +
          textLines(n, n.x + 7, 'var(--ink)') +
          port,
        18,
        state
      );
    })
    .join('');
  let ghost = '';
  if (state.linkFrom && state.pointer) {
    const s = nodes.get(state.linkFrom);
    if (s) {
      ghost = `<path d="M${fmt(s.x + s.w / 2)} ${fmt(s.y)} L${fmt(state.pointer.x)} ${fmt(state.pointer.y)}" style="fill:none;stroke:var(--wave)" stroke-width="2" stroke-dasharray="5 5" marker-end="url(#${marker})"/>`;
    }
  }
  const chipMarkup = chips.map((c) => chipSvg(c, c.id === state.selectedEdge, !!state.interactive)).join('');
  return { markup: defs + paths + boxes + chipMarkup + ghost, bounds: boundsOf([...nodes.values(), ...chips], 28), nodes, chips };
}

/* ── Read-only picture: the same drawing the editor shows, picked to fit the room ── */

export function drawForRoom(kind: GraphKind, content: GraphContent, room: number, state: DrawState = {}): Scene {
  const mode = modeOf(kind, content);
  if (kind === 'mind') {
    if (mode === 'canvas') return drawMindCanvas(content, mindCanvasPositions(content.nodes), state);
    const wide = drawMindChart(content, 'right', state);
    return wide.bounds.w <= room ? wide : drawMindChart(content, 'indent', state);
  }
  if (mode === 'canvas') return drawConceptCanvas(content, conceptCanvasPositions(content), state);
  const roomy = drawConceptLayered(content, false, state);
  return roomy.bounds.w <= room ? roomy : drawConceptLayered(content, true, state);
}

/* Print windows carry no stylesheet, so static pictures name each token's value too (tokens.css). */
const TOKEN_FALLBACK: Record<string, string> = {
  paper: '#fbf8f2',
  navy: '#17375e',
  orca: '#424860',
  wave: '#376fb7',
  ink: '#13233a',
  line: 'rgba(23, 55, 94, 0.10)',
  'high-sea-ink': '#a85a0c',
  'pastel-blue': '#dceafa',
  'pastel-blue-ink': '#294c71',
  'pastel-sage': '#dfe9e1',
  'pastel-sage-ink': '#3c5949',
  'pastel-peach': '#f2dfd0',
  'pastel-peach-ink': '#7a5038',
  'pastel-gold': '#f1e2b6',
  'pastel-gold-ink': '#6c581f',
  'pastel-lilac': '#e8e0f1',
  'pastel-lilac-ink': '#5d4e70'
};

export function svgMarkup(scene: Scene, label: string, width?: number): string {
  const b = scene.bounds;
  const w = width ?? Math.ceil(b.w);
  const h = Math.ceil((b.h * w) / b.w);
  const markup = scene.markup.replace(/var\(--([a-z0-9-]+)\)/g, (m, name: string) =>
    TOKEN_FALLBACK[name] ? `var(--${name}, ${TOKEN_FALLBACK[name]})` : m
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" class="graph-svg" viewBox="${fmt(b.x)} ${fmt(b.y)} ${fmt(b.w)} ${fmt(b.h)}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}" font-family="Inter, system-ui, sans-serif">${markup}</svg>`;
}
