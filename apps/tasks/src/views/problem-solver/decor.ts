// apps/tasks/src/views/problem-solver/decor.ts
/**
 * The book's flat geometry for Problem Solver surfaces: the shape board on the start page,
 * frame medals, the process track, the coach avatar and the thinking dots.
 * Every string here is static markup; user text is always set with textContent elsewhere.
 */
import { el } from '@/views/hub-kit';
import { stepName, stepPlan } from '../../../../../packages/problem-solver/steps.mjs';
import { EMBLEM_SVG } from '../../../../../packages/problem-solver/glyphs';
import type { PsSession, PsToolId } from '../../../../../packages/problem-solver/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLOURS = ['var(--ps-red)', 'var(--ps-yellow)', 'var(--ps-blue)'];

/** The three framing pieces, drawn from the Gap analysis emblem (blue top, yellow band, red bottom). */
export const FRAME_PIECES = {
  top: 'M2.38 44A48 48 0 0 1 97.62 44Z',
  mid: 'M2.38 44H97.62A48 48 0 0 1 97.62 56H2.38A48 48 0 0 1 2.38 44Z',
  bot: 'M2.38 56A48 48 0 0 0 97.62 56Z'
} as const;

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function svg(viewBox: string, markup: string, className?: string): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  node.innerHTML = markup;
  return node;
}

/* ── Start page shape board ─────────────────────────────────────────── */

const TILES: Array<(a: string, b: string) => string> = [
  (a) => `<path fill="${a}" d="M2 50A48 48 0 0 1 98 50Z"/>`,
  (a) => `<circle cx="50" cy="50" r="46" fill="${a}"/>`,
  (a) => `<path fill="${a}" d="M2 2H98A96 96 0 0 1 2 98Z"/>`,
  (a) => `<path fill="${a}" d="M50 8L94 92H6Z"/>`,
  (a) => `<path fill="${a}" d="M24 14L50 32L76 14V28L50 46L24 28ZM24 46L50 64L76 46V60L50 78L24 60Z"/>`,
  (a) => `<path fill="${a}" d="M4 38H96V62H4Z"/><circle cx="50" cy="50" r="10" fill="var(--paper)"/>`,
  (a) => `<circle cx="50" cy="50" r="46" fill="${a}"/><circle cx="50" cy="50" r="20" fill="var(--paper)"/>`,
  (a, b) => `<path fill="${a}" d="M2 50A48 48 0 0 1 98 50Z"/><path fill="${b}" d="M2 50A48 48 0 0 0 98 50Z"/>`,
  (a, b) => `<circle cx="50" cy="50" r="46" fill="${a}"/><circle cx="50" cy="38" r="13" fill="${b}"/>`
];

const pick = (n: number) => Math.floor(Math.random() * n);

function tileMarkup(): string {
  const a = pick(3);
  const b = (a + 1 + pick(2)) % 3;
  return `<g transform="rotate(${pick(4) * 90} 50 50)">${TILES[pick(TILES.length)](COLOURS[a], COLOURS[b])}</g>`;
}

export type ShapeBoard = { el: HTMLElement; nudge(): void };

/** A 4×3 board of book shapes. Tiles drop in, then one swaps every couple of seconds until the board leaves the page. */
export function createShapeBoard(): ShapeBoard {
  const wrap = el('div', 'ps-loom');
  wrap.setAttribute('aria-hidden', 'true');
  const board = svg('0 0 400 300', '');
  const tiles: SVGGElement[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const cell = document.createElementNS(SVG_NS, 'g');
      cell.setAttribute('transform', `translate(${col * 100} ${row * 100})`);
      cell.innerHTML = `<rect x="4" y="4" width="92" height="92" rx="${(row + col) % 3 === 0 ? 46 : 14}" class="ps-loom__cell"/><g class="ps-loom__tile"></g>`;
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

/* ── Frame medal ────────────────────────────────────────────────────── */

/** Small badge for a problem: frame pieces filled by answers, the tool's emblem in the centre. */
export function problemMedal(frame: number, tool: PsToolId | null): SVGSVGElement {
  const piece = (cls: string, d: string, filled: boolean, colour: string) =>
    `<path class="ps-medal__piece ${cls}" fill="${filled ? colour : 'var(--ps-ghost)'}" d="${d}"/>`;
  const core = tool
    ? `<circle cx="50" cy="50" r="24" fill="var(--ps-card)"/><g class="ps-medal__piece ps-medal__tool" transform="translate(30 30) scale(.4)">${EMBLEM_SVG[tool] ?? ''}</g>`
    : '<circle class="ps-medal__piece ps-medal__tool" cx="50" cy="50" r="9" fill="var(--ps-card)" stroke="var(--ps-ghost)" stroke-width="2" stroke-dasharray="3 3"/>';
  return svg(
    '0 0 100 100',
    piece('ps-medal__top', FRAME_PIECES.top, frame >= 1, 'var(--ps-blue)') +
      piece('ps-medal__mid', FRAME_PIECES.mid, frame >= 2, 'var(--ps-yellow)') +
      piece('ps-medal__bot', FRAME_PIECES.bot, frame >= 3, 'var(--ps-red)') +
      core,
    'ps-medal'
  );
}

/* ── Process track ──────────────────────────────────────────────────── */

const STATION_MARKS = [
  '<circle cx="50" cy="50" r="48" fill="var(--c)"/><circle cx="50" cy="50" r="20" fill="var(--ps-card)"/>',
  '<path fill="var(--c)" d="M50 4L96 92H4Z"/>',
  '<circle cx="50" cy="50" r="48" fill="var(--c)"/><circle cx="32" cy="50" r="14" fill="var(--ps-card)"/><circle cx="68" cy="50" r="14" fill="var(--ps-card)"/>',
  '<path fill="var(--c)" d="M6 6H94V94H6Z"/>',
  '<path fill="var(--c)" d="M50 2A48 48 0 0 0 50 98Z"/><path fill="var(--c)" opacity=".5" d="M50 2A48 48 0 0 1 50 98Z"/>',
  '<path fill="var(--c)" d="M6 6H70L94 30V94H6Z"/>'
];
const FRAME_MARK = `<path fill="var(--ps-blue)" d="${FRAME_PIECES.top}"/><path fill="var(--ps-yellow)" d="${FRAME_PIECES.mid}"/><path fill="var(--ps-red)" d="${FRAME_PIECES.bot}"/>`;

export type TrackView = { el: HTMLElement; update(session: PsSession): void };

/** Frame, then the session's process model steps, as stations on one line. */
export function createTrack(): TrackView {
  const nav = el('nav', 'ps-track');
  nav.setAttribute('aria-label', 'Process');
  const list = el('ol', 'ps-track__line');
  nav.append(list);
  let key = '';
  return {
    el: nav,
    update(session) {
      const modelId = session.model?.id ?? 'seven_step';
      const plan = stepPlan(modelId);
      const names = ['Frame', ...plan.map((s: { step: string }) => stepName(modelId, s.step))];
      const index = plan.findIndex((s: { step: string }) => s.step === session.phase);
      const now = session.phase === 'frame' ? 0 : index >= 0 ? index + 1 : -1;
      const stateOf = (i: number): 'now' | 'done' | 'skipped' | 'future' => {
        if (i === now) return 'now';
        if (i === 0) return session.phase === 'frame' ? 'now' : 'done';
        const st = session.steps?.[plan[i - 1].step]?.status;
        if (session.phase === 'finished' || (now > 0 && i < now)) return st === 'skipped' ? 'skipped' : 'done';
        return 'future';
      };
      const toolOf = (i: number): PsToolId | null => {
        const runs = session.steps?.[plan[i - 1]?.step]?.runs ?? [];
        return runs.find((run) => run.status === 'active')?.tool ?? runs.filter((run) => run.status !== 'switched').at(-1)?.tool ?? null;
      };
      const states = names.map((_, i) => stateOf(i));
      const tools = names.map((_, i) => (i === 0 ? null : toolOf(i)));
      const next = `${modelId}|${session.phase}|${states.join(',')}|${tools.join(',')}`;
      if (next === key) return;
      key = next;
      const reach = now >= 0 ? now : names.length - 1;
      list.style.setProperty('--ps-track-p', String(Math.max(0, reach) / Math.max(1, names.length - 1)));
      list.replaceChildren(
        ...names.map((name, i) => {
          const state = states[i];
          const item = el('li', 'ps-track__stn');
          item.dataset.state = state;
          if (state === 'now') item.setAttribute('aria-current', 'step');
          const colour = state === 'future' || state === 'skipped' ? 'var(--ps-ghost)' : COLOURS[(i + 2) % 3];
          const tool = tools[i];
          const markup = i === 0 ? FRAME_MARK : tool && state !== 'future' ? EMBLEM_SVG[tool] ?? '' : STATION_MARKS[(i - 1) % STATION_MARKS.length];
          const mark = el('span', 'ps-track__mark');
          const drawing = svg('0 0 100 100', markup);
          drawing.style.setProperty('--c', colour);
          mark.append(drawing);
          item.append(mark, el('span', 'ps-track__name', name));
          return item;
        })
      );
    }
  };
}

/* ── Coach avatar and thinking dots ─────────────────────────────────── */

export function coachAvatar(): HTMLSpanElement {
  const span = el('span', 'ps-avatar');
  span.append(svg('0 0 100 100', '<circle cx="34" cy="62" r="30" fill="var(--ps-blue)"/><path d="M62 10L96 70H28Z" fill="var(--ps-yellow)"/><circle cx="72" cy="74" r="18" fill="var(--ps-red)"/>'));
  return span;
}

export function thinkingDots(): HTMLSpanElement {
  const dots = el('span', 'ps-dots');
  dots.setAttribute('aria-hidden', 'true');
  dots.append(el('i'), el('i'), el('i'));
  return dots;
}

/** An inline svg from static markup, for section art on the start page. */
export function art(markup: string, className?: string): SVGSVGElement {
  return svg('0 0 100 100', markup, className);
}
