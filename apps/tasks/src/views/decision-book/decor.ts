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

const INK = 'var(--dm-ink)';
const PAPER = 'var(--dm-paper)';

/**
 * The board's twenty-one shapes, all in the cover's language: discs, halves, ink arrows, dotted
 * lines and paper cut-outs. Each draws in a 100×100 cell from two colours, so any shape can
 * come up red-led or green-led.
 */
const SHAPES: Array<(a: string, b: string) => string> = [
  () => BACK_DISC,
  () => FORWARD_DISC,
  () => '<path d="M50 6A44 44 0 0 0 50 94Z" fill="var(--dm-red)"/><path d="M50 6A44 44 0 0 1 50 94Z" fill="var(--dm-green)"/><path d="M50 6V94" stroke="var(--dm-ink)" stroke-width="3" stroke-dasharray="4 4.4"/>',
  (a) => `<path d="M8 40H60L52 22L94 50L52 78L60 60H8L16 50Z" fill="${a}"/>`,
  (a) => `<circle cx="50" cy="50" r="44" fill="${a}"/><path d="M45 92V60L24 34L18 40L16 18L38 20L32 26L50 48L68 26L62 20L84 18L82 40L76 34L55 60V92Z" fill="${PAPER}"/>`,
  () => `<circle cx="34" cy="50" r="30" fill="var(--dm-red)"/><circle cx="66" cy="50" r="30" fill="var(--dm-green)"/><path d="M16 44H62V32L84 50L62 68V56H16Z" fill="${INK}"/>`,
  (a) => `<path d="M76 24A37 37 0 1 0 87 50" fill="none" stroke="${a}" stroke-width="14"/><path d="M74 54L87 34L100 54Z" fill="${INK}"/>`,
  (a, b) => `<circle cx="24" cy="50" r="16" fill="${a}"/><circle cx="76" cy="50" r="16" fill="${b}"/><path d="M42 50H60" stroke="${INK}" stroke-width="3" stroke-dasharray="3 4"/><path d="M58 42L66 50L58 58Z" fill="${INK}"/>`,
  // A quarter of the other colour, with a rising arrow.
  (a, b) => `<circle cx="50" cy="50" r="44" fill="${b}"/><path d="M6 50A44 44 0 0 0 50 94V50Z" fill="${a}"/><path d="M30 64L56 38H44V28H72V56H62V44L36 70Z" fill="${INK}"/>`,
  // Two halves held apart by an ink diamond.
  (a, b) => `<path d="M45 8A42 42 0 0 0 45 92Z" fill="${a}"/><path d="M55 8A42 42 0 0 1 55 92Z" fill="${b}"/><path d="M30 50L50 30 70 50 50 70Z" fill="${INK}"/>`,
  // A target: ring, paper gap, bullseye.
  (a, b) => `<circle cx="50" cy="50" r="44" fill="${a}"/><circle cx="50" cy="50" r="27" fill="${PAPER}"/><circle cx="50" cy="50" r="13" fill="${b}"/>`,
  // A big disc and a small one, overlapping.
  (a, b) => `<circle cx="40" cy="60" r="34" fill="${a}"/><circle cx="68" cy="36" r="24" fill="${b}"/>`,
  // The Stop Rule's bar.
  (a) => `<circle cx="50" cy="50" r="44" fill="${a}"/><rect x="24" y="42" width="52" height="16" fill="${PAPER}"/>`,
  // A tick on green, a cross on red.
  () => `<circle cx="50" cy="50" r="44" fill="var(--dm-green)"/><path d="M27 51L43 67L74 36" fill="none" stroke="${INK}" stroke-width="11"/>`,
  () => `<circle cx="50" cy="50" r="44" fill="var(--dm-red)"/><path d="M33 33L67 67M67 33L33 67" fill="none" stroke="${PAPER}" stroke-width="11"/>`,
  // A balance: beam, pivot and a weight either side.
  (a, b) => `<path d="M50 30L64 86H36Z" fill="${INK}"/><path d="M10 30H90" stroke="${INK}" stroke-width="6"/><circle cx="22" cy="47" r="14" fill="${a}"/><circle cx="78" cy="47" r="14" fill="${b}"/>`,
  // A 2×2 matrix with one quadrant still open.
  (a, b) => `<rect x="10" y="10" width="38" height="38" fill="${a}"/><rect x="52" y="10" width="38" height="38" fill="${b}"/><rect x="10" y="52" width="38" height="38" fill="${INK}"/><rect x="54" y="54" width="34" height="34" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="4 4"/>`,
  // Pareto bars: a fifth, then four fifths.
  (a, b) => `<rect x="10" y="22" width="80" height="22" rx="11" fill="${PAPER}"/><rect x="10" y="22" width="26" height="22" rx="11" fill="${a}"/><rect x="10" y="56" width="80" height="22" rx="11" fill="${PAPER}"/><rect x="10" y="56" width="66" height="22" rx="11" fill="${b}"/>`,
  // Two arrows passing each other.
  (a, b) => `<path d="M12 28H62V16L84 34L62 52V40H12Z" fill="${a}"/><path d="M88 72H38V84L16 66L38 48V60H88Z" fill="${b}"/>`,
  // The expectations curve: an arc, its peak and a dotted line.
  (a, b) => `<path d="M12 86Q50 -10 88 86" fill="none" stroke="${INK}" stroke-width="8"/><circle cx="50" cy="38" r="11" fill="${b}"/><path d="M72 14V92" stroke="${a}" stroke-width="4" stroke-dasharray="5 5"/>`,
  // Steps, with a disc at the top.
  (a, b) => `<path d="M10 88H36V66H60V44H86V88Z" fill="${a}"/><circle cx="73" cy="27" r="12" fill="${b}"/>`
];
const DISCS = ['var(--dm-red)', 'var(--dm-green)'];
const pick = (n: number) => Math.floor(Math.random() * n);

/** Shapes that read wrong turned on their side or upside down: the tick, the cross, the balance, the curve. */
const UPRIGHT = new Set([13, 14, 15, 19]);

/** What a tile shows: which shape, which colour leads, and how far it has been turned. */
type Face = { shape: number; lead: number; turn: number };

/** A face whose shape is not already on the board, so twelve tiles show twelve different shapes. */
const freshFace = (faces: Face[]): Face => {
  const showing = new Set(faces.map((f) => f.shape));
  const free = SHAPES.map((_, i) => i).filter((i) => !showing.has(i));
  return { shape: free[pick(free.length)], lead: pick(2), turn: 0 };
};

/** The cell-sized empty rect keeps every tile's box, and so its turning centre, on the cell. */
const faceMarkup = (face: Face): string =>
  `<rect width="100" height="100" fill="none"/><g transform="rotate(${face.turn} 50 50)">${SHAPES[face.shape](DISCS[face.lead], DISCS[1 - face.lead])}</g>`;

export type ShapeBoard = { el: HTMLElement; nudge(): void };

const COLS = 4;
const ROWS = 3;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.5, 0, 0.75, 0)';

/**
 * A 4×3 board of cover shapes, in Problem Solver's place. Tiles drop in, then every couple of
 * seconds the board makes one move: a tile pops, flips over, turns a quarter, drops out, or
 * swaps its colours; two neighbours trade places; or a row or column slides along one cell.
 */
export function createShapeBoard(): ShapeBoard {
  const wrap = el('div', 'ps-loom dm-loom');
  wrap.setAttribute('aria-hidden', 'true');
  const board = svg('0 0 400 300', '');
  const tiles: SVGGElement[] = [];
  const faces: Face[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElementNS(SVG_NS, 'g');
      cell.setAttribute('transform', `translate(${col * 100} ${row * 100})`);
      cell.innerHTML = `<rect x="4" y="4" width="92" height="92" rx="${(row + col) % 3 === 0 ? 46 : 18}" class="ps-loom__cell"/><g class="dm-loom__tile"></g>`;
      board.append(cell);
      tiles.push(cell.lastElementChild as SVGGElement);
      faces.push(freshFace(faces));
    }
  }
  wrap.append(board);
  const draw = (i: number) => { tiles[i].innerHTML = faceMarkup(faces[i]); };
  const motion = !reducedMotion() && typeof tiles[0].animate === 'function';
  const play = (i: number, frames: Keyframe[], ms: number, easing = EASE, delay = 0) =>
    motion ? tiles[i].animate(frames, { duration: ms, easing, delay, fill: 'backwards' }).finished.catch(() => undefined) : Promise.resolve(undefined);

  const at = (row: number, col: number) => row * COLS + col;
  const POP_IN: Keyframe[] = [{ transform: 'scale(0) rotate(-120deg)' }, { transform: 'none' }];
  const pop = async (i: number) => {
    await play(i, [{ transform: 'none' }, { transform: 'scale(0) rotate(90deg)' }], 300);
    faces[i] = freshFace(faces);
    draw(i);
    await play(i, POP_IN, 720, SPRING);
  };
  /** Turns over like a card; the back is a new shape, or the same one with its colours swapped. */
  const flip = async (i: number) => {
    const vertical = Math.random() < 0.5;
    const axis = vertical ? 'scaleY' : 'scaleX';
    await play(i, [{ transform: 'none' }, { transform: `${axis}(0)` }], 220, EASE_IN);
    faces[i] = Math.random() < 0.35 ? { ...faces[i], lead: 1 - faces[i].lead } : freshFace(faces);
    draw(i);
    await play(i, [{ transform: `${axis}(0)` }, { transform: 'none' }], 420, SPRING);
  };
  /** A quarter or half turn that stays turned. */
  const turn = async (i: number) => {
    if (UPRIGHT.has(faces[i].shape)) return flip(i);
    const by = [90, -90, 180][pick(3)];
    await play(i, [{ transform: 'none' }, { transform: `rotate(${by}deg)` }], by === 180 ? 760 : 560, SPRING);
    faces[i] = { ...faces[i], turn: (faces[i].turn + by + 360) % 360 };
    draw(i);
  };
  /** Falls out of the bottom of its cell; the next shape drops in from above. */
  const drop = async (i: number) => {
    await play(i, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(40px) scale(0.6)', opacity: 0 }], 280, EASE_IN);
    faces[i] = freshFace(faces);
    draw(i);
    await play(i, [{ transform: 'translateY(-50px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 620, SPRING);
  };
  /** Two neighbours trade places, one passing over the other. */
  const swap = async (i: number) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const across = Math.random() < 0.5 ? col < COLS - 1 : row === ROWS - 1;
    const j = across ? (col < COLS - 1 ? i + 1 : i - 1) : (row < ROWS - 1 ? i + COLS : i - COLS);
    const dx = ((j % COLS) - col) * 100;
    const dy = (Math.floor(j / COLS) - row) * 100;
    tiles[i].parentElement!.parentElement!.append(tiles[i].parentElement!);
    await Promise.all([
      play(i, [{ transform: 'none' }, { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(1.15)` }, { transform: `translate(${dx}px, ${dy}px)` }], 640, EASE),
      play(j, [{ transform: 'none' }, { transform: `translate(${-dx / 2}px, ${-dy / 2}px) scale(0.8)` }, { transform: `translate(${-dx}px, ${-dy}px)` }], 640, EASE)
    ]);
    [faces[i], faces[j]] = [faces[j], faces[i]];
    draw(i);
    draw(j);
  };
  /** A row or column slides one cell: the end tile leaves, a new one arrives at the other end. */
  const shift = async () => {
    const byRow = Math.random() < 0.6;
    const r = pick(ROWS);
    const c = pick(COLS);
    const line = byRow ? Array.from({ length: COLS }, (_, k) => at(r, k)) : Array.from({ length: ROWS }, (_, k) => at(k, c));
    const forwards = Math.random() < 0.5;
    const order = forwards ? line : [...line].reverse();
    const d = forwards ? -100 : 100;
    const move = byRow ? `translateX(${d}px)` : `translateY(${d}px)`;
    await Promise.all(order.map((t, k) =>
      play(t, k === 0 ? [{ transform: 'none' }, { transform: `${move} scale(0)` }] : [{ transform: 'none' }, { transform: move }], 560, EASE)
    ));
    for (let k = 0; k < order.length - 1; k += 1) faces[order[k]] = faces[order[k + 1]];
    const end = order[order.length - 1];
    faces[end] = freshFace(faces);
    order.forEach(draw);
    await play(end, POP_IN, 620, SPRING);
  };

  const MOVES: Array<{ weight: number; run: (i: number) => Promise<void> }> = [
    { weight: 3, run: pop },
    { weight: 3, run: flip },
    { weight: 2, run: turn },
    { weight: 2, run: drop },
    { weight: 2, run: swap },
    { weight: 2, run: () => shift() }
  ];
  const total = MOVES.reduce((sum, m) => sum + m.weight, 0);
  let busy = false;
  let lastMove = -1;
  const move = (i = pick(tiles.length)) => {
    if (busy) return;
    let roll = pick(total);
    let m = MOVES.findIndex((entry) => (roll -= entry.weight) < 0);
    if (m === lastMove) m = (m + 1) % MOVES.length;
    lastMove = m;
    busy = true;
    MOVES[m].run(i).finally(() => { busy = false; });
  };

  tiles.forEach((tile, i) => {
    draw(i);
    void play(i, POP_IN, 720, SPRING, i * 110);
  });
  let last = 0;
  if (motion) {
    const timer = setInterval(() => {
      if (!wrap.isConnected) {
        clearInterval(timer);
        return;
      }
      if (!document.hidden) move();
    }, 1900);
  }
  return {
    el: wrap,
    nudge() {
      const now = Date.now();
      if (!motion || now - last < 260) return;
      last = now;
      move();
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
  noun: 'Decision',
  escalate: { title: 'This needs a full decision', accept: 'Go deeper' }
};
