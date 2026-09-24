/*
 * Unified Timeline: working reference prototype.
 *
 * This is the design. Port it; do not reinterpret it. The geometry block `TL` and the colour
 * helpers are "port exactly". The motion engine and morph are the real modules from
 * apps/tasks/src/views (timeline-motion.ts, timeline-morph.ts) bundled in, so what you see here
 * is the motion the app must have.
 *
 * Pattern to copy:
 *   state -> layout() (pure, keyed by entity id) -> reconcile() -> engine.apply writes the DOM.
 *   Zoom tweens ONE value (dayWidth) and re-lays out every frame with engine.place().
 */
import { createMotion, reconcile, MOTION, OVERSHOOT, EASE, type Props } from '@/views/timeline-motion';
import { startMorph, type MorphController } from '@/views/timeline-morph';
import {
  addDaysKey,
  buildTimeScale,
  holidayRuns,
  mondayOf,
  termAt,
  toMs,
  weekLabel,
  type SchoolTerm,
  type TimeScale
} from '@/domain/school-time';
import {
  CRITICAL,
  DOMAIN_COLOUR,
  DREAMS,
  GOALS,
  HAMMOND,
  MILESTONES,
  PROJECTS,
  RANGE,
  TASKS,
  TERMS,
  TODAY,
  WALLS,
  WINDOW_MINUTES,
  type FxProject,
  type FxTask
} from './fixture';

/* ───────────── Geometry (port exactly) ───────────── */
export const TL = {
  labelW: 208,
  axis: { h: 64, termY: 8, termH: 20, weekY: 42, dateY: 56 },
  row: { dream: 36, goal: 36, project: 44, projectOpen: 34, task: 36, step: 30, milestone: 36, marking: 48, group: 36, ribbon: 24 },
  groupGap: 12,
  bar: { h: 24, rx: 6, stripeW: 3, stripeInset: 6, minW: 28, textPad: 16, outsideGap: 8 },
  project: { h: 28, rx: 8, bracketH: 6, bracketRx: 3 },
  band: { h: 24, rx: 12 },
  diamond: 14,
  undated: { h: 22, rx: 11, padX: 10 },
  shadow: { h: 32, rx: 8 },
  ribbon: { h: 16, gap: 3, rx: 4 },
  load: { h: 104, top: 30, colGap: 8, rx: 4 },
  today: { pillH: 20, pillW: 52 },
  ghost: { dash: '4 3' },
  mobileBreak: 720,
  zooms: [
    { id: 'year', label: 'Year', dayWidth: 1.6 },
    { id: 'term', label: 'Term', dayWidth: 4.4 },
    { id: 'month', label: 'Month', dayWidth: 10 },
    { id: 'week', label: 'Week', dayWidth: 34 },
    { id: 'day', label: 'Day', dayWidth: 96 }
  ]
} as const;

/** Surface literals with no kit token. Derived from tokens; keep the derivation comment. */
const SURF = {
  goalBand: 'color-mix(in srgb, var(--navy) 5%, transparent)', // from --line family
  holiday: 'color-mix(in srgb, var(--navy) 3.5%, transparent)',
  selectedHalo: 'color-mix(in srgb, var(--wave) 16%, transparent)',
  ghostFill: 'color-mix(in srgb, var(--wave) 6%, transparent)',
  shadowFill: 'color-mix(in srgb, var(--navy) 7%, transparent)'
};

function tint(hex: string, pct: number): string {
  return `color-mix(in srgb, ${hex} ${pct}%, #fff)`;
}
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a);
  const B = p(b);
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
function colourOf(p: { domain: keyof typeof DOMAIN_COLOUR; shade?: number }): string {
  const base = DOMAIN_COLOUR[p.domain];
  return p.shade ? mix(base, '#0a1536', 0.3) : base;
}
/** 09:00 is 0.375 of a day: the today line sits at the current time of day. */
const TODAY_FRAC = 0.375;
const fmt = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(2, 4)}`;

/* ───────────── State ───────────── */
const SCHOOL: SchoolTerm[] = TERMS.map((t) => ({ term: t.term as 3 | 4, starts_on: t.start, ends_on: t.end }));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

type ViewMode = 'bars' | 'lines';
const state = {
  zoom: 2,
  dayWidth: TL.zooms[2].dayWidth as number,
  expanded: new Map<string, boolean>(),
  critical: false,
  load: true,
  holidaysCompressed: true,
  view: 'bars' as ViewMode,
  selected: null as string | null,
  hammond: false,
  tasks: TASKS.map((t) => ({ ...t })),
  drag: null as null | { id: string; dx: number; startX: number; days: number }
};

function isExpanded(id: string, kind: 'goal' | 'project' | 'group' | 'task'): boolean {
  const user = state.expanded.get(id);
  if (user !== undefined) return user;
  if (kind === 'goal') return true;
  if (kind === 'task') return state.zoom >= 3;
  if (kind === 'group') return id === 'grp-marking';
  // Projects: at Month or closer, open when the next open dated task is due within 14 days.
  if (state.zoom < 2) return false;
  const next = state.tasks
    .filter((t) => t.project === id && t.status !== 'done' && t.due)
    .map((t) => t.due!)
    .sort()[0];
  return Boolean(next && toMs(next) - toMs(TODAY) <= 14 * 86_400_000);
}

/* ───────────── Rows ───────────── */
type RowKind = 'dream' | 'goal' | 'project' | 'task' | 'step' | 'milestone' | 'group' | 'marking';
type Row = { id: string; kind: RowKind; depth: number; label: string; sub?: string; y: number; h: number; ref: string; open?: boolean; colour?: string };

function tasksOf(pid: string): FxTask[] {
  return state.tasks.filter((t) => t.project === pid && !t.parent);
}

function buildRows(): Row[] {
  const rows: Row[] = [];
  let y = 0;
  const push = (r: Omit<Row, 'y'>) => {
    rows.push({ ...r, y });
    y += r.h;
  };
  const projectRows = (p: FxProject, depth: number) => {
    const open = isExpanded(p.id, 'project');
    const h = (open ? TL.row.projectOpen : TL.row.project) + (p.ribbon ? TL.row.ribbon : 0);
    push({ id: `row:${p.id}`, kind: 'project', depth, label: p.title, h, ref: p.id, open, colour: colourOf(p) });
    if (!open) return;
    const items: Array<{ due: string; row: Omit<Row, 'y'> }> = [];
    for (const t of tasksOf(p.id)) {
      if (!t.due) continue;
      items.push({ due: t.due, row: { id: `row:${t.id}`, kind: 'task', depth: depth + 1, label: t.title, h: TL.row.task, ref: t.id } });
    }
    for (const m of MILESTONES.filter((m) => m.project === p.id))
      items.push({ due: m.due, row: { id: `row:${m.id}`, kind: 'milestone', depth: depth + 1, label: m.title, h: TL.row.milestone, ref: m.id } });
    items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    for (const it of items) {
      push(it.row);
      if (it.row.kind === 'task' && isExpanded(it.row.ref, 'task')) {
        for (const s of state.tasks.filter((c) => c.parent === it.row.ref && c.due))
          push({ id: `row:${s.id}`, kind: 'step', depth: depth + 2, label: s.title, h: TL.row.step, ref: s.id });
      }
    }
  };

  for (const g of GOALS) {
    const dream = g.dream ? DREAMS.find((d) => d.id === g.dream) : null;
    let depth = 0;
    if (dream) {
      push({ id: `row:${dream.id}`, kind: 'dream', depth: 0, label: dream.title, h: TL.row.dream, ref: dream.id });
      depth = 1;
    }
    const open = isExpanded(g.id, 'goal');
    push({ id: `row:${g.id}`, kind: 'goal', depth, label: g.title, h: TL.row.goal, ref: g.id, open });
    if (open) for (const p of PROJECTS.filter((p) => p.goal === g.id)) projectRows(p, depth + 1);
    y += TL.groupGap;
  }
  push({ id: 'row:grp-nogoal', kind: 'group', depth: 0, label: 'No goal', h: TL.row.group, ref: 'grp-nogoal', open: isExpanded('grp-nogoal', 'goal') });
  if (isExpanded('grp-nogoal', 'goal')) for (const p of PROJECTS.filter((p) => !p.goal)) projectRows(p, 1);
  y += TL.groupGap;
  const markingOpen = isExpanded('grp-marking', 'group');
  push({ id: 'row:grp-marking', kind: 'group', depth: 0, label: 'Marking shadows', h: TL.row.group, ref: 'grp-marking', open: markingOpen });
  if (markingOpen)
    for (const k of state.tasks.filter((t) => t.marking))
      push({ id: `row:${k.id}`, kind: 'marking', depth: 1, label: k.title, h: TL.row.marking, ref: k.id });
  y += TL.groupGap;
  push({ id: 'row:grp-loose', kind: 'group', depth: 0, label: 'Tasks without a project', h: TL.row.group, ref: 'grp-loose', open: isExpanded('grp-loose', 'group') });
  if (isExpanded('grp-loose', 'group'))
    for (const t of state.tasks.filter((t) => !t.project && !t.marking && t.due))
      push({ id: `row:${t.id}`, kind: 'task', depth: 1, label: t.title, h: TL.row.task, ref: t.id });
  return rows;
}

/* ───────────── Spans ───────────── */
function taskSpan(t: FxTask): { start: string; end: string } | null {
  if (!t.due) return null;
  const days = Math.max(1, Math.ceil((t.est ?? 60) / 120));
  return { start: addDaysKey(t.due, -(days - 1)), end: t.due };
}
function projectSpan(p: FxProject): { start: string; end: string } {
  return { start: p.start, end: p.end };
}

/* ───────────── Load ───────────── */
type Week = { key: string; label: string | null; minutes: number; capacity: number; wall: boolean };
function weekLoad(): Week[] {
  const weeks = new Map<string, Week>();
  const ensure = (k: string) => {
    const m = mondayOf(k);
    if (!weeks.has(m)) {
      let cap = 0;
      let wall = false;
      for (let i = 0; i < 7; i++) {
        const d = addDaysKey(m, i);
        const inWall = WALLS.some((w) => d >= w.start && d <= w.end);
        if (inWall) wall = true;
        else cap += WINDOW_MINUTES[i]!;
      }
      weeks.set(m, { key: m, label: weekLabel(m, SCHOOL) ?? weekLabel(addDaysKey(m, 1), SCHOOL), minutes: 0, capacity: cap, wall });
    }
    return weeks.get(m)!;
  };
  for (let k = mondayOf(TODAY); k <= RANGE.end; k = addDaysKey(k, 7)) ensure(k);
  for (const t of state.tasks) {
    if (t.status === 'done' || !t.due || !t.est || t.due < TODAY) continue;
    if (t.marking) {
      const remaining = (t.marking.scripts - t.marking.marked) * t.marking.rate;
      const from = t.marking.collected > TODAY ? t.marking.collected : TODAY;
      const days: string[] = [];
      for (let d = from; d <= t.marking.returnBy; d = addDaysKey(d, 1)) if (WINDOW_MINUTES[(new Date(toMs(d)).getUTCDay() + 6) % 7]) days.push(d);
      for (const d of days) ensure(d).minutes += remaining / Math.max(1, days.length);
    } else ensure(t.due).minutes += t.est;
  }
  return [...weeks.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/* ───────────── DOM scaffolding ───────────── */
const NS = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent?.appendChild(e);
  return e;
}
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string, parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
const measureCtx = document.createElement('canvas').getContext('2d')!;
const widthCache = new Map<string, number>();
/** Measure with the SAME family stack the CSS uses, or fallback fonts measure differently. */
const FONT_STACK = 'Inter, ui-sans-serif, sans-serif';
/** Measured once per string and font. Measuring inside the frame loop is a regression. */
function textW(text: string, font: string): number {
  const key = `${font}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    measureCtx.font = font.replace(/Inter$/, FONT_STACK);
    w = measureCtx.measureText(text).width;
    widthCache.set(key, w);
  }
  return w;
}
/** Reuse child nodes instead of rebuilding with innerHTML every frame. */
function pool(parent: Element, count: number, tag: 'rect'): SVGRectElement[] {
  while (parent.children.length > count) parent.lastElementChild!.remove();
  while (parent.children.length < count) s(tag, {}, parent);
  return [...parent.children] as SVGRectElement[];
}
function fit(text: string, font: string, max: number): string {
  if (textW(text, font) <= max) return text;
  let t = text;
  while (t.length > 1 && textW(`${t}…`, font) > max) t = t.slice(0, -1);
  return `${t}…`;
}

const els = {
  card: document.getElementById('tl-card') as HTMLElement,
  labels: document.getElementById('tl-labels') as HTMLElement,
  scroller: document.getElementById('tl-scroller') as HTMLElement,
  svg: document.getElementById('tl-svg') as unknown as SVGSVGElement,
  bars: document.getElementById('tl-bars') as HTMLElement,
  lines: document.getElementById('tl-lines') as HTMLElement,
  tray: document.getElementById('tl-tray') as HTMLElement,
  banner: document.getElementById('tl-banner') as HTMLElement,
  live: document.getElementById('tl-live') as HTMLElement
};

const layers: Record<string, SVGGElement> = {};
for (const name of ['grid', 'holidays', 'walls', 'axis', 'today', 'bands', 'curves', 'shadows', 'bars', 'ghosts', 'load'])
  layers[name] = s('g', { 'data-layer': name }, els.svg);

s('defs', {}, els.svg).innerHTML = `
  <pattern id="tl-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="8" height="8" fill="color-mix(in srgb, var(--navy) 4%, transparent)"/>
    <line x1="0" y1="0" x2="0" y2="8" stroke="color-mix(in srgb, var(--navy) 16%, transparent)" stroke-width="2"/>
  </pattern>
  <marker id="tl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
    <path d="M1 1 L9 5 L1 9 Z" fill="var(--shallow)"/>
  </marker>
  <marker id="tl-arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
    <path d="M1 1 L9 5 L1 9 Z" fill="var(--high-sea-ink)"/>
  </marker>
  <marker id="tl-arrow-ghost" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
    <path d="M1 1 L9 5 L1 9 Z" fill="var(--navy)"/>
  </marker>`;

/* ───────────── Entities ───────────── */
type Kind =
  | 'bar' | 'step' | 'ms' | 'proj' | 'bracket' | 'band' | 'dream' | 'undated' | 'curve' | 'label' | 'wall' | 'hol'
  | 'term' | 'week' | 'grid' | 'today' | 'shadow' | 'ribbon' | 'load' | 'cap' | 'ghost' | 'garrow' | 'ripple' | 'edge' | 'rowtitle';

type Spec = { kind: Kind; text?: string; sub?: string; colour?: string; data?: Record<string, string>; flags?: Record<string, boolean> };
const specs = new Map<string, Spec>();
const nodes = new Map<string, Element>();

function create(id: string): void {
  const spec = specs.get(id)!;
  const kind = spec.kind;
  let g: Element;
  if (kind === 'label') {
    g = h('div', 'tl-label');
    els.labels.append(g);
  } else {
    const layer =
      kind === 'wall' ? layers.walls : kind === 'hol' || kind === 'grid' ? layers.grid : kind === 'term' || kind === 'week' ? layers.axis
      : kind === 'band' || kind === 'bracket' ? layers.bands : kind === 'curve' || kind === 'edge' ? layers.curves
      : kind === 'shadow' ? layers.shadows : kind === 'ghost' || kind === 'garrow' || kind === 'ripple' ? layers.ghosts
      : kind === 'today' ? layers.today : kind === 'load' || kind === 'cap' ? layers.load : layers.bars;
    g = s('g', { 'data-id': id }, layer);
    const inner = s('g', { class: 'tl-pop' }, g);
    buildShape(kind, inner as SVGGElement, spec, id);
  }
  nodes.set(id, g);
}

function remove(id: string): void {
  nodes.get(id)?.remove();
  nodes.delete(id);
}

function buildShape(kind: Kind, g: SVGGElement, spec: Spec, id: string): void {
  const ref = id.split(':')[1] ?? id;
  const colour = spec.colour ?? 'var(--wave)';
  const d = spec.data ?? {};
  switch (kind) {
    case 'bar':
    case 'step': {
      g.setAttribute('data-part', kind === 'bar' ? 'bar' : 'step-bar');
      g.setAttribute('data-task-id', ref);
      for (const [k, v] of Object.entries(d)) g.setAttribute(`data-${k}`, v);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', spec.text ?? '');
      s('rect', { class: 'tl-halo', rx: TL.bar.rx + 4 }, g);
      const face = s('rect', { class: 'tl-bar__face', rx: TL.bar.rx, 'data-part': 'bar-face', 'data-entity-id': ref, 'data-morph-shape': 'bar', 'data-morph-color': colour }, g);
      face.style.fill = tint(colour, 16);
      s('rect', { class: 'tl-bar__stripe', rx: 1.5, width: TL.bar.stripeW, 'data-part': 'bar-stripe' }, g).style.fill = d.blocked ? 'var(--danger)' : colour;
      s('rect', { class: 'tl-bar__grip', rx: 1.5, width: 3 }, g);
      s('text', { class: 'tl-bar__title', 'data-part': 'bar-title' }, g).textContent = spec.text ?? '';
      s('text', { class: 'tl-bar__sub', 'data-part': 'bar-sub' }, g).textContent = spec.sub ?? '';
      break;
    }
    case 'ms':
    case 'dream': {
      g.setAttribute('data-part', kind === 'ms' ? 'milestone' : 'dream');
      g.setAttribute(kind === 'ms' ? 'data-milestone-id' : 'data-dream-id', ref);
      g.setAttribute('tabindex', '0');
      const r = s('rect', { class: kind === 'ms' ? 'tl-ms' : 'tl-dream', width: TL.diamond, height: TL.diamond, rx: 2, 'data-entity-id': ref, 'data-morph-shape': 'milestone', 'data-morph-color': colour }, g);
      if (kind === 'ms') r.style.fill = colour;
      s('text', { class: kind === 'ms' ? 'tl-ms__label' : 'tl-dream__label', 'data-part': `${kind === 'ms' ? 'milestone' : 'dream'}-label` }, g).textContent = spec.text ?? '';
      if (kind === 'dream') s('line', { class: 'tl-dream__line' }, g);
      break;
    }
    case 'proj': {
      g.setAttribute('data-part', 'project-bar');
      g.setAttribute('data-project-id', ref);
      const face = s('rect', { class: 'tl-proj__face', rx: TL.project.rx, height: TL.project.h, 'data-entity-id': ref, 'data-morph-shape': 'project', 'data-morph-color': colour }, g);
      face.style.fill = tint(colour, 18);
      s('rect', { class: 'tl-proj__progress', rx: TL.project.rx, height: TL.project.h, 'data-part': 'project-progress' }, g).style.fill = tint(colour, 38);
      s('text', { class: 'tl-proj__title', 'data-part': 'project-title' }, g).textContent = spec.text ?? '';
      s('g', { class: 'tl-proj__dots' }, g);
      s('rect', { class: 'tl-proj__baseline', width: 2, rx: 1, height: TL.project.h + 8, 'data-part': 'baseline-tick' }, g);
      break;
    }
    case 'bracket': {
      g.setAttribute('data-part', 'project-bracket');
      const r = s('rect', { class: 'tl-bracket', rx: TL.project.bracketRx, height: TL.project.bracketH, 'data-entity-id': ref, 'data-morph-shape': 'track', 'data-morph-color': colour }, g);
      r.style.fill = colour;
      break;
    }
    case 'band': {
      g.setAttribute('data-part', 'goal-band');
      s('rect', { class: 'tl-band', rx: TL.band.rx, height: TL.band.h }, g).style.fill = SURF.goalBand;
      s('text', { class: 'tl-band__label' }, g).textContent = spec.text ?? '';
      break;
    }
    case 'undated': {
      g.setAttribute('data-part', 'undated');
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      s('rect', { class: 'tl-undated', rx: TL.undated.rx, height: TL.undated.h }, g);
      s('text', { class: 'tl-undated__label' }, g).textContent = spec.text ?? '';
      break;
    }
    case 'curve':
    case 'edge': {
      g.setAttribute('data-part', 'curve');
      g.setAttribute('data-kind', spec.flags?.critical ? 'critical' : 'normal');
      s('path', { class: `tl-curve${spec.flags?.critical ? ' tl-curve--critical' : ''}`, fill: 'none', 'marker-end': spec.flags?.critical ? 'url(#tl-arrow-critical)' : 'url(#tl-arrow)' }, g);
      break;
    }
    case 'hol': {
      g.setAttribute('data-part', 'holiday');
      s('rect', { class: 'tl-hol' }, g).style.fill = SURF.holiday;
      break;
    }
    case 'grid': {
      s('line', { class: 'tl-grid' }, g);
      break;
    }
    case 'term': {
      g.setAttribute('data-part', 'axis-term');
      s('rect', { class: spec.flags?.holiday ? 'tl-term tl-term--hol' : 'tl-term', rx: 6, height: TL.axis.termH }, g);
      s('text', { class: spec.flags?.holiday ? 'tl-term__label tl-term__label--hol' : 'tl-term__label' }, g).textContent = spec.text ?? '';
      break;
    }
    case 'week': {
      g.setAttribute('data-part', 'axis-week');
      s('text', { class: 'tl-week__label' }, g).textContent = spec.text ?? '';
      s('text', { class: 'tl-week__date' }, g).textContent = spec.sub ?? '';
      break;
    }
    case 'today': {
      g.setAttribute('data-part', 'today');
      s('line', { class: 'tl-today__line' }, g);
      s('rect', { class: 'tl-today__pill', rx: TL.today.pillH / 2, height: TL.today.pillH, width: TL.today.pillW }, g);
      s('text', { class: 'tl-today__text', 'text-anchor': 'middle' }, g).textContent = 'Today';
      break;
    }
    case 'wall': {
      g.setAttribute('data-part', 'wall');
      s('rect', { class: 'tl-wall', fill: 'url(#tl-hatch)' }, g);
      s('line', { class: 'tl-wall__edge' }, g);
      s('line', { class: 'tl-wall__edge tl-wall__edge--end' }, g);
      const pill = s('g', { class: 'tl-wall__pill' }, g);
      s('rect', { rx: 10, height: 20 }, pill);
      s('path', { class: 'tl-wall__lock', d: 'M-3.5 -1 v-2 a3.5 3.5 0 0 1 7 0 v2 M-5 -1 h10 v7 h-10 z' }, pill);
      s('text', {}, pill).textContent = spec.text ?? '';
      break;
    }
    case 'shadow': {
      g.setAttribute('data-part', 'shadow');
      g.setAttribute('data-task-id', ref);
      if (spec.flags?.warn) g.setAttribute('data-warn', 'true');
      s('rect', { class: 'tl-shadow', rx: TL.shadow.rx, height: TL.shadow.h }, g).style.fill = SURF.shadowFill;
      s('g', { class: 'tl-shadow__density' }, g);
      s('rect', { class: 'tl-shadow__done', rx: TL.shadow.rx, height: TL.shadow.h, 'data-part': 'shadow-progress' }, g).style.fill = tint(colour, 34);
      s('rect', { class: 'tl-shadow__edge', width: 3, rx: 1.5, height: TL.shadow.h }, g);
      s('text', { class: 'tl-shadow__label', 'data-part': 'shadow-label' }, g).textContent = spec.text ?? '';
      s('text', { class: 'tl-shadow__warn', 'data-part': 'shadow-warn' }, g).textContent = spec.sub ?? '';
      break;
    }
    case 'ribbon': {
      g.setAttribute('data-part', 'ribbon');
      for (let i = 1; i <= 7; i++) {
        const seg = s('g', { 'data-part': 'ribbon-seg', 'data-standard': i, 'data-state': d[`s${i}`] ?? 'none' }, g);
        s('rect', { rx: TL.ribbon.rx, height: TL.ribbon.h, class: `tl-rib tl-rib--${d[`s${i}`] ?? 'none'}` }, seg);
        s('text', { class: `tl-rib__n tl-rib__n--${d[`s${i}`] ?? 'none'}`, 'text-anchor': 'middle' }, seg).textContent = String(i);
      }
      break;
    }
    case 'load': {
      g.setAttribute('data-part', 'load-col');
      if (spec.flags?.over) g.setAttribute('data-over', 'true');
      if (spec.flags?.wall) g.setAttribute('data-wall', 'true');
      s('rect', { class: `tl-load${spec.flags?.over ? ' tl-load--over' : ''}${spec.flags?.wall ? ' tl-load--wall' : ''}`, rx: TL.load.rx }, g);
      s('text', { class: `tl-load__val${spec.flags?.over ? ' tl-load__val--over' : ''}`, 'text-anchor': 'middle' }, g).textContent = spec.text ?? '';
      break;
    }
    case 'cap': {
      g.setAttribute('data-part', 'capacity-line');
      s('path', { class: 'tl-cap', fill: 'none' }, g);
      s('line', { class: 'tl-load-divider' }, g);
      break;
    }
    case 'ghost': {
      g.setAttribute('data-part', 'ghost');
      g.setAttribute('data-task-id', ref);
      s('rect', { class: 'tl-ghost', rx: TL.bar.rx, height: TL.bar.h }, g).style.fill = SURF.ghostFill;
      const chip = s('g', { class: 'tl-ghost__chip' }, g);
      s('circle', { r: 8 }, chip);
      s('text', { 'text-anchor': 'middle', y: 3.5 }, chip).textContent = 'H';
      break;
    }
    case 'garrow': {
      g.setAttribute('data-part', 'ghost-arrow');
      s('path', { class: 'tl-garrow', fill: 'none', 'marker-end': 'url(#tl-arrow-ghost)' }, g);
      break;
    }
    case 'rowtitle': {
      g.setAttribute('data-part', 'row-title');
      s('text', { class: `tl-rowtitle tl-rowtitle--${d.kind ?? 'goal'}` }, g).textContent = spec.text ?? '';
      break;
    }
    case 'ripple': {
      g.setAttribute('data-part', 'ripple');
      s('rect', { class: `tl-ripple${spec.flags?.slip ? ' tl-ripple--slip' : ''}`, rx: TL.bar.rx, height: TL.bar.h }, g);
      s('text', { class: 'tl-ripple__label' }, g).textContent = spec.text ?? '';
      break;
    }
  }
}

/* Apply: the only function that writes geometry to the DOM. */
function apply(id: string, p: Readonly<Props>): void {
  if (id === '__view') {
    state.dayWidth = p.dayWidth!;
    relayout('zoom');
    return;
  }
  const node = nodes.get(id);
  const spec = specs.get(id);
  if (!node || !spec) return;
  const op = String(p.opacity ?? 1);
  if (spec.kind === 'label') {
    const el = node as HTMLElement;
    el.style.transform = `translate3d(0, ${p.y}px, 0)`;
    el.style.height = `${p.h}px`;
    el.style.opacity = op;
    return;
  }
  const g = node as SVGGElement;
  g.setAttribute('opacity', op);
  const inner = g.firstElementChild as SVGGElement;
  if (p.scale !== undefined && p.scale !== 1) inner.style.transform = `scale(${p.scale})`;
  else inner.style.transform = '';
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const w = Math.max(0, p.w ?? 0);
  switch (spec.kind) {
    case 'bar':
    case 'step': {
      const bh = spec.kind === 'step' ? TL.bar.h - 6 : TL.bar.h;
      g.setAttribute('transform', `translate(${x} ${y})`);
      inner.classList.toggle('is-critical', Boolean(p.crit));
      inner.classList.toggle('is-dim', Boolean(p.dim));
      const [halo, face, stripe, grip, title, sub] = inner.children as unknown as SVGElement[];
      set(halo!, { x: -4, y: -4, width: w + 8, height: bh + 8 });
      set(face!, { width: w, height: bh });
      set(stripe!, { x: TL.bar.stripeInset, y: 5, height: bh - 10 });
      set(grip!, { x: w - 7, y: 7, height: bh - 14 });
      const font = '500 13px Inter';
      const inside = textW(spec.text ?? '', font) + TL.bar.textPad + 10 <= w;
      set(title!, { x: inside ? TL.bar.textPad : w + TL.bar.outsideGap, y: bh / 2 + 4.5 });
      title!.classList.toggle('is-outside', !inside);
      const subX = (inside ? w : w + TL.bar.outsideGap + textW(spec.text ?? '', font)) + 12;
      set(sub!, { x: subX, y: bh / 2 + 4.5 });
      break;
    }
    case 'ms': {
      g.setAttribute('transform', `translate(${x} ${y})`);
      const [r, t] = inner.children as unknown as SVGElement[];
      set(r!, { x: -TL.diamond / 2, y: -TL.diamond / 2, transform: 'rotate(45)' });
      set(t!, { x: TL.diamond / 2 + 8, y: 4.5 });
      break;
    }
    case 'dream': {
      g.setAttribute('transform', `translate(${x} ${y})`);
      const [r, t, line] = inner.children as unknown as SVGElement[];
      set(line!, { x1: 0, x2: w, y1: 0, y2: 0 });
      const tw = textW(spec.text ?? '', '500 12px Inter');
      const inRange = Boolean(p.inRange);
      set(r!, { x: -TL.diamond / 2, y: -TL.diamond / 2, transform: `translate(${inRange ? w : w - 10} 0) rotate(45)`, opacity: inRange ? 1 : 0 });
      set(t!, { x: stickyX(x, w, tw + 24), y: -9 });
      break;
    }
    case 'proj': {
      g.setAttribute('transform', `translate(${x} ${y})`);
      const [face, prog, title, dots, base] = inner.children as unknown as SVGElement[];
      set(face!, { width: w });
      set(prog!, { width: Math.max(0, w * (p.progress ?? 0)) });
      const tw = textW(spec.text ?? '', '600 13px Inter');
      const inside = tw + 28 <= w;
      set(title!, { x: inside ? stickyX(x, w, tw) : w + 10, y: TL.project.h / 2 + 4.5 });
      title!.classList.toggle('is-outside', !inside);
      const ms = MILESTONES.filter((m) => m.project === (id.split(':')[1] ?? ''));
      pool(dots!, ms.length, 'rect').forEach((r, i) => {
        const mx = scale.x(ms[i]!.due) + state.dayWidth / 2 - x;
        set(r, { x: -4.5, y: -4.5, width: 9, height: 9, rx: 1.5, stroke: '#fff', 'stroke-width': 2, transform: `translate(${mx} ${TL.project.h / 2}) rotate(45)`, opacity: mx < 0 || mx > w + 1 ? 0 : 1 });
        r.style.fill = spec.colour ?? 'var(--wave)';
      });
      const baseX = p.baseline ?? -1;
      set(base!, { x: baseX - x - 1, y: -4, opacity: baseX >= 0 ? 1 : 0 });
      break;
    }
    case 'bracket': {
      g.setAttribute('transform', `translate(${x} ${y})`);
      set(inner.firstElementChild!, { width: w });
      break;
    }
    case 'band': {
      g.setAttribute('transform', `translate(${x} ${y})`);
      const [r, t] = inner.children as unknown as SVGElement[];
      set(r!, { width: w });
      set(t!, { x: stickyX(x, w, textW(spec.text ?? '', '500 12px Inter')), y: TL.band.h / 2 + 4 });
      break;
    }
    case 'undated': {
      g.setAttribute('transform', `translate(${x} ${y})`);
      const [r, t] = inner.children as unknown as SVGElement[];
      set(r!, { width: w });
      set(t!, { x: TL.undated.padX, y: TL.undated.h / 2 + 4 });
      break;
    }
    case 'curve':
    case 'edge': {
      const path = inner.firstElementChild as SVGPathElement;
      const x1 = p.x1!, y1 = p.y1!, x2 = p.x2!, y2 = p.y2!;
      const dx = Math.max(24, Math.abs(x2 - x1) * 0.5);
      path.setAttribute('d', `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`);
      const crit = Boolean(p.crit);
      inner.setAttribute('data-kind', crit ? 'critical' : 'normal');
      path.setAttribute('class', `tl-curve${crit ? ' tl-curve--critical' : ''}`);
      path.setAttribute('marker-end', crit ? 'url(#tl-arrow-critical)' : 'url(#tl-arrow)');
      inner.classList.toggle('is-dim', Boolean(p.dim));
      break;
    }
    case 'hol': {
      set(inner.firstElementChild!, { x, y: 0, width: w, height: p.h ?? 0 });
      break;
    }
    case 'grid': {
      set(inner.firstElementChild!, { x1: x, x2: x, y1: TL.axis.h - 6, y2: p.h ?? 0 });
      break;
    }
    case 'term': {
      g.setAttribute('transform', `translate(${x} ${TL.axis.termY})`);
      const [r, t] = inner.children as unknown as SVGElement[];
      set(r!, { width: w });
      const label = w > textW(spec.text ?? '', '600 11px Inter') + 20 ? spec.text ?? '' : '';
      t!.textContent = label;
      set(t!, { x: 10, y: TL.axis.termH / 2 + 4 });
      break;
    }
    case 'week': {
      g.setAttribute('transform', `translate(${x} 0)`);
      const [a, b] = inner.children as unknown as SVGElement[];
      const room = w - 8;
      // Full "T4 W3" when it fits, "W3" when narrow, nothing below 18px.
      a!.textContent = room > 40 ? spec.text ?? '' : room > 18 ? (spec.text ?? '').split(' ')[1] ?? '' : '';
      b!.textContent = room > 52 ? spec.sub ?? '' : '';
      set(a!, { x: 6, y: TL.axis.weekY });
      set(b!, { x: 6, y: TL.axis.dateY });
      break;
    }
    case 'today': {
      const [line, pill, text] = inner.children as unknown as SVGElement[];
      set(line!, { x1: x, x2: x, y1: TL.axis.h - 2, y2: p.h ?? 0 });
      set(pill!, { x: x - TL.today.pillW / 2, y: TL.axis.termY });
      set(text!, { x, y: TL.axis.termY + 14 });
      break;
    }
    case 'wall': {
      const [r, e1, e2, pill] = inner.children as unknown as SVGElement[];
      set(r!, { x, y: TL.axis.h, width: w, height: Math.max(0, (p.h ?? 0) - TL.axis.h) });
      set(e1!, { x1: x, x2: x, y1: TL.axis.h, y2: p.h ?? 0 });
      set(e2!, { x1: x + w, x2: x + w, y1: TL.axis.h, y2: p.h ?? 0 });
      const text = spec.text ?? '';
      const tw = textW(text, '600 12px Inter') + 36;
      pill!.setAttribute('transform', `translate(${x + 8} ${TL.axis.h + 8})`);
      const [pr, lock, pt] = pill!.children as unknown as SVGElement[];
      set(pr!, { width: tw });
      lock!.setAttribute('transform', 'translate(14 9)');
      set(pt!, { x: 26, y: 14 });
      break;
    }
    case 'shadow': {
      g.setAttribute('transform', `translate(${x} ${y})`);
      const [r, density, done, edge, label, warn] = inner.children as unknown as SVGElement[];
      set(r!, { width: w });
      set(done!, { width: Math.max(0, w * (p.progress ?? 0)) });
      set(edge!, { x: -1.5 });
      const per = p.perDay ?? 0;
      const days = state.dayWidth >= 8 ? Math.round(p.days ?? 0) : 0;
      const dw = days ? w / days : 0;
      const hh = Math.min(TL.shadow.h - 8, (TL.shadow.h - 8) * Math.min(1, per / 120));
      pool(density!, days, 'rect').forEach((c, i) => {
        set(c, { x: i * dw + 2, y: TL.shadow.h - 4 - hh, width: Math.max(1, dw - 4), height: hh, rx: 2 });
        c.style.fill = spec.flags?.warn ? 'color-mix(in srgb, var(--high-sea-ink) 22%, transparent)' : 'color-mix(in srgb, var(--navy) 9%, transparent)';
      });
      const lw = textW(spec.text ?? '', '500 13px Inter');
      const inside = lw + 24 <= w;
      set(label!, { x: inside ? 12 : w + 10, y: TL.shadow.h / 2 + 4.5 });
      set(warn!, { x: inside ? w + 10 : w + 10 + lw + 12, y: TL.shadow.h / 2 + 4.5 });
      break;
    }
    case 'ribbon': {
      const segW = 26;
      const total = segW * 7 + TL.ribbon.gap * 6;
      g.setAttribute('transform', `translate(${x + stickyX(x, w, total) - 12} ${y})`);
      [...inner.children].forEach((seg, i) => {
        const [r, t] = seg.children as unknown as SVGElement[];
        set(r!, { x: i * (segW + TL.ribbon.gap), width: segW });
        set(t!, { x: i * (segW + TL.ribbon.gap) + segW / 2, y: TL.ribbon.h / 2 + 4 });
      });
      break;
    }
    case 'load': {
      const [r, t] = inner.children as unknown as SVGElement[];
      const hh = p.h ?? 0;
      set(r!, { x, y: (p.base ?? 0) - hh, width: w, height: hh });
      set(t!, { x: x + w / 2, y: (p.base ?? 0) - hh - 6 });
      t!.setAttribute('opacity', w > 26 && hh > 0 ? '1' : '0');
      break;
    }
    case 'cap': {
      (inner.firstElementChild as SVGPathElement).setAttribute('d', capPath);
      set(inner.children[1]!, { x1: 0, x2: geometry.width, y1: p.top ?? 0, y2: p.top ?? 0 });
      break;
    }
    case 'ghost': {
      g.setAttribute('transform', `translate(${x} ${y})`);
      const [r, chip] = inner.children as unknown as SVGElement[];
      set(r!, { width: w });
      chip!.setAttribute('transform', `translate(${w} 0)`);
      break;
    }
    case 'garrow': {
      const x1 = p.x1!, y1 = p.y1!, x2 = p.x2!, y2 = p.y2!;
      const lift = 18;
      (inner.firstElementChild as SVGPathElement).setAttribute('d', `M${x1} ${y1} C${x1} ${y1 - lift} ${x2} ${y2 - lift} ${x2} ${y2}`);
      break;
    }
    case 'rowtitle': {
      g.setAttribute('transform', `translate(${viewLeft + 12} ${y})`);
      break;
    }
    case 'ripple': {
      g.setAttribute('transform', `translate(${x} ${y})`);
      const [r, t] = inner.children as unknown as SVGElement[];
      set(r!, { width: w });
      set(t!, { x: p.lx ?? w + 8, y: TL.bar.h / 2 + 4.5 });
      break;
    }
  }
}
function set(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

/* Sticky text: long bars keep their title readable while scrolled. */
let viewLeft = 0;
const STICKY = new Set<Kind>(['proj', 'band', 'ribbon', 'dream', 'rowtitle']);
function stickyX(barX: number, barW: number, textWidth: number): number {
  const min = viewLeft + 12 - barX;
  return Math.max(12, Math.min(min, barW - textWidth - 12));
}
function onScroll(): void {
  viewLeft = els.scroller.scrollLeft;
  for (const [id, spec] of specs) {
    if (!STICKY.has(spec.kind)) continue;
    const p = engine.get(id);
    if (p && nodes.has(id)) apply(id, p);
  }
}
let scrollRaf = 0;
els.scroller.addEventListener('scroll', () => {
  cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(onScroll);
}, { passive: true });

/* ───────────── Layout: pure map of entity id -> props ───────────── */
let scale: TimeScale;
let rows: Row[] = [];
let capPath = '';
const PAD_R = 220;

function computeScale(): TimeScale {
  return buildTimeScale({
    start: RANGE.start,
    end: RANGE.end,
    terms: SCHOOL,
    dayWidth: state.dayWidth,
    holidayFactor: state.holidaysCompressed ? 0.25 : 1
  });
}

type Layout = { entities: Map<string, Props>; width: number; height: number };

function layout(): Layout {
  scale = computeScale();
  rows = buildRows();
  const E = new Map<string, Props>();
  const top = TL.axis.h + 8;
  const rowsBottom = top + (rows.length ? rows[rows.length - 1]!.y + rows[rows.length - 1]!.h : 0);
  const loadTop = rowsBottom + 16;
  const height = state.load ? loadTop + TL.load.h : rowsBottom + 12;
  const width = scale.width + PAD_R;
  const dw = state.dayWidth;
  const X = (k: string) => scale.x(k);
  const barX = (span: { start: string; end: string }) => {
    const x0 = X(span.start);
    const x1 = X(addDaysKey(span.end, 1));
    const w = Math.max(TL.bar.minW, x1 - x0);
    return { x: x1 - w, w };
  };

  // Axis: terms, holidays, weeks, grid.
  for (const t of TERMS) {
    const id = `term:T${t.term}`;
    specs.set(id, { kind: 'term', text: `Term ${t.term}` });
    E.set(id, { x: X(t.start), w: X(addDaysKey(t.end, 1)) - X(t.start) - 4 });
  }
  for (const run of holidayRuns(scale)) {
    const hid = `hol:${run.start}`;
    specs.set(hid, { kind: 'hol' });
    E.set(hid, { x: run.x, w: run.w, h: height });
    const tid = `term:hol-${run.start}`;
    specs.set(tid, { kind: 'term', text: 'Holidays', flags: { holiday: true } });
    E.set(tid, { x: run.x + 2, w: run.w - 4 });
  }
  for (let k = mondayOf(RANGE.start); k <= RANGE.end; k = addDaysKey(k, 7)) {
    const x = X(k);
    const next = X(addDaysKey(k, 7));
    const label = weekLabel(k, SCHOOL) ?? weekLabel(addDaysKey(k, 1), SCHOOL);
    const gid = `grid:${k}`;
    specs.set(gid, { kind: 'grid' });
    E.set(gid, { x, h: height });
    if (!label) continue;
    const wid = `week:${k}`;
    specs.set(wid, { kind: 'week', text: label, sub: fmt(k) });
    E.set(wid, { x, w: next - x });
  }

  // Walls.
  for (const w of WALLS) {
    const id = `wall:${w.id}`;
    specs.set(id, { kind: 'wall', text: `${w.label} · wall` });
    E.set(id, { x: X(w.start), w: X(addDaysKey(w.end, 1)) - X(w.start), h: rowsBottom + 4 });
  }

  // Rows and their marks. Under 720px the label column collapses and row titles ride the canvas.
  const compact = els.card.clientWidth < TL.mobileBreak;
  els.card.classList.toggle('is-compact', compact);
  const rowY = new Map<string, number>();
  for (const r of rows) {
    const y = top + r.y;
    if (compact && (r.kind === 'goal' || r.kind === 'group' || r.kind === 'dream' || (r.kind === 'project' && r.open))) {
      const id = `rowtitle:${r.ref}`;
      specs.set(id, { kind: 'rowtitle', text: r.kind === 'dream' ? `Dream · ${r.label} · target ${fmt(DREAMS.find((d) => d.id === r.ref)!.target)}` : r.label, data: { kind: r.kind } });
      E.set(id, { x: 0, y: r.kind === 'project' ? y + 10 : r.kind === 'dream' ? y + 10 : y + r.h / 2 + 4 });
    }
    rowY.set(r.ref, y);
    const lid = `label:${r.id}`;
    specs.set(lid, { kind: 'label', text: r.label });
    E.set(lid, { y: r.y, h: r.h });

    if (r.kind === 'goal') {
      const ps = PROJECTS.filter((p) => p.goal === r.ref);
      const x0 = Math.min(...ps.map((p) => X(p.start)));
      const x1 = Math.max(...ps.map((p) => X(addDaysKey(p.end, 1))));
      const id = `band:${r.ref}`;
      specs.set(id, { kind: 'band', text: `${ps.length} projects` });
      E.set(id, { x: x0, y: y + (r.h - TL.band.h) / 2, w: x1 - x0 });
    }
    if (r.kind === 'dream') {
      const d = DREAMS.find((d) => d.id === r.ref)!;
      const id = `dream:${d.id}`;
      const inRange = d.target <= RANGE.end;
      specs.set(id, { kind: 'dream', text: `Target ${fmt(d.target)}${inRange ? '' : ' →'}`, colour: 'var(--pastel-gold-ink)' });
      const x0 = d.origin && d.origin > RANGE.start ? X(d.origin) : 0;
      const x1 = inRange ? X(d.target) : scale.width;
      E.set(id, { x: x0, y: y + r.h / 2 + 6, w: x1 - x0, inRange: inRange ? 1 : 0 });
    }
    if (r.kind === 'project') {
      const p = PROJECTS.find((p) => p.id === r.ref)!;
      const span = projectSpan(p);
      const x0 = X(span.start);
      const x1 = X(addDaysKey(span.end, 1));
      const all = state.tasks.filter((t) => t.project === p.id);
      const done = all.filter((t) => t.status === 'done').length;
      const barH = r.open ? TL.project.bracketH : TL.project.h;
      const mainH = r.h - (p.ribbon ? TL.row.ribbon : 0);
      const by = y + (mainH - barH) / 2;
      if (r.open) {
        const id = `bracket:${p.id}`;
        specs.set(id, { kind: 'bracket', colour: colourOf(p) });
        E.set(id, { x: x0, y: by, w: x1 - x0 });
      } else {
        const id = `proj:${p.id}`;
        specs.set(id, { kind: 'proj', text: p.title, colour: colourOf(p) });
        E.set(id, { x: x0, y: by, w: x1 - x0, progress: all.length ? done / all.length : 0, baseline: p.baselineEnd ? X(addDaysKey(p.baselineEnd, 1)) : -1 });
      }
      const undated = all.filter((t) => !t.due).length;
      if (undated) {
        const id = `undated:${p.id}`;
        const text = `+${undated} undated`;
        specs.set(id, { kind: 'undated', text });
        const tw = textW(p.title, '600 13px Inter');
        const titleOutside = !r.open && tw + 28 > x1 - x0;
        E.set(id, { x: titleOutside ? x1 + 10 + tw + 12 : x1 + 8, y: y + (mainH - TL.undated.h) / 2, w: textW(text, '500 12px Inter') + TL.undated.padX * 2 });
      }
      if (p.ribbon) {
        const covered = new Map<number, 'some' | 'evidenced'>();
        for (const t of all)
          for (const a of t.apst ?? []) {
            const n = Number(a[0]);
            if (t.status === 'done') covered.set(n, 'evidenced');
            else if (covered.get(n) !== 'evidenced') covered.set(n, 'some');
          }
        const data: Record<string, string> = {};
        for (let i = 1; i <= 7; i++) data[`s${i}`] = covered.get(i) ?? 'none';
        const id = `ribbon:${p.id}`;
        specs.set(id, { kind: 'ribbon', data });
        E.set(id, { x: x0, y: y + mainH - 2, w: Math.max(7 * 18, x1 - x0) });
      }
    }
    if (r.kind === 'task' || r.kind === 'step') {
      const t = state.tasks.find((t) => t.id === r.ref)!;
      const span = taskSpan(t)!;
      const b = barX(span);
      const id = `${r.kind === 'step' ? 'step' : 'bar'}:${t.id}`;
      const sub = t.blocked ? 'blocked 4 days' : t.status === 'done' ? 'done' : `due ${fmt(t.due!)}`;
      const flags: Record<string, string> = { state: t.status === 'done' ? 'done' : t.blocked ? 'blocked' : t.status };
      if (t.blocked) flags.blocked = 'true';
      specs.set(id, { kind: r.kind === 'step' ? 'step' : 'bar', text: t.title, sub, colour: colourOf(PROJECTS.find((p) => p.id === t.project) ?? { domain: t.domain }), data: flags });
      const bh = r.kind === 'step' ? TL.bar.h - 6 : TL.bar.h;
      const crit = state.critical && CRITICAL.has(t.id);
      E.set(id, { x: b.x, y: y + (r.h - bh) / 2, w: b.w, crit: crit ? 1 : 0, dim: state.critical && !crit ? 1 : 0 });
    }
    if (r.kind === 'milestone') {
      const m = MILESTONES.find((m) => m.id === r.ref)!;
      const p = PROJECTS.find((p) => p.id === m.project)!;
      const id = `ms:${m.id}`;
      specs.set(id, { kind: 'ms', text: `${m.title} · ${fmt(m.due)}`, colour: colourOf(p) });
      E.set(id, { x: X(m.due) + dw / 2, y: y + r.h / 2 });
    }
    if (r.kind === 'marking') {
      const t = state.tasks.find((t) => t.id === r.ref)!;
      const mk = t.marking!;
      const x0 = X(mk.collected);
      const x1 = X(addDaysKey(mk.returnBy, 1));
      const left = mk.scripts - mk.marked;
      const minutes = left * mk.rate;
      let days = 0;
      for (let d = mk.collected; d <= mk.returnBy; d = addDaysKey(d, 1)) if (WINDOW_MINUTES[(new Date(toMs(d)).getUTCDay() + 6) % 7]) days++;
      const from = mk.collected > TODAY ? mk.collected : TODAY;
      let daysLeft = 0;
      for (let d = from; d <= mk.returnBy; d = addDaysKey(d, 1)) if (WINDOW_MINUTES[(new Date(toMs(d)).getUTCDay() + 6) % 7]) daysLeft++;
      const perDay = minutes / Math.max(1, daysLeft);
      const cap = 120;
      const warn = perDay > cap * 0.6;
      const hrs = minutes >= 60 ? `~${Math.round(minutes / 60)} h left` : `~${Math.round(minutes)} min left`;
      const id = `shadow:${t.id}`;
      specs.set(id, {
        kind: 'shadow',
        text: `${mk.cls} · ${mk.marked} of ${mk.scripts} · ${hrs}`,
        sub: warn ? `needs ${Math.round(perDay)} min a day` : '',
        colour: colourOf({ domain: t.domain }),
        flags: { warn }
      });
      E.set(id, { x: x0, y: y + (r.h - TL.shadow.h) / 2, w: x1 - x0, progress: mk.marked / mk.scripts, perDay, days });
    }
    if (r.kind === 'group' && !r.open && r.ref === 'grp-loose') {
      // collapsed group shows nothing on the canvas; the label carries the count
    }
  }

  // Dependency curves between visible marks.
  const anchor = (tid: string, end: 'start' | 'finish'): { x: number; y: number } | null => {
    const bar = E.get(`bar:${tid}`) ?? E.get(`step:${tid}`);
    if (bar) return { x: end === 'finish' ? bar.x! + bar.w! : bar.x!, y: bar.y! + TL.bar.h / 2 };
    const ms = E.get(`ms:${tid}`);
    if (ms) return { x: ms.x! + (end === 'finish' ? 8 : -8), y: ms.y! };
    return null;
  };
  const links: Array<[string, string]> = [];
  for (const t of state.tasks) for (const d of t.deps ?? []) links.push([d, t.id]);
  for (const m of MILESTONES) for (const d of m.deps ?? []) links.push([d, m.id]);
  for (const [from, to] of links) {
    const a = anchor(from, 'finish');
    const b = anchor(to, 'start');
    if (!a || !b) continue;
    const key = `${from}>${to}`;
    const id = `curve:${key}`;
    const critical = state.critical && CRITICAL.has(key);
    specs.set(id, { kind: 'curve', flags: { critical } });
    E.set(id, { x1: a.x, y1: a.y, x2: b.x - 2, y2: b.y, dim: state.critical && !critical ? 1 : 0, crit: critical ? 1 : 0 });
  }

  // Today.
  specs.set('today', { kind: 'today' });
  E.set('today', { x: X(TODAY) + dw * TODAY_FRAC, h: rowsBottom + 4 });

  // Load strip.
  capPath = '';
  if (state.load) {
    const weeks = weekLoad();
    const maxMin = Math.max(...weeks.map((w) => Math.max(w.minutes, w.capacity)), 1);
    const base = loadTop + TL.load.h - 10;
    const scaleH = (m: number) => ((TL.load.h - TL.load.top - 10) * m) / maxMin;
    const cap: string[] = [];
    for (const w of weeks) {
      const x0 = X(w.key);
      const x1 = X(addDaysKey(w.key, 7));
      const over = w.minutes > w.capacity && w.capacity > 0;
      const id = `load:${w.key}`;
      specs.set(id, { kind: 'load', text: `${Math.round(w.minutes / 60)} h`, flags: { over, wall: w.wall } });
      E.set(id, { x: x0 + TL.load.colGap / 2, w: Math.max(2, x1 - x0 - TL.load.colGap), h: Math.max(w.minutes ? 3 : 0, scaleH(w.minutes)), base });
      const cy = base - scaleH(w.capacity);
      cap.push(`${cap.length ? 'L' : 'M'}${x0} ${cy} L${x1} ${cy}`);
    }
    capPath = cap.join(' ');
    if (compact) {
      specs.set('rowtitle:load', { kind: 'rowtitle', text: 'Load', data: { kind: 'group' } });
      E.set('rowtitle:load', { x: 0, y: loadTop + 8 });
    }
    specs.set('cap', { kind: 'cap' });
    E.set('cap', { x: 0, top: loadTop - 8 });
  }

  // Hammond ghosts.
  if (state.hammond) {
    for (const c of HAMMOND.changes) {
      const t = state.tasks.find((t) => t.id === c.id)!;
      const cur = E.get(`bar:${t.id}`);
      if (!cur) continue;
      const span = taskSpan({ ...t, due: c.due })!;
      const b = barX(span);
      const gid = `ghost:${t.id}`;
      specs.set(gid, { kind: 'ghost' });
      E.set(gid, { x: b.x, y: cur.y!, w: b.w });
      const aid = `garrow:${t.id}`;
      specs.set(aid, { kind: 'garrow' });
      const fromX = cur.x! + cur.w! / 2;
      const toX = b.x + b.w / 2;
      E.set(aid, { x1: fromX, y1: cur.y! - 2, x2: toX + (toX > fromX ? -2 : 2), y2: cur.y! - 2 });
    }
  }

  // Drag ripple: dependants preview where cascadeForward would put them.
  if (state.drag && state.drag.days) {
    const moved = new Map<string, number>([[state.drag.id, state.drag.days]]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [from, to] of links) {
        if (!moved.has(from) || moved.has(to)) continue;
        moved.set(to, moved.get(from)!);
        changed = true;
      }
    }
    for (const [id, days] of moved) {
      if (id === state.drag.id) continue;
      const m = MILESTONES.find((m) => m.id === id);
      const t = state.tasks.find((t) => t.id === id);
      const cur = E.get(`bar:${id}`) ?? E.get(`ms:${id}`);
      if (!cur) continue;
      const rid = `ripple:${id}`;
      if (m && days > 0) {
        const due = addDaysKey(m.due, days);
        specs.set(rid, { kind: 'ripple', text: `would slip to ${fmt(due)}`, flags: { slip: true } });
        const rx = X(due) + dw / 2 - TL.bar.h / 2;
        const labelEnd = cur.x! + TL.diamond / 2 + 8 + textW(`${m.title} · ${fmt(m.due)}`, '600 12px Inter');
        E.set(rid, { x: rx, y: cur.y! - TL.bar.h / 2, w: TL.bar.h, lx: Math.max(TL.bar.h + 8, labelEnd - rx + 12) });
      } else if (m) {
        specs.set(rid, { kind: 'ripple', text: '' });
        E.set(rid, { x: X(addDaysKey(m.due, days)) + dw / 2 - TL.bar.h / 2, y: cur.y! - TL.bar.h / 2, w: TL.bar.h });
      } else if (t) {
        const span = taskSpan({ ...t, due: addDaysKey(t.due!, days) })!;
        const b = barX(span);
        specs.set(rid, { kind: 'ripple', text: '' });
        E.set(rid, { x: b.x, y: cur.y!, w: b.w });
      }
    }
  }

  return { entities: E, width, height };
}

/* ───────────── Render ───────────── */
const engine = createMotion({ apply });
let lastIds: string[] = [];
let geometry = { width: 0, height: 0 };

function relayout(reason: 'zoom' | 'settle' | 'expand' | 'first' | 'drag' | 'release'): void {
  const anchorX = zoomAnchor ? zoomAnchor.screenX : 0;
  const L = layout();
  geometry = { width: L.width, height: L.height };
  // During a zoom the canvas is sized once for the widest frame (see setZoom), so the
  // per-frame scrollLeft write only flushes SVG attributes, not a page reflow.
  const w = reason === 'zoom' && zoomCanvasWidth ? zoomCanvasWidth : L.width;
  if (els.svg.getAttribute('width') !== String(w)) {
    els.svg.setAttribute('width', String(w));
    els.svg.style.width = `${w}px`;
  }
  if (els.svg.getAttribute('height') !== String(L.height)) els.svg.setAttribute('height', String(L.height));
  els.labels.style.height = `${L.height}px`;
  els.labels.style.setProperty('--tl-top', `${TL.axis.h + 8}px`);
  const legend = document.getElementById('tl-load-label') as HTMLElement;
  legend.hidden = !state.load;
  legend.style.top = `${L.height - TL.load.h + 8}px`;
  if (reason === 'zoom') {
    // One value tweens; everything else is placed at that value. No per-entity zoom tweens.
    for (const [id, props] of L.entities) {
      if (!nodes.has(id)) create(id);
      engine.place(id, { opacity: 1, scale: 1, ...props });
    }
    for (const id of lastIds) if (!L.entities.has(id)) { engine.forget(id); remove(id); }
    lastIds = [...L.entities.keys()];
    if (zoomAnchor) els.scroller.scrollLeft = scale.x(zoomAnchor.date) + zoomAnchor.frac * state.dayWidth - anchorX;
    return;
  }
  const opts =
    reason === 'release' ? { duration: MOTION.release, easing: OVERSHOOT }
    : reason === 'expand' ? { duration: MOTION.expand, easing: EASE }
    : reason === 'drag' ? { duration: MOTION.hover, easing: EASE }
    : { duration: MOTION.settle, easing: EASE };
  if (reason === 'first') {
    for (const [id, props] of L.entities) {
      create(id);
      engine.place(id, { opacity: 1, scale: 1, ...props });
    }
    lastIds = [...L.entities.keys()];
    playEntrance();
    return;
  }
  reconcile(engine, L.entities, {
    previous: lastIds,
    create,
    remove,
    options: opts,
    stagger: reason === 'expand' ? 0 : 0
  });
  lastIds = [...L.entities.keys()];
  paintLabels();
}

function paintLabels(): void {
  for (const r of rows) {
    const node = nodes.get(`label:${r.id}`) as HTMLElement | undefined;
    if (!node || node.dataset.painted === `${r.open}-${r.label}`) continue;
    node.dataset.painted = `${r.open}-${r.label}`;
    node.className = `tl-label tl-label--${r.kind}`;
    node.setAttribute('data-part', 'label');
    node.setAttribute('data-row', r.ref);
    node.style.setProperty('--depth', String(r.depth));
    node.innerHTML = '';
    const expandable = r.kind === 'goal' || r.kind === 'project' || r.kind === 'group' || (r.kind === 'task' && state.tasks.some((c) => c.parent === r.ref));
    if (expandable) {
      const b = h('button', `tl-chev${r.open || (r.kind === 'task' && isExpanded(r.ref, 'task')) ? ' is-open' : ''}`, undefined, node);
      b.type = 'button';
      b.setAttribute('aria-expanded', String(Boolean(r.open)));
      b.setAttribute('aria-label', `${r.open ? 'Collapse' : 'Expand'} ${r.label}`);
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>';
      b.onclick = () => toggle(r.ref, r.kind);
    } else h('span', 'tl-chev-space', undefined, node);
    if (r.kind === 'project') {
      const dot = h('i', 'tl-label__dot', undefined, node);
      dot.style.background = r.colour ?? 'var(--wave)';
    }
    if (r.kind === 'dream') h('span', 'tl-label__tag', 'Dream', node);
    h('span', 'tl-label__text', r.label, node);
    if (r.kind === 'group' && r.ref === 'grp-loose' && !r.open) h('span', 'tl-label__count', String(state.tasks.filter((t) => !t.project && !t.marking).length), node);
  }
}

function toggle(ref: string, kind: RowKind): void {
  const k = kind === 'task' ? 'task' : kind === 'group' ? 'group' : kind === 'goal' ? 'goal' : 'project';
  state.expanded.set(ref, !isExpanded(ref, k as 'goal'));
  announce(`${state.expanded.get(ref) ? 'Expanded' : 'Collapsed'} ${ref}`);
  relayout('expand');
}

/* Entrance: rows rise in, curves draw, today drops. Played once on first mount. */
function playEntrance(): void {
  paintLabels();
  if (reduced) return;
  let i = 0;
  for (const id of lastIds) {
    const kind = specs.get(id)!.kind;
    const node = nodes.get(id);
    if (!node) continue;
    if (kind === 'curve') {
      const path = node.querySelector('path')!;
      const L = path.getTotalLength();
      path.animate([{ strokeDasharray: `${L}`, strokeDashoffset: L }, { strokeDasharray: `${L}`, strokeDashoffset: 0 }], { duration: 420, delay: 380, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    } else if (kind === 'bar' || kind === 'ms' || kind === 'proj' || kind === 'bracket' || kind === 'band' || kind === 'shadow' || kind === 'dream' || kind === 'undated' || kind === 'ribbon' || kind === 'step' || kind === 'label') {
      const p = engine.get(id);
      const delay = Math.min(360, ((p?.y ?? 0) / 12) | 0);
      (node as HTMLElement).animate([{ opacity: 0, transform: `${kind === 'label' ? `translate3d(0, ${p?.y ?? 0}px, 0) ` : ''}translateY(6px)` }, { opacity: 1, transform: `${kind === 'label' ? `translate3d(0, ${p?.y ?? 0}px, 0) ` : ''}translateY(0)` }], { duration: 260, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards', composite: kind === 'label' ? 'replace' : 'add' });
    } else if (kind === 'load') {
      // Animate the inner .tl-pop group: it has transform-box: fill-box, so it grows from its own bottom.
      (node.firstElementChild as SVGGElement).animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 320, delay: 300 + (i++ % 30) * 12, easing: 'cubic-bezier(.34,1.3,.64,1)', fill: 'backwards' });
    }
  }
}

/* ───────────── Zoom ───────────── */
let zoomAnchor: null | { date: string; frac: number; screenX: number } = null;
let zoomCanvasWidth = 0;
let zoomSettle = 0;
function setZoom(index: number, anchorClientX?: number): void {
  index = Math.max(0, Math.min(TL.zooms.length - 1, index));
  if (index === state.zoom && anchorClientX === undefined) return;
  const box = els.scroller.getBoundingClientRect();
  const screenX = anchorClientX !== undefined ? anchorClientX - box.left : scale.x(TODAY) + state.dayWidth * TODAY_FRAC - els.scroller.scrollLeft;
  const contentX = els.scroller.scrollLeft + screenX;
  const date = scale.dateAt(contentX);
  zoomAnchor = { date, frac: (contentX - scale.x(date)) / state.dayWidth, screenX };
  const prevZoom = state.zoom;
  state.zoom = index;
  paintZoomPills();
  const semantic = TL.zooms[prevZoom]!.id !== TL.zooms[index]!.id;
  const target = buildTimeScale({ start: RANGE.start, end: RANGE.end, terms: SCHOOL, dayWidth: TL.zooms[index]!.dayWidth, holidayFactor: state.holidaysCompressed ? 0.25 : 1 });
  zoomCanvasWidth = Math.max(scale.width, target.width) + PAD_R;
  engine.place('__view', { dayWidth: state.dayWidth });
  engine.to('__view', { dayWidth: TL.zooms[index]!.dayWidth }, { duration: MOTION.zoom, easing: EASE });
  window.clearTimeout(zoomSettle);
  zoomSettle = window.setTimeout(() => {
    zoomCanvasWidth = 0;
    relayout(semantic ? 'expand' : 'settle');
  }, reduced ? 0 : MOTION.zoom + 20);
  announce(`Zoom ${TL.zooms[index]!.label}`);
}

/* ───────────── Toolbar ───────────── */
const zoomPills = document.getElementById('tl-zoom') as HTMLElement;
function paintZoomPills(): void {
  if (!zoomPills.children.length) {
    h('span', 'hub-pills__thumb', undefined, zoomPills);
    TL.zooms.forEach((z, i) => {
      const b = h('button', 'hub-pills__btn', z.label, zoomPills);
      b.type = 'button';
      b.onclick = () => setZoom(i);
    });
  }
  [...zoomPills.querySelectorAll('button')].forEach((b, i) => {
    b.classList.toggle('is-active', i === state.zoom);
    b.setAttribute('aria-pressed', String(i === state.zoom));
  });
  moveThumb(zoomPills);
}
function moveThumb(group: HTMLElement): void {
  const active = group.querySelector<HTMLElement>('.is-active');
  const thumb = group.querySelector<HTMLElement>('.hub-pills__thumb');
  if (!active || !thumb) return;
  group.style.setProperty('--hub-pill-x', `${active.offsetLeft}px`);
  group.style.setProperty('--hub-pill-y', `${active.offsetTop}px`);
  group.style.setProperty('--hub-pill-w', `${active.offsetWidth}px`);
  group.style.setProperty('--hub-pill-h', `${active.offsetHeight}px`);
  group.classList.add('is-ready');
  requestAnimationFrame(() => group.classList.add('is-animated'));
}

const viewPills = document.getElementById('tl-view') as HTMLElement;
function paintViewPills(): void {
  [...viewPills.querySelectorAll('button')].forEach((b) => {
    const on = b.dataset.view === state.view;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  moveThumb(viewPills);
}
viewPills.querySelectorAll('button').forEach((b) => (b.onclick = () => setView(b.dataset.view as ViewMode)));

const critBtn = document.getElementById('tl-critical') as HTMLButtonElement;
critBtn.onclick = () => {
  state.critical = !state.critical;
  critBtn.setAttribute('aria-pressed', String(state.critical));
  relayout('settle');
};
const loadBtn = document.getElementById('tl-load') as HTMLButtonElement;
loadBtn.onclick = () => {
  state.load = !state.load;
  loadBtn.setAttribute('aria-pressed', String(state.load));
  relayout('expand');
};
const holBtn = document.getElementById('tl-holidays') as HTMLButtonElement;
holBtn.onclick = () => {
  state.holidaysCompressed = !state.holidaysCompressed;
  holBtn.textContent = state.holidaysCompressed ? 'Holidays: compressed' : 'Holidays: full';
  relayout('settle');
};
(document.getElementById('tl-today-btn') as HTMLButtonElement).onclick = () => scrollToToday(true);
(document.getElementById('tl-hammond') as HTMLButtonElement).onclick = () => showHammond(true);

function scrollToToday(smooth: boolean): void {
  const target = Math.max(0, scale.x(addDaysKey(mondayOf(TODAY), -21)) - 1);
  els.scroller.scrollTo({ left: target, behavior: smooth && !reduced ? 'smooth' : 'auto' });
}

/* ───────────── Hammond ───────────── */
function showHammond(on: boolean): void {
  state.hammond = on;
  els.tray.hidden = !on;
  if (on) {
    els.tray.classList.remove('is-in');
    requestAnimationFrame(() => els.tray.classList.add('is-in'));
  }
  if (on) {
    // Every proposal must be visible: open the rows that hold proposed tasks.
    for (const c of HAMMOND.changes) {
      const t = state.tasks.find((t) => t.id === c.id);
      state.expanded.set(t?.project ?? 'grp-loose', true);
    }
  }
  relayout('settle');
}
(document.getElementById('tl-apply') as HTMLButtonElement).onclick = () => {
  for (const c of HAMMOND.changes) {
    const t = state.tasks.find((t) => t.id === c.id);
    if (t) t.due = c.due;
  }
  state.hammond = false;
  els.tray.hidden = true;
  relayout('settle');
  announce('Applied 3 changes from Hammond');
};
(document.getElementById('tl-dismiss') as HTMLButtonElement).onclick = () => showHammond(false);

/* ───────────── Drag ───────────── */
/** Curves attached to the dragged bar follow it 1:1 (place, never tween). */
function curveSnapshot(tid: string): Map<string, Props> {
  const snap = new Map<string, Props>();
  for (const id of lastIds) {
    if (!id.startsWith('curve:')) continue;
    const [a, b] = id.slice(6).split('>');
    if (a === tid || b === tid) snap.set(id, { ...engine.get(id)! });
  }
  return snap;
}
function followCurves(tid: string, snap: Map<string, Props>, dx: number): void {
  for (const [id, p] of snap) {
    const [a, b] = id.slice(6).split('>');
    engine.place(id, { x1: p.x1! + (a === tid ? dx : 0), x2: p.x2! + (b === tid ? dx : 0) });
  }
}
function onPointerDown(ev: PointerEvent): void {
  const g = (ev.target as Element).closest('[data-part="bar"]') as SVGGElement | null;
  if (!g || state.view !== 'bars') return;
  const tid = g.getAttribute('data-task-id')!;
  const id = `bar:${tid}`;
  const p = engine.get(id);
  if (!p) return;
  ev.preventDefault();
  g.setPointerCapture(ev.pointerId);
  g.classList.add('is-dragging');
  select(tid);
  state.drag = { id: tid, dx: 0, startX: ev.clientX, days: 0 };
  const startX = p.x!;
  const snap = curveSnapshot(tid);
  const move = (e: PointerEvent) => {
    if (!state.drag) return;
    const dx = e.clientX - state.drag.startX;
    // 1:1 with the pointer. No easing while dragging.
    engine.place(id, { x: startX + dx });
    followCurves(tid, snap, dx);
    const days = Math.round(dx / state.dayWidth);
    if (days !== state.drag.days) {
      state.drag.days = days;
      relayoutDragPreview();
    }
  };
  const up = () => {
    g.removeEventListener('pointermove', move);
    g.classList.remove('is-dragging');
    const days = state.drag?.days ?? 0;
    const moved = new Set<string>();
    if (days) {
      const queue = [tid];
      while (queue.length) {
        const cur = queue.shift()!;
        if (moved.has(cur)) continue;
        moved.add(cur);
        for (const t of state.tasks) if ((t.deps ?? []).includes(cur)) queue.push(t.id);
      }
      for (const t of state.tasks) if (moved.has(t.id) && t.due) t.due = addDaysKey(t.due, days);
    }
    state.drag = null;
    // Released bar settles with overshoot; dependants follow with a stagger.
    const L = layout();
    let i = 0;
    for (const [eid, props] of L.entities) {
      if (!nodes.has(eid)) create(eid);
      const ref = eid.split(':')[1] ?? '';
      const isDep = moved.has(ref) && ref !== tid;
      engine.to(eid, { opacity: 1, scale: 1, ...props }, {
        duration: eid === id ? MOTION.release : MOTION.settle,
        easing: eid === id ? OVERSHOOT : EASE,
        delay: isDep ? MOTION.cascadeStagger * ++i : 0
      });
    }
    for (const eid of lastIds) if (!L.entities.has(eid)) engine.exit(eid, () => remove(eid));
    lastIds = [...L.entities.keys()];
    els.banner.hidden = true;
    if (days) announce(`Moved ${tid} by ${days} days`);
  };
  g.addEventListener('pointermove', move);
  g.addEventListener('pointerup', up, { once: true });
  g.addEventListener('pointercancel', up, { once: true });
}
function relayoutDragPreview(): void {
  const L = layout();
  for (const [eid, props] of L.entities) {
    if (!eid.startsWith('ripple:') && !eid.startsWith('load:')) continue;
    if (!nodes.has(eid)) {
      create(eid);
      engine.enter(eid, props, { duration: MOTION.hover });
    } else engine.to(eid, props, { duration: MOTION.hover });
  }
  for (const eid of lastIds) if (eid.startsWith('ripple:') && !L.entities.has(eid)) engine.exit(eid, () => remove(eid));
  lastIds = [...new Set([...lastIds.filter((i) => !i.startsWith('ripple:')), ...[...L.entities.keys()].filter((i) => i.startsWith('ripple:'))])];
  const slips = [...L.entities.keys()].some((k) => k.startsWith('ripple:m-'));
  els.banner.hidden = !slips;
}
els.svg.addEventListener('pointerdown', onPointerDown);

/* ───────────── Selection and keyboard ───────────── */
function select(tid: string | null): void {
  state.selected = tid;
  document.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
  if (tid) document.querySelector(`[data-part="bar"][data-task-id="${tid}"]`)?.classList.add('is-selected');
}
els.svg.addEventListener('click', (e) => {
  const g = (e.target as Element).closest('[data-part="bar"]');
  select(g ? g.getAttribute('data-task-id') : null);
});
document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, textarea')) return;
  if (e.key === '+' || e.key === '=') setZoom(state.zoom + 1);
  else if (e.key === '-') setZoom(state.zoom - 1);
  else if (e.key.toLowerCase() === 'l') setView(state.view === 'bars' ? 'lines' : 'bars');
  else if (e.key === 'Escape' && state.hammond) showHammond(false);
});
els.scroller.addEventListener(
  'wheel',
  (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    wheelAccum += e.deltaY;
    if (Math.abs(wheelAccum) > 60) {
      setZoom(state.zoom + (wheelAccum < 0 ? 1 : -1), e.clientX);
      wheelAccum = 0;
    }
  },
  { passive: false }
);
let wheelAccum = 0;

function announce(msg: string): void {
  els.live.textContent = msg;
}

/* ───────────── Lines (port of docs/proposals/graph-reference/lines.html, horizontal) ───────────── */
const G = { padL: 44, termGap: 22, trackW: 7, labelY: -24, subY: 30, termH: 30, termPadX: 14, r: { done: 8, open: 8, current: 11 } };
function renderLines(): void {
  const host = els.lines;
  host.innerHTML = '';
  const width = host.clientWidth || els.card.clientWidth - 32;
  const vertical = width < 560;
  for (const p of PROJECTS.filter((p) => p.id !== 'p-seat')) {
    const col = colourOf(p);
    const art = h('article', 'tl-line', undefined, host);
    art.setAttribute('data-part', 'line');
    art.innerHTML = `<div class="tl-line__head"><h3 class="tl-line__name"><i style="background:${col}"></i>${p.title}</h3></div>`;
    const stations = state.tasks.filter((t) => t.project === p.id && !t.parent).sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
    const ms = MILESTONES.filter((m) => m.project === p.id).slice(-1)[0];
    const termText = ms ? `${ms.title} · ${fmt(ms.due)}` : fmt(p.end);
    const cur = Math.max(0, stations.findIndex((t) => t.status !== 'done'));
    const stateOf = (t: FxTask, i: number) => (t.status === 'done' ? 'done' : i === cur ? 'current' : 'open') as 'done' | 'current' | 'open';
    const subOf = (t: FxTask, st: string) => (st === 'current' ? 'you are here' : t.blocked ? 'blocked' : t.status === 'done' ? 'done' : t.due ? `due ${fmt(t.due).slice(0, 5)}` : 'no date');
    const paintStation = (svg: SVGSVGElement, t: FxTask, st: 'done' | 'current' | 'open', x: number, y: number) => {
      const c = s('circle', { cx: x, cy: y, r: G.r[st], 'data-entity-id': t.id, 'data-morph-shape': 'station', 'data-morph-color': col }, svg);
      if (st === 'done') set(c, { fill: col, stroke: '#fff', 'stroke-width': 2.5 });
      else set(c, { fill: '#fff', stroke: col, 'stroke-width': st === 'current' ? 4.5 : 3.5 });
    };
    if (vertical) {
      // Port of renderLineV in graph-reference/lines.html: track at x 22, stations 64 apart.
      const x0 = 22;
      const ys = stations.map((_, i) => 22 + i * 64);
      const endY = 22 + stations.length * 64;
      const H = endY + 44;
      const svg = s('svg', { class: 'tl-line__svg', viewBox: `0 0 ${width} ${H}`, height: H, width: '100%' }, art);
      const track = s('g', { 'data-entity-id': p.id, 'data-morph-shape': 'track', 'data-morph-color': col }, svg);
      s('path', { d: `M${x0} ${ys[0]}V${ys[cur]}`, stroke: col, 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none', opacity: 0.32 }, track);
      s('path', { d: `M${x0} ${ys[cur]}V${endY}`, stroke: col, 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none' }, track);
      stations.forEach((t, i) => {
        const st = stateOf(t, i);
        paintStation(svg, t, st, x0, ys[i]!);
        s('text', { class: 'tl-line__lbl', x: x0 + 26, y: ys[i]! + 1 }, svg).textContent = fit(t.title, '500 13px Inter', width - x0 - 40);
        s('text', { class: `tl-line__sub${st === 'current' ? ' is-here' : ''}${t.blocked ? ' is-danger' : ''}`, x: x0 + 26, y: ys[i]! + 18 }, svg).textContent = subOf(t, st);
      });
      const tw = Math.ceil(textW(termText, '600 13px Inter')) + 28;
      const tg = s('g', { 'data-entity-id': ms?.id ?? `${p.id}-end`, 'data-morph-shape': 'terminus', 'data-morph-color': col }, svg);
      s('rect', { x: x0 - 12, y: endY, width: tw, height: 30, rx: 15, fill: col }, tg);
      s('text', { class: 'tl-line__term', x: x0 - 12 + tw / 2, y: endY + 19.5, 'text-anchor': 'middle' }, tg).textContent = termText;
      continue;
    }
    const termW = Math.ceil(textW(termText, '600 13px Inter')) + G.termPadX * 2;
    const n = stations.length;
    const step = (width - termW - 4 - G.termGap - G.padL) / Math.max(0.5, n - 0.5);
    const xs = stations.map((_, i) => G.padL + i * step);
    const termX = (xs[n - 1] ?? G.padL) + step * 0.5 + G.termGap;
    const y = 40;
    const svg = s('svg', { class: 'tl-line__svg', viewBox: `0 0 ${width} 84`, height: 84, width: '100%' }, art);
    const track = s('g', { 'data-entity-id': p.id, 'data-morph-shape': 'track', 'data-morph-color': col }, svg);
    s('path', { d: `M${G.padL} ${y}H${xs[cur] ?? G.padL}`, stroke: col, 'stroke-width': G.trackW, 'stroke-linecap': 'round', fill: 'none', opacity: 0.32 }, track);
    s('path', { d: `M${xs[cur] ?? G.padL} ${y}H${termX}`, stroke: col, 'stroke-width': G.trackW, 'stroke-linecap': 'round', fill: 'none' }, track);
    stations.forEach((t, i) => {
      const x = xs[i]!;
      const st = stateOf(t, i);
      paintStation(svg, t, st, x, y);
      s('text', { class: 'tl-line__lbl', x, y: y + G.labelY, 'text-anchor': 'middle' }, svg).textContent = fit(t.title, '500 13px Inter', step - 14);
      s('text', { class: `tl-line__sub${st === 'current' ? ' is-here' : ''}${t.blocked ? ' is-danger' : ''}`, x, y: y + G.subY, 'text-anchor': 'middle' }, svg).textContent = subOf(t, st);
    });
    const tg = s('g', { 'data-entity-id': ms?.id ?? `${p.id}-end`, 'data-morph-shape': 'terminus', 'data-morph-color': col }, svg);
    s('rect', { x: termX, y: y - G.termH / 2, width: termW, height: G.termH, rx: G.termH / 2, fill: col }, tg);
    const tt = s('text', { class: 'tl-line__term', x: termX + termW / 2, y: y + 4.5, 'text-anchor': 'middle' }, tg);
    tt.textContent = termText;
  }
}

/* ───────────── Bars <-> Lines ───────────── */
let morph: MorphController | null = null;
function setView(next: ViewMode): void {
  if (morph) {
    // Mid-flight: reverse from the current frame.
    morph.reverse();
    state.view = state.view === 'bars' ? 'lines' : 'bars';
    paintViewPills();
    return;
  }
  if (next === state.view) return;
  const fromRoot = state.view === 'bars' ? els.bars : els.lines;
  const toRoot = next === 'bars' ? els.bars : els.lines;
  if (next === 'lines') renderLines();
  state.view = next;
  paintViewPills();
  els.card.dataset.view = next;
  morph = startMorph({ host: els.card, fromRoot, toRoot, reducedMotion: reduced });
  morph.finished.then((result) => {
    morph = null;
    if (result === 'reversed') {
      els.card.dataset.view = state.view;
    }
    announce(`${state.view === 'bars' ? 'Bars' : 'Lines'} view`);
  });
}

/* ───────────── Boot ───────────── */
void document.fonts.ready.then(() => {
  // Text is measured for fit and truncation, so layout waits for Inter. The app must do the same.
  paintZoomPills();
  paintViewPills();
  relayout('first');
  scrollToToday(false);
  onScroll();
});
let resizeTimer = 0;
window.addEventListener('resize', () => {
  moveThumb(zoomPills);
  moveThumb(viewPills);
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => relayout('settle'), 150);
});

/* Reference controls (not part of the product). */
(document.getElementById('ref-live') as HTMLButtonElement).onclick = () => {
  const t = state.tasks.find((t) => t.id === 't6')!;
  t.due = t.due === '2026-09-29' ? '2026-10-01' : '2026-09-29';
  relayout('settle');
  announce('Excursion form moved on the Board');
};
(document.getElementById('ref-drag') as HTMLButtonElement).onclick = () => {
  state.drag = { id: 't5', dx: 0, startX: 0, days: 6 };
  const p = engine.get('bar:t5')!;
  const snap = curveSnapshot('t5');
  const dx = scale.x(addDaysKey('2026-09-25', 6)) - scale.x('2026-09-25');
  engine.place('bar:t5', { x: p.x! + dx });
  followCurves('t5', snap, dx);
  document.querySelector('[data-part="bar"][data-task-id="t5"]')?.classList.add('is-dragging');
  relayoutDragPreview();
};

declare global {
  interface Window {
    __timeline: { engine: typeof engine; state: typeof state; setZoom: typeof setZoom; setView: typeof setView; showHammond: typeof showHammond; relayout: typeof relayout; morphBusy: () => boolean };
  }
}
window.__timeline = { engine, state, setZoom, setView, showHammond, relayout, morphBusy: () => morph !== null };
