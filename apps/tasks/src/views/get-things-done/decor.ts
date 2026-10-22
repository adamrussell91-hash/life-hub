// apps/tasks/src/views/get-things-done/decor.ts
/**
 * Gear Shifter's shapes, after the book's cover: whole rings, a red gear inside two blue return
 * arrows, the target, the slate dart and a dotted divider. The shape board, the medal, the track,
 * the route and the coach look, ported from the approved mockups (docs/mockups/gear-shifter/).
 * They sit in Problem Solver's layout classes (ps-loom, ps-track) so the three tools read as a
 * set; the shapes and colours are Gear Shifter's own. Every string here is static markup; user
 * text is always set with textContent elsewhere.
 */
import { el } from '@/views/hub-kit';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { ROUTE, parseRoute } from '../../../../../packages/get-things-done/route.mjs';
import { entry as catalogueEntry } from '../../../../../packages/get-things-done/catalogue.mjs';
import { COMMIT_ID } from '../../../../../packages/get-things-done/commit-slots.mjs';
import { mainModel } from '../../../../../packages/decision-book/record.mjs';
import { BOOK_SVG, ENTRY_SVG, SECTION_SVG, entryEmblem, sectionEmblem } from '../../../../../packages/get-things-done/glyphs';
import type { PsSession, PsSummary } from '../../../../../packages/problem-solver/types';
import type { CoachLook } from '../problem-solver/coach-panel';
import { reducedMotion } from '../problem-solver/decor';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A registered tool by id (Gear Shifter's ids are strings the toolkit's id type does not list). */
export const toolNamed = (id: string): { name: string; when: string } | undefined => (TOOLS as Record<string, { name: string; when: string }>)[id];

/** A technique's name for a label: without its leading "The", starting with a capital ("Pomodoro Technique"). */
export function plainName(id: string): string {
  const name = (toolNamed(id)?.name ?? id).replace(/^The /, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function svg(viewBox: string, markup: string, className?: string): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  node.innerHTML = markup;
  return node;
}

/* ── The cover's shapes: strokes 4/6/9, round joins, solid chunky heads ── */

const f1 = (n: number) => Math.round(n * 10) / 10;
const pt = (cx: number, cy: number, r: number, a: number): [number, number] => [f1(cx + r * Math.cos(a)), f1(cy + r * Math.sin(a))];
const RAD = Math.PI / 180;

/** A gear with eight square-ended teeth and a round hole. */
export function gear(cx: number, cy: number, R: number, fill = 'var(--gt-red)', hole = 0.32): string {
  const r = R * 0.74;
  const n = 8;
  const step = (2 * Math.PI) / n;
  const wr = step * 0.27;
  const wt = Math.asin((r * Math.sin(wr)) / R);
  let d = '';
  for (let i = 0; i < n; i += 1) {
    const a = i * step - Math.PI / 2;
    const p1 = pt(cx, cy, r, a - wr);
    const p2 = pt(cx, cy, R, a - wt);
    const p3 = pt(cx, cy, R, a + wt);
    const p4 = pt(cx, cy, r, a + wr);
    const nx = pt(cx, cy, r, a + step - wr);
    d += `${i ? 'L' : 'M'}${p1}L${p2}L${p3}L${p4}A${f1(r)} ${f1(r)} 0 0 1 ${nx}`;
  }
  d += 'Z';
  const h = R * hole;
  if (h > 0) d += `M${f1(cx + h)} ${cy}A${f1(h)} ${f1(h)} 0 1 0 ${f1(cx - h)} ${cy}A${f1(h)} ${f1(h)} 0 1 0 ${f1(cx + h)} ${cy}Z`;
  return `<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`;
}

/** An arc from a0 to a1 degrees (clockwise) with a chunky head at a1. */
export function arrowArc(cx: number, cy: number, R: number, a0: number, a1: number, sw: number, color: string): string {
  const h = sw * 2.1;
  const w = sw * 1.45;
  const back = h / R / RAD;
  const end = a1 * RAD;
  const s = pt(cx, cy, R, a0 * RAD);
  const e = pt(cx, cy, R, (a1 - back * 0.35) * RAD);
  const large = a1 - a0 > 180 ? 1 : 0;
  const base = [cx + R * Math.cos(end), cy + R * Math.sin(end)];
  const t = [-Math.sin(end), Math.cos(end)];
  const nrm = [Math.cos(end), Math.sin(end)];
  const tip = [base[0] + t[0] * h, base[1] + t[1] * h];
  const c1 = [base[0] + nrm[0] * w, base[1] + nrm[1] * w];
  const c2 = [base[0] - nrm[0] * w, base[1] - nrm[1] * w];
  return `<path d="M${s}A${R} ${R} 0 ${large} 1 ${e}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="M${tip.map(f1)}L${c1.map(f1)}L${c2.map(f1)}Z" fill="${color}" stroke="${color}" stroke-width="${f1(sw * 0.35)}" stroke-linejoin="round"/>`;
}

/** The cover's two circular return arrows. */
export const returns = (cx: number, cy: number, R: number, sw = 6, color = 'var(--gt-blue)') => arrowArc(cx, cy, R, 195, 318, sw, color) + arrowArc(cx, cy, R, 15, 138, sw, color);
/** One whole cycle: a ring that returns to itself. */
export const cycle = (cx: number, cy: number, R: number, sw = 9, color = 'var(--gt-blue)') => arrowArc(cx, cy, R, -70, 225, sw, color);
/** The target: blue ring, red ring, red bull. */
export const target = (cx: number, cy: number, R: number, outer = 'var(--gt-blue)', inner = 'var(--gt-red)') =>
  `<circle cx="${cx}" cy="${cy}" r="${f1(R * 0.82)}" fill="none" stroke="${outer}" stroke-width="${f1(R * 0.3)}"/>`
  + `<circle cx="${cx}" cy="${cy}" r="${f1(R * 0.42)}" fill="none" stroke="${inner}" stroke-width="${f1(R * 0.22)}"/>`
  + `<circle cx="${cx}" cy="${cy}" r="${f1(R * 0.16)}" fill="${inner}"/>`;

/** The slate dart: a shaft, fletching and a solid head pointing at (x2, y2). */
export function dart(x1: number, y1: number, x2: number, y2: number, sw = 6, color = 'var(--gt-ink)'): string {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = sw * 2.4;
  const w = sw * 1.5;
  const bx = x2 - Math.cos(a) * h;
  const by = y2 - Math.sin(a) * h;
  const c1 = [bx + Math.sin(a) * w, by - Math.cos(a) * w];
  const c2 = [bx - Math.sin(a) * w, by + Math.cos(a) * w];
  const fl = (k: number) => {
    const x = f1(x1 + Math.cos(a) * k);
    const y = f1(y1 + Math.sin(a) * k);
    return `<path d="M${x} ${y}l${f1(-Math.cos(a - 0.6) * sw * 1.6)} ${f1(-Math.sin(a - 0.6) * sw * 1.6)}M${x} ${y}l${f1(-Math.cos(a + 0.6) * sw * 1.6)} ${f1(-Math.sin(a + 0.6) * sw * 1.6)}" stroke="${color}" stroke-width="${f1(sw * 0.6)}" stroke-linecap="round" fill="none"/>`;
  };
  return `<path d="M${x1} ${y1}L${f1(bx)} ${f1(by)}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`
    + `<path d="M${x2} ${y2}L${c1.map(f1)}L${c2.map(f1)}Z" fill="${color}" stroke="${color}" stroke-width="${f1(sw * 0.3)}" stroke-linejoin="round"/>` + fl(sw * 0.4) + fl(sw * 1.6);
}

/** A dotted divider: a row of round dots. */
export function dots(x1: number, y1: number, x2: number, y2: number, gap = 8, r = 2, color = 'var(--gt-ink)'): string {
  const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / gap));
  let out = '';
  for (let i = 0; i <= n; i += 1) out += `<circle cx="${f1(x1 + ((x2 - x1) * i) / n)}" cy="${f1(y1 + ((y2 - y1) * i) / n)}" r="${r}" fill="${color}"/>`;
  return out;
}

/** Nest an emblem's markup at (x, y), w wide. */
const nested = (markup: string, x: number, y: number, w: number) => markup.replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${w}" `);

/** The red gear inside the blue return arrows: the coach, the rail and the hero mark. */
export const GEAR_MARK = returns(50, 50, 40, 7) + gear(50, 50, 24);

/* ── Shape board ────────────────────────────────────────────────────── */

const B = 'var(--gt-blue)';
const R = 'var(--gt-red)';
const A = 'var(--gt-amber)';
const I = 'var(--gt-ink)';
const PAPER = 'var(--gt-paper)';

/**
 * The board's twelve tiles, in the spec's order: a gear, a gear inside the return arrows, the
 * target, the dart, the target with the dart in it, a blue cycle, a dotted divider with a forward
 * arrow, four blocks in a row, a stack, a ring of five stations, a single red station on a blue
 * route, and the book emblem. `a` is the tile's lead colour.
 */
const SHAPES: Array<(a: string) => string> = [
  (a) => gear(50, 50, 40, a),
  () => returns(50, 50, 38, 7) + gear(50, 50, 21, R),
  () => target(50, 50, 44),
  () => dart(16, 84, 84, 16, 9),
  () => target(54, 54, 40) + dart(96, 4, 60, 40, 7),
  () => cycle(50, 50, 32, 10, B),
  (a) => dots(50, 8, 50, 92, 9, 2.6) + `<path d="M12 50H66" stroke="${a}" stroke-width="9" stroke-linecap="round"/><path d="M90 50L64 34V66Z" fill="${a}" stroke="${a}" stroke-width="3" stroke-linejoin="round"/>`,
  () => [14, 32, 50, 68].map((x, i) => `<rect x="${x}" y="34" width="14" height="32" rx="3" fill="${i === 3 ? 'none' : R}" stroke="${R}" stroke-width="4"/>`).join(''),
  () => `<rect x="20" y="22" width="60" height="14" rx="4" fill="${R}"/><rect x="26" y="43" width="48" height="14" rx="4" fill="none" stroke="${B}" stroke-width="6"/><rect x="32" y="64" width="36" height="14" rx="4" fill="none" stroke="${B}" stroke-width="6"/>`,
  () => `<circle cx="50" cy="50" r="31" fill="none" stroke="${I}" stroke-width="3" stroke-dasharray="0.1 7.5" stroke-linecap="round"/>` + [0, 1, 2, 3, 4].map((k) => {
    const [x, y] = pt(50, 50, 31, (k * 72 - 90) * RAD);
    return `<circle cx="${x}" cy="${y}" r="9" fill="${k === 1 ? R : PAPER}" stroke="${k === 1 ? R : B}" stroke-width="5"/>`;
  }).join(''),
  () => `<path d="M8 74C30 74 30 26 50 26S70 74 92 74" fill="none" stroke="${B}" stroke-width="6" stroke-linecap="round"/><circle cx="8" cy="74" r="5" fill="${B}"/><circle cx="92" cy="74" r="5" fill="${B}"/><circle cx="50" cy="26" r="12" fill="${PAPER}" stroke="${R}" stroke-width="6"/><circle cx="50" cy="26" r="4" fill="${R}"/>`,
  () => nested(BOOK_SVG, 4, 4, 92)
];

const pick = (n: number) => Math.floor(Math.random() * n);
const lead = () => (Math.random() < 0.12 ? A : Math.random() < 0.5 ? R : B);
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_IN = 'cubic-bezier(0.5, 0, 0.75, 0)';

export type ShapeBoard = { el: HTMLElement; nudge(): void };

/**
 * A 4×3 board of round tiles in the cover's language, in Problem Solver's place. The first deal
 * shows the twelve shapes once, in order; then about every two seconds one tile turns away and
 * a new shape springs in. Typing in the New box nudges it. Still under reduced motion.
 */
export function createShapeBoard(): ShapeBoard {
  const wrap = el('div', 'ps-loom gt-loom');
  wrap.setAttribute('aria-hidden', 'true');
  const board = svg('0 0 400 300', '');
  const tiles: SVGGElement[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const cell = document.createElementNS(SVG_NS, 'g');
      cell.setAttribute('transform', `translate(${col * 100} ${row * 100})`);
      cell.innerHTML = `<circle cx="50" cy="50" r="47" fill="${(row + col) % 2 ? 'var(--gt-soft)' : 'var(--gt-blue-tint)'}"/><g class="gt-loom__tile"></g>`;
      board.append(cell);
      tiles.push(cell.lastElementChild as SVGGElement);
    }
  }
  wrap.append(board);
  const motion = !reducedMotion() && typeof tiles[0].animate === 'function';
  const play = (tile: SVGGElement, frames: Keyframe[], ms: number, easing: string, delay = 0) =>
    motion ? tile.animate(frames, { duration: ms, easing, delay, fill: 'backwards' }).finished.catch(() => undefined) : Promise.resolve(undefined);
  const ENTER: Keyframe[] = [{ transform: 'scale(0) rotate(-90deg)', opacity: 0 }, { transform: 'none', opacity: 1 }];
  tiles.forEach((tile, i) => {
    tile.innerHTML = SHAPES[i](lead());
    void play(tile, ENTER, 620, SPRING, i * 110);
  });
  let busy = false;
  const swap = async (i = pick(tiles.length)) => {
    if (busy) return;
    busy = true;
    await play(tiles[i], [{ transform: 'none', opacity: 1 }, { transform: 'scale(0.4) rotate(60deg)', opacity: 0 }], 300, EASE_IN);
    tiles[i].innerHTML = SHAPES[pick(SHAPES.length)](lead());
    await play(tiles[i], ENTER, 620, SPRING);
    busy = false;
  };
  let last = 0;
  if (motion) {
    const timer = setInterval(() => {
      if (!wrap.isConnected) {
        clearInterval(timer);
        return;
      }
      if (!document.hidden) void swap();
    }, 2000);
  }
  return {
    el: wrap,
    nudge() {
      const now = Date.now();
      if (!motion || now - last < 300) return;
      last = now;
      void swap();
    }
  };
}

/* ── The medal ──────────────────────────────────────────────────────── */

export type MedalState = { frame: boolean; route: boolean; section: string | null; technique: string | null; commit: boolean; done: boolean };

const COMMITTED = new Set(['commit', 'review', 'finished']);
const sectionOf = (technique: string | null) => (technique ? catalogueEntry(technique)?.section ?? null : null);

/** What a list row or a session's medal shows. A session also badges its first route station before a technique is chosen. */
export function medalOf(source: PsSummary | PsSession): MedalState {
  if ('turns' in source) {
    const answered = Object.values(source.frame ?? {}).filter(Boolean).length;
    const technique = mainModel(source) as string | null;
    const stations = parseRoute(source.frame?.route ?? '') as string[];
    const firstSection = stations.length ? ROUTE.find((r) => r.id === stations[0])!.section : null;
    return {
      frame: answered >= 1,
      route: stations.length > 0,
      section: sectionOf(technique) ?? firstSection,
      technique,
      commit: COMMITTED.has(source.phase),
      done: source.phase === 'finished' || source.reviewState?.status === 'done'
    };
  }
  const frame = source.frame ?? (source.phase === 'frame' ? 0 : 3);
  const technique = source.main ?? null;
  return { frame: frame >= 1, route: frame >= 2, section: sectionOf(technique), technique, commit: COMMITTED.has(source.phase), done: source.phase === 'finished' };
}

/**
 * The cover, built as the session moves: the red ring once framing starts, the blue return
 * arrows (and the section as a badge) once the work is placed on the route, the technique's
 * emblem in the middle, the dart at Commit, and an amber tick once reviewed.
 */
export function gearMedal(p: MedalState): SVGSVGElement {
  const ghost = 'var(--gt-ghost)';
  const loop = `<g ${p.route ? 'data-piece="loop" ' : ''}class="gt-medal__piece">${returns(50, 50, 44, 6, p.route ? B : ghost)}</g>`;
  const ring = `<circle ${p.frame ? 'data-piece="ring" ' : ''}class="gt-medal__piece" cx="50" cy="50" r="31" fill="var(--ps-card, #fff)" stroke="${p.frame ? R : ghost}" stroke-width="6"/>`;
  const markup = p.technique ? ENTRY_SVG[p.technique] ?? BOOK_SVG : null;
  const core = markup
    ? `<g data-piece="technique" class="gt-medal__piece gt-medal__technique">${nested(markup, 21, 21, 58)}</g>`
    : `<circle cx="50" cy="50" r="10" fill="none" stroke="${ghost}" stroke-width="3" stroke-dasharray="0.1 6" stroke-linecap="round"/>`;
  const badge = p.route && p.section && SECTION_SVG[p.section]
    ? `<g data-piece="badge" class="gt-medal__piece"><circle cx="14" cy="84" r="14" fill="var(--gt-paper)" stroke="var(--gt-line)" stroke-width="1"/>${nested(SECTION_SVG[p.section], 2, 72, 24)}</g>`
    : '';
  const arrow = p.commit ? `<g data-piece="dart" class="gt-medal__piece gt-medal__dart">${dart(97, 3, 72, 28, 5)}</g>` : '';
  const done = p.done ? `<g data-piece="done"><circle cx="84" cy="84" r="9" fill="${A}"/><path d="M79.5 84.5l3 3 6-6.5" fill="none" stroke="${I}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>` : '';
  // Inner emblems carry their own titles; the medal is decorative, so they are dropped.
  return svg('0 0 100 100', `${loop}${ring}${core}${badge}${arrow}${done}`.replace(/<title>.*?<\/title>/g, ''), 'gt-medal');
}

/* ── Track ──────────────────────────────────────────────────────────── */

const STATION_ART = [
  target(50, 50, 44),
  gear(50, 50, 44),
  target(50, 50, 44) + dart(96, 4, 58, 42, 7),
  returns(50, 50, 38, 9)
];
const STATION_NAMES = ['Frame', 'Explore', 'Commit', 'Review'];

/** "5 Nov" for a YYYY-MM-DD date. */
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

type Station = { name: string; state: 'done' | 'now' | 'waiting' | 'future'; note: string };

/** Where the session is (0 Frame … 3 Review, 4 finished) and each station's state and note. */
export function trackStations(session: PsSession): { at: number; stations: Station[] } {
  const order = ['frame', 'explore', 'commit', 'review'];
  const at = session.phase === 'finished' ? 4 : Math.max(0, order.indexOf(session.phase));
  const active = (step: string) => {
    const runs = session.steps?.[step]?.runs ?? [];
    return runs.find((run) => run.status === 'active') ?? runs.filter((run) => run.status !== 'switched').at(-1) ?? null;
  };
  const worked = (session.steps?.explore?.runs ?? []).filter((run) => run.status !== 'switched' && run.nodes.length);
  const waiting = session.reviewState?.status === 'waiting';
  const due = session.reviewState?.due ?? session.reviewProposal?.due ?? null;
  const exploreNote = () => {
    if (at === 1) return active('explore') ? plainName(active('explore')!.tool) : 'Pick a technique';
    if (worked.length === 1) return plainName(worked[0].tool);
    return worked.length ? `${worked.length} techniques` : '';
  };
  const notes = [
    at === 0 ? `Question ${Math.min(Object.values(session.frame ?? {}).filter(Boolean).length + 1, 3)} of 3` : 'Done',
    exploreNote(),
    at === 2 ? ((active('commit')?.tool as string | undefined) === COMMIT_ID ? 'The experiment' : 'Set it up') : at > 2 ? 'Set' : '',
    waiting && due ? `Check back ${shortDate(due)}` : at === 3 ? 'Reviewing' : session.reviewState?.status === 'done' ? 'Done' : due ? `Check back ${shortDate(due)}` : ''
  ];
  const stations = STATION_NAMES.map((name, i) => {
    const state = i === 3 && waiting ? 'waiting' : i === at ? 'now' : i < at ? 'done' : 'future';
    return { name, state: state as Station['state'], note: notes[i] };
  });
  return { at, stations };
}

export type TrackView = { el: HTMLElement; update(session: PsSession): void };

/** Stations for Frame, Explore, Commit and Review, joined by a dotted line. */
export function createTrack(): TrackView {
  const nav = el('nav', 'ps-track gt-track');
  nav.setAttribute('aria-label', 'Process');
  const list = el('ol', 'ps-track__line gt-track__line');
  nav.append(list);
  let key = '';
  return {
    el: nav,
    update(session) {
      const { at, stations } = trackStations(session);
      const next = JSON.stringify(stations);
      if (next === key) return;
      key = next;
      list.style.setProperty('--ps-track-p', String(Math.min(at, 3) / 3));
      list.replaceChildren(...stations.map((station, i) => {
        const item = el('li', 'ps-track__stn gt-track__stn');
        item.dataset.state = station.state;
        if (station.state === 'now') item.setAttribute('aria-current', 'step');
        const mark = el('span', 'ps-track__mark gt-track__mark');
        mark.append(svg('0 0 100 100', STATION_ART[i]));
        item.append(mark, el('span', 'ps-track__name', station.name), el('small', 'gt-track__note', station.note));
        return item;
      }));
    }
  };
}

/* ── Route ──────────────────────────────────────────────────────────── */

/** One line per station: what it means for the work, in our words. */
const ROUTE_LINES: Record<string, string> = {
  before: 'The work has not started yet, and its shape is still open.',
  doing: 'The work is under way, and keeping it moving is the trouble.',
  others: 'The work turns on other people.',
  differently: 'The work needs a change of course, or a limit.',
  after: 'The work is done, and it is time to look back.'
};

export type RouteView = { el: HTMLElement; update(session: PsSession): void };

/**
 * The five section emblems on a dotted loop above the canvas, in the order a piece of work lives
 * through them. Lit stations are ringed and the rest fade; hidden until the route is answered.
 */
export function createRoute(): RouteView {
  const box = el('section', 'gt-route');
  box.hidden = true;
  const loop = el('ol', 'gt-route__loop');
  const items = new Map<string, HTMLElement>();
  for (const station of ROUTE) {
    const item = el('li', 'gt-route__stn');
    const emblem = el('span', 'gt-route__em');
    emblem.append(sectionEmblem(station.section));
    item.append(emblem, el('span', 'gt-route__label', station.label));
    items.set(station.id, item);
    loop.append(item);
  }
  const text = el('p', 'gt-route__text');
  box.append(loop, text);
  let key = '';
  return {
    el: box,
    update(session) {
      const lit: string[] = parseRoute(session.frame?.route ?? '');
      const next = lit.join('+');
      if (next === key) return;
      key = next;
      box.hidden = !lit.length;
      for (const [id, item] of items) {
        item.dataset.lit = String(lit.includes(id));
        if (lit.includes(id)) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      }
      const label = (id: string) => ROUTE.find((r) => r.id === id)!.label;
      text.replaceChildren(...lit.flatMap((id, i) => [...(i ? [document.createTextNode(' ')] : []), el('b', '', `${label(id)}.`), document.createTextNode(` ${ROUTE_LINES[id]}`)]));
      box.setAttribute('aria-label', `Route: ${lit.map(label).join(' and ')}`);
    }
  };
}

/* ── Coach ──────────────────────────────────────────────────────────── */

/** The red gear inside the blue return arrows; the gear turns while the coach thinks. */
export function gtAvatar(): HTMLSpanElement {
  const span = el('span', 'ps-avatar gt-avatar');
  span.append(svg('0 0 100 100', `${returns(50, 50, 40, 8)}<g class="gt-avatar__gear">${gear(50, 50, 24)}</g>`));
  return span;
}

/** The experiment's mark: the dart in the target. */
function commitMark(): HTMLSpanElement {
  const span = el('span', 'gt-emblem');
  span.setAttribute('aria-hidden', 'true');
  span.append(svg('0 0 100 100', target(54, 54, 42) + dart(98, 2, 60, 46, 7)));
  return span;
}

/** How the shared coach panel looks in Gear Shifter. */
export const GT_LOOK: CoachLook = {
  avatar: gtAvatar,
  emblem: (tool) => (tool === COMMIT_ID ? commitMark() : entryEmblem(tool)),
  frames: {
    shift: {
      keys: ['need', 'route', 'known'],
      prompts: ['What needs to move?', 'Where is it stuck?', 'What do you already know?']
    }
  },
  noun: 'Session',
  escalate: { title: 'This needs a full session', accept: 'Go deeper' }
};
