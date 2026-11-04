import { el } from '@/quiz/dom';
import type { LiveQuiz } from '@/quiz/live-stage';

/**
 * The fun of a live round: the shapes that fly in as answers land, the countdown
 * both screens share, and the one big button that moves the round on. Each
 * student gets a shape for the round, so they can spot theirs landing on the
 * board. Nobody else can tell whose is whose: the teacher still sees how the
 * class went, not who.
 */

const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star'] as const;
const COLOURS = 8;
const TIMES = [0, 20, 30, 45, 60, 90];
const LOW_SECONDS = 10;
/** Answers arrive with each poll: spread a batch out so they don't land as one lump. */
const BATCH_SPREAD_MS = 1600;
/** Only a real change moves the clock, so a slow reply can't make it jitter. */
const RESYNC_MS = 1500;

/** The shape and colour a round's badge stands for. Same on the student's screen and the board. */
export function shapeOf(id: string): { shape: (typeof SHAPES)[number]; colour: number } {
  const n = parseInt(id.slice(0, 8), 16) || 0;
  return { shape: SHAPES[n % SHAPES.length]!, colour: (n >>> 8) % COLOURS };
}

export function shapeEl(id: string, className = ''): HTMLElement {
  const { shape, colour } = shapeOf(id);
  const node = el('span', `qz-shape ${className}`.trim());
  node.dataset.shape = shape;
  node.dataset.colour = String(colour);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

const calm = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const fraction = (n: number) => n - Math.floor(n);

function seedOf(text: string): number {
  let h = 7;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return h / 1000;
}

/** An even scatter that never rearranges as more land. */
function restingPlace(i: number, seed: number): { left: number; top: number } {
  return { left: 5 + 90 * fraction(seed + (i + 1) * 0.7548776662), top: 14 + 72 * fraction(seed * 3 + (i + 1) * 0.5698402910) };
}

export type LiveSwarm = {
  root: HTMLElement;
  update(l: LiveQuiz): void;
};

export function createLiveSwarm(): LiveSwarm {
  const root = el('div', 'qz-swarm');
  root.setAttribute('aria-hidden', 'true');
  let round = '';
  let seed = 0;
  let painted = false;
  const landed = new Map<string, HTMLElement>();

  function fly(node: HTMLElement, order: number, spread: number): void {
    if (calm() || typeof node.animate !== 'function') return;
    const rest = node.getBoundingClientRect();
    const [vw, vh] = [window.innerWidth, window.innerHeight];
    // Any edge of the screen, kept inside it so the page never grows a scrollbar.
    const side = Math.floor(Math.random() * 4);
    const along = Math.random();
    const from = side === 0 ? { x: along * vw, y: 0 } : side === 1 ? { x: vw - rest.width, y: along * vh } : side === 2 ? { x: along * vw, y: vh - rest.height } : { x: 0, y: along * vh };
    // A zoomed board scales the flight too, so work in the shape's own size.
    const zoom = rest.width / (node.offsetWidth || rest.width) || 1;
    const dx = (from.x - rest.left) / zoom;
    const dy = (from.y - rest.top) / zoom;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360);
    node.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(0.7)`, opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: 'translate(0, 0) rotate(0deg) scale(1.35)', opacity: 1, offset: 0.82 },
        { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 }
      ],
      { duration: 1000 + Math.random() * 500, delay: order * spread, easing: 'cubic-bezier(0.35, 0.1, 0.3, 1)', fill: 'backwards' }
    );
  }

  return {
    root,
    update(l) {
      const key = `${l.session}:${l.index}`;
      if (key !== round) {
        round = key;
        seed = seedOf(key);
        landed.clear();
        root.replaceChildren();
      }
      const shapes = l.shapes ?? [];
      const arriving: HTMLElement[] = [];
      for (const shape of shapes) {
        let node = landed.get(shape.id);
        if (!node) {
          node = shapeEl(shape.id, 'qz-swarm__shape');
          const place = restingPlace(landed.size, seed);
          node.style.left = `${place.left}%`;
          node.style.top = `${place.top}%`;
          landed.set(shape.id, node);
          root.append(node);
          arriving.push(node);
        }
        if (shape.right === undefined) delete node.dataset.result;
        else node.dataset.result = shape.right ? 'right' : 'wrong';
      }
      // A screen that opens mid-question shows who's already in, without a replay.
      const flies = painted;
      painted = true;
      if (!flies || !arriving.length) return;
      const spread = Math.min(BATCH_SPREAD_MS / arriving.length, 220);
      // The stage goes on the page straight after this call: measure once it's there.
      queueMicrotask(() => arriving.forEach((node, i) => fly(node, i, spread)));
    }
  };
}

export type LiveClock = {
  root: HTMLElement;
  /** Milliseconds left, or null when no clock is running. */
  set(endsIn: number | null | undefined, stopped?: string): void;
};

export function createLiveClock(): LiveClock {
  const root = el('div', 'qz-clock');
  root.setAttribute('role', 'timer');
  root.hidden = true;
  const time = el('span', 'qz-clock__time');
  const bar = el('span', 'qz-clock__bar');
  const fill = el('span', 'qz-clock__fill');
  bar.append(fill);
  root.append(time, bar);
  let deadline: number | null = null;
  let total = 0;
  let tick = 0;

  function draw(): void {
    if (deadline === null) return;
    const left = Math.max(0, deadline - Date.now());
    const seconds = Math.ceil(left / 1000);
    time.textContent = left > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Time’s up';
    fill.style.width = `${total ? (left / total) * 100 : 0}%`;
    root.dataset.state = left <= 0 ? 'up' : seconds <= LOW_SECONDS ? 'low' : 'running';
    if (left <= 0) stop();
  }

  function stop(): void {
    window.clearInterval(tick);
    tick = 0;
  }

  return {
    root,
    set(endsIn, stopped) {
      if (stopped) {
        stop();
        deadline = null;
        root.hidden = false;
        root.dataset.state = 'done';
        time.textContent = stopped;
        fill.style.width = '0%';
        return;
      }
      if (endsIn === null || endsIn === undefined) {
        stop();
        deadline = null;
        total = 0;
        root.hidden = true;
        return;
      }
      const next = Date.now() + endsIn;
      if (deadline === null || Math.abs(next - deadline) > RESYNC_MS) {
        // More time on the clock fills the bar back up.
        if (deadline === null || next > deadline) total = endsIn;
        deadline = next;
      }
      root.hidden = false;
      draw();
      if (deadline > Date.now() && !tick) tick = window.setInterval(draw, 250);
    }
  };
}

/** Puts the round's time on the clock. Once everyone has answered there's nothing left to count down. */
export function setLiveClock(clock: LiveClock, l: LiveQuiz | null): void {
  if (l?.phase !== 'question') clock.set(null);
  else if (everyoneIn(l) && l.ends_in !== null && l.ends_in !== undefined) clock.set(null, 'All in');
  else clock.set(l.ends_in);
}

/** What the big button does next, in words. */
export function liveMoveLabel(l: LiveQuiz): string {
  if (l.phase === 'lobby') return 'Start first question';
  if (l.phase === 'question') return 'Reveal answer';
  return l.index + 1 >= l.total ? 'Finish quiz' : 'Next question';
}

export type LiveMoves = {
  move(): void;
  back(): void;
  end(): void;
  /** Send a live action with its own fields. */
  act(action: string, fields?: Record<string, unknown>): void;
};

export const everyoneIn = (l: LiveQuiz) => l.phase === 'question' && l.joined > 0 && (l.answered ?? 0) >= l.joined;

function plainButton(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** The big move-on button, the question timer's choices, and the smaller ways out. */
export function liveControls(l: LiveQuiz, moves: LiveMoves): HTMLElement {
  const wrap = el('div', 'qz-live-moves');
  const move = plainButton(liveMoveLabel(l), 'btn btn--primary qz-live-moves__go', () => {
    // A double tap must not skip a question. Back on soon after, in case the press changed nothing.
    move.disabled = true;
    window.setTimeout(() => (move.disabled = false), 1500);
    moves.move();
  });
  // Ready to go: everyone's answered, or the clock ran out.
  if (everyoneIn(l) || (l.phase === 'question' && l.ends_in === 0)) move.dataset.ready = 'true';
  if (l.phase === 'lobby') {
    const times = el('div', 'qz-live-times');
    times.setAttribute('role', 'group');
    times.setAttribute('aria-label', 'Time for each question');
    times.append(el('span', 'qz-live-times__label', 'Time per question'));
    for (const seconds of TIMES) {
      const chip = plainButton(seconds ? `${seconds}s` : 'No timer', 'qz-live-times__chip', () => moves.act('live_time', { seconds }));
      chip.setAttribute('aria-pressed', String(l.seconds === seconds));
      times.append(chip);
    }
    wrap.append(times);
  }
  wrap.append(move);
  const small = el('div', 'qz-live-moves__small');
  if (l.phase === 'question' && !everyoneIn(l) && l.ends_in !== null && l.ends_in !== undefined) small.append(plainButton('+15 seconds', 'btn btn--ghost', () => moves.act('live_extra')));
  if (l.phase === 'reveal' && l.index > 0) small.append(plainButton('Back', 'btn btn--ghost', () => moves.back()));
  small.append(plainButton('End quiz', 'btn btn--ghost', () => moves.end()));
  wrap.append(small);
  return wrap;
}

/** A live round with its data, minus the clock: the clock moves every poll, so it must not repaint the screen. */
export function liveSignature(l: LiveQuiz | null): string {
  if (!l) return 'null';
  const { ends_in, ...rest } = l;
  return JSON.stringify([rest, ends_in === 0, ends_in === null || ends_in === undefined]);
}
