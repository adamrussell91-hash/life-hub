// apps/tasks/src/views/decision-book/decor.ts
/**
 * Decision Maker's shapes, after the book's cover: a red disc that turns back, a green disc that
 * goes forward, and the dotted line between. The shape board, the decision medal, the track,
 * the section compass and the coach avatar. They sit in Problem Solver's layout classes (ps-loom,
 * ps-track) so the two tools read as a set; the shapes and colours are Decision Maker's own.
 * Every string here is static markup; user text is always set with textContent elsewhere.
 */
import { el } from '@/views/hub-kit';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { COMPASS, parseCompass } from '../../../../../packages/decision-book/compass.mjs';
import { SECTIONS } from '../../../../../packages/decision-book/catalogue.mjs';
import { RECORD_ID } from '../../../../../packages/decision-book/record-slots.mjs';
import { MODEL_SVG, modelEmblem, sectionEmblem } from '../../../../../packages/decision-book/glyphs';
import type { PsSession } from '../../../../../packages/problem-solver/types';
import type { CoachLook } from '../problem-solver/coach-panel';
import { reducedMotion } from '../problem-solver/decor';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A registered tool by id (Decision Maker's ids are strings the toolkit's id type does not list). */
export const toolNamed = (id: string): { name: string; when: string } | undefined => (TOOLS as Record<string, { name: string; when: string }>)[id];

/** A model's name for a label: without its leading "The", starting with a capital ("Project portfolio matrix"). */
export function plainName(id: string): string {
  const name = (toolNamed(id)?.name ?? id).replace(/^The /, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function svg(viewBox: string, markup: string, className?: string): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  node.innerHTML = markup;
  return node;
}

/** The cover's two marks: the red disc with its turning-back chevron, the green disc with its forward arrow. */
export const BACK_DISC = '<circle cx="50" cy="50" r="46" fill="var(--dm-red)"/><path d="M68 30H46L28 50L46 70H68V61H50L40 50L50 39H68Z" fill="var(--dm-ink)"/>';
export const FORWARD_DISC = '<circle cx="50" cy="50" r="46" fill="var(--dm-green)"/><path d="M20 41H54L48 28L82 50L48 72L54 59H20L27 50Z" fill="var(--dm-ink)"/>';
const PAIR = '<circle cx="27" cy="50" r="23" fill="var(--dm-red)"/><circle cx="73" cy="50" r="23" fill="var(--dm-green)"/><path d="M50 2V98" stroke="var(--dm-ink)" stroke-width="3" stroke-dasharray="5 4"/>';
const RING = '<circle cx="50" cy="50" r="46" fill="var(--dm-green)"/><circle cx="50" cy="50" r="20" fill="var(--dm-paper)"/>';

/* ── Shape board ────────────────────────────────────────────────────── */

const SHAPES: Array<(a: string, b: string) => string> = [
  () => BACK_DISC,
  () => FORWARD_DISC,
  () => '<path d="M50 6A44 44 0 0 0 50 94Z" fill="var(--dm-red)"/><path d="M50 6A44 44 0 0 1 50 94Z" fill="var(--dm-green)"/><path d="M50 2V98" stroke="var(--dm-ink)" stroke-width="3" stroke-dasharray="4 4"/>',
  (a) => `<path d="M8 40H60L52 22L94 50L52 78L60 60H8L16 50Z" fill="${a}"/>`,
  (a) => `<circle cx="50" cy="50" r="44" fill="${a}"/><path d="M45 92V60L24 34L18 40L16 18L38 20L32 26L50 48L68 26L62 20L84 18L82 40L76 34L55 60V92Z" fill="var(--dm-paper)"/>`,
  () => '<circle cx="34" cy="50" r="30" fill="var(--dm-red)"/><circle cx="66" cy="50" r="30" fill="var(--dm-green)"/><path d="M16 44H62V32L84 50L62 68V56H16Z" fill="var(--dm-ink)"/>',
  (a) => `<path d="M76 24A37 37 0 1 0 87 50" fill="none" stroke="${a}" stroke-width="14"/><path d="M74 54L87 34L100 54Z" fill="var(--dm-ink)"/>`,
  (a, b) => `<circle cx="24" cy="50" r="16" fill="${a}"/><circle cx="76" cy="50" r="16" fill="${b}"/><path d="M42 50H60" stroke="var(--dm-ink)" stroke-width="3" stroke-dasharray="3 4"/><path d="M58 42L66 50L58 58Z" fill="var(--dm-ink)"/>`
];
const DISCS = ['var(--dm-red)', 'var(--dm-green)'];
const pick = (n: number) => Math.floor(Math.random() * n);

function tileMarkup(): string {
  const a = pick(2);
  return SHAPES[pick(SHAPES.length)](DISCS[a], DISCS[1 - a]);
}

export type ShapeBoard = { el: HTMLElement; nudge(): void };

/** A 4×3 board of cover shapes, in Problem Solver's place. Tiles drop in, then one swaps every couple of seconds. */
export function createShapeBoard(): ShapeBoard {
  const wrap = el('div', 'ps-loom dm-loom');
  wrap.setAttribute('aria-hidden', 'true');
  const board = svg('0 0 400 300', '');
  const tiles: SVGGElement[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const cell = document.createElementNS(SVG_NS, 'g');
      cell.setAttribute('transform', `translate(${col * 100} ${row * 100})`);
      cell.innerHTML = `<rect x="4" y="4" width="92" height="92" rx="${(row + col) % 3 === 0 ? 46 : 18}" class="ps-loom__cell"/><g class="ps-loom__tile"></g>`;
      board.append(cell);
      tiles.push(cell.lastElementChild as SVGGElement);
    }
  }
  wrap.append(board);
  const paint = (tile: SVGGElement, delay = 0) => {
    tile.innerHTML = tileMarkup();
    tile.style.animationDelay = `${delay}ms`;
    tile.classList.remove('is-leaving', 'is-entering');
    void tile.getBoundingClientRect();
    tile.classList.add('is-entering');
  };
  tiles.forEach((tile, i) => paint(tile, i * 110));
  const swap = () => {
    const tile = tiles[pick(tiles.length)];
    tile.style.animationDelay = '0ms';
    tile.classList.remove('is-entering');
    tile.classList.add('is-leaving');
    setTimeout(() => paint(tile), 300);
  };
  let last = 0;
  if (!reducedMotion()) {
    const timer = setInterval(() => {
      if (!wrap.isConnected) {
        clearInterval(timer);
        return;
      }
      if (!document.hidden) swap();
    }, 1700);
  }
  return {
    el: wrap,
    nudge() {
      const now = Date.now();
      if (reducedMotion() || now - last < 260) return;
      last = now;
      swap();
    }
  };
}

/* ── Decision medal ─────────────────────────────────────────────────── */

/**
 * The cover, built as the session moves: the red disc fills with the decision, the green disc
 * with the compass answer, the dotted line and both arrows arrive with what is known, and the
 * main model's emblem sits in the middle once there is one.
 */
export function decisionMedal(frame: number, model: string | null): SVGSVGElement {
  const ghost = 'var(--dm-ghost)';
  const red = frame >= 1 ? 'var(--dm-red)' : ghost;
  const green = frame >= 2 ? 'var(--dm-green)' : ghost;
  const known = frame >= 3;
  const marks = known
    ? '<path class="dm-medal__piece" d="M36 37H27L19 50L27 63H36V57H29L25 50L29 43H36Z" fill="var(--dm-ink)"/><path class="dm-medal__piece" d="M62 46H76L73 40L88 50L73 60L76 54H62L65 50Z" fill="var(--dm-ink)"/>'
    : '';
  const line = `<path d="M50 4V96" stroke="${known ? 'var(--dm-ink)' : ghost}" stroke-width="1.6" stroke-dasharray="3 3"/>`;
  const emblem = model ? MODEL_SVG[model] : null;
  const core = emblem
    ? `<circle cx="50" cy="50" r="21" fill="var(--ps-card)"/><g class="dm-medal__piece dm-medal__model">${emblem.replace('<svg ', '<svg x="33" y="33" width="34" height="34" ')}</g>`
    : '';
  return svg('0 0 100 100', `<circle class="dm-medal__piece" cx="27" cy="50" r="23" fill="${red}"/><circle class="dm-medal__piece" cx="73" cy="50" r="23" fill="${green}"/>${line}${marks}${core}`, 'dm-medal');
}

/* ── Track ──────────────────────────────────────────────────────────── */

const STATIONS: Array<{ name: string; mark: string }> = [
  { name: 'Frame', mark: PAIR },
  { name: 'Explore', mark: RING },
  { name: 'Decide', mark: FORWARD_DISC },
  { name: 'Review', mark: BACK_DISC }
];

/** "21 Jan" for a YYYY-MM-DD date. */
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/** Where the session is (0 Frame … 3 Review, 4 finished) and each station's state and note. */
export function trackStations(session: PsSession): { at: number; stations: Array<{ name: string; state: 'done' | 'now' | 'waiting' | 'future'; note: string }> } {
  const order = ['frame', 'explore', 'decide', 'review'];
  const at = session.phase === 'finished' ? 4 : Math.max(0, order.indexOf(session.phase));
  const active = (step: string) => {
    const runs = session.steps?.[step]?.runs ?? [];
    return runs.find((run) => run.status === 'active') ?? runs.filter((run) => run.status !== 'switched').at(-1) ?? null;
  };
  const explored = (session.steps?.explore?.runs ?? []).filter((run) => run.status !== 'switched' && run.nodes.length).length;
  const waiting = session.reviewState?.status === 'waiting';
  const due = session.reviewState?.due ?? session.reviewProposal?.due ?? null;
  const notes = [
    at === 0 ? `Question ${Math.min(Object.keys(session.frame ?? {}).length + 1, 3)} of 3` : 'Done',
    at === 1 ? (active('explore') ? plainName(active('explore')!.tool) : 'Pick a model') : explored ? `${explored} ${explored === 1 ? 'model' : 'models'}` : '',
    at === 2 ? ((active('decide')?.tool as string | undefined) === RECORD_ID ? 'The record' : 'Settle it') : at > 2 ? 'Settled' : '',
    waiting && due ? `Due ${shortDate(due)}` : at === 3 ? 'Reviewing' : session.reviewState?.status === 'done' ? 'Done' : due ? `Due ${shortDate(due)}` : ''
  ];
  const stations = STATIONS.map((station, i) => {
    const state = i === 3 && waiting ? 'waiting' : i === at ? 'now' : i < at ? 'done' : 'future';
    return { name: station.name, state: state as 'done' | 'now' | 'waiting' | 'future', note: notes[i] };
  });
  return { at, stations };
}

export type TrackView = { el: HTMLElement; update(session: PsSession): void };

/** Round stations for Frame, Explore, Decide and Review, joined by a dotted line. */
export function createTrack(): TrackView {
  const nav = el('nav', 'ps-track dm-track');
  nav.setAttribute('aria-label', 'Process');
  const list = el('ol', 'ps-track__line dm-track__line');
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
        const item = el('li', 'ps-track__stn dm-track__stn');
        item.dataset.state = station.state;
        if (station.state === 'now') item.setAttribute('aria-current', 'step');
        const mark = el('span', 'ps-track__mark dm-track__mark');
        mark.append(svg('0 0 100 100', STATIONS[i].mark));
        item.append(mark, el('span', 'ps-track__name', station.name), el('small', 'dm-track__note', station.note));
        return item;
      }));
    }
  };
}

/* ── Section compass ────────────────────────────────────────────────── */

/** One line per lit quadrant: what it means for this decision. */
const COMPASS_LINES: Record<string, string> = {
  self_understand: 'The decision is about you, and you want to see what you really want.',
  self_improve: 'The decision is about you, and you want to change how you act.',
  others_understand: 'The decision involves other people, and you want to see how they think.',
  others_improve: 'The decision involves other people, and you want to help them change.'
};

/** The section key each compass quadrant draws its emblem from. */
const sectionOf = (quadrant: string) => SECTIONS.find((s) => s.compass === quadrant)?.key ?? '';

export type CompassView = { el: HTMLElement; update(session: PsSession): void };

/**
 * The four section emblems in a 2×2 above the canvas: rows are who (you, others), columns the
 * aim (understand, improve). The lit quadrant is ringed and the rest fade; hidden until the
 * compass question is answered.
 */
export function createCompass(): CompassView {
  const box = el('section', 'dm-compass');
  box.setAttribute('aria-label', 'Section compass');
  box.hidden = true;
  const grid = el('div', 'dm-compass__grid');
  const cells = new Map<string, HTMLElement>();
  for (const who of ['self', 'others']) {
    for (const aim of ['understand', 'improve']) {
      const quadrant = COMPASS.find((q) => q.who === who && q.aim === aim)!;
      const cell = el('span', 'dm-compass__q');
      cell.title = quadrant.label;
      cell.append(sectionEmblem(sectionOf(quadrant.id)));
      cells.set(quadrant.id, cell);
      grid.append(cell);
    }
  }
  const text = el('p', 'dm-compass__text');
  box.append(grid, text);
  let key = '';
  return {
    el: box,
    update(session) {
      const lit: string[] = parseCompass(session.frame?.compass ?? '');
      const next = lit.join('+');
      if (next === key) return;
      key = next;
      box.hidden = !lit.length;
      for (const [id, cell] of cells) cell.dataset.lit = String(lit.includes(id));
      text.replaceChildren(...lit.flatMap((id, i) => {
        const quadrant = COMPASS.find((q) => q.id === id)!;
        return [...(i ? [document.createTextNode(' ')] : []), el('b', '', `${quadrant.label}.`), document.createTextNode(` ${COMPASS_LINES[id]}`)];
      }));
      box.setAttribute('aria-label', `Section compass: ${lit.map((id) => COMPASS.find((q) => q.id === id)!.label).join(' and ')}`);
    }
  };
}

/* ── Coach ──────────────────────────────────────────────────────────── */

/** The red and green discs overlapping, with an arrow through them. */
export function dmAvatar(): HTMLSpanElement {
  const span = el('span', 'ps-avatar dm-avatar');
  span.append(svg('0 0 100 100', '<circle cx="32" cy="58" r="28" fill="var(--dm-red)"/><circle cx="68" cy="42" r="28" fill="var(--dm-green)"/><path d="M30 52H64V42L86 56L64 70V60H30Z" fill="var(--dm-ink)"/>'));
  return span;
}

/** The decision record's mark: the forward disc. */
function recordMark(): HTMLSpanElement {
  const span = el('span', 'dm-emblem');
  span.setAttribute('aria-hidden', 'true');
  span.append(svg('0 0 100 100', FORWARD_DISC));
  return span;
}

/** How the shared coach panel looks in Decision Maker. */
export const DM_LOOK: CoachLook = {
  avatar: dmAvatar,
  emblem: (tool) => (tool === RECORD_ID ? recordMark() : modelEmblem(tool)),
  frames: {
    decision: {
      keys: ['decision', 'compass', 'known'],
      prompts: ['What are you deciding?', 'Who is it about, and what do you want?', 'What do you already know?']
    }
  },
  noun: 'Decision'
};
