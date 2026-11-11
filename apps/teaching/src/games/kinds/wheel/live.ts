import { el } from '@/quiz/dom';
import { mountQuestionPlayer } from '@/quiz/player';
import type { PublicQuestion, QuestionKey, QuizResponse } from '@/quiz/core';
import type { PublicItem } from '../../core/schema';
import type { RoomView } from '../../core/room-protocol';
import { registerLiveKind, type KindView, type KindViewApi } from '../../live/kind-views';
import { avatar, createRing, type Ring } from '../../live/board-parts';
import { ordinal } from '../../live/format';
import { animate, countUp, flip } from '../../motion/motion';
import { ALPHABET, VOWELS, WHEEL, WHEEL_SEGMENTS, type LettersNeeded, type Segment } from './shared';
import type { Stage, WheelHeat, WheelQuestionView, WheelView } from './rules';
import './wheel.css';

/**
 * Wheel of Fortune, live screens (spec §6.4; approved mockup
 * docs/mockups/games/wheel.html).
 *
 * Board: the wheel (SVG in token colours) spins by angular velocity with
 * friction to the segment the ROOM chose, the pointer clicking on each peg
 * (the click rate follows the speed); the puzzle board turns letters over one
 * at a time; Bankrupt and Lose a turn stamp; questions and the solved card
 * slide in over the wheel; the solve and the reveal sweep light across the
 * board. Team cards along the bottom. Calm: the wheel jumps to the result
 * with a single highlight, letters show without flips.
 *
 * Phone: the puzzle so far; the captain's hold-and-release Spin and the
 * letter keyboard (unused consonants, vowels for 250); the letter question
 * for the spinning team; Solve privately at any time (locked 20 s after a
 * wrong guess); the explain question; letters needed after each quote.
 */

const SA = 360 / WHEEL_SEGMENTS.length;
const R = 300;
const DT = 1 / 120;
const FC = 55;
const FK = 0.6;
const KEY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const SEG_COLOURS = ['var(--game-team-1)', 'var(--game-gold)', 'var(--game-team-2)', 'var(--depth, #0a1536)', 'var(--game-team-3)', 'var(--game-team-4)', 'var(--game-team-1)', 'var(--game-team-2)', 'var(--warm-white, #fbf8f1)', 'var(--game-gold)', 'var(--game-team-3)', 'var(--game-team-4)', 'var(--game-gold)', 'var(--game-team-1)', 'var(--game-team-2)', 'var(--game-team-3)'];
const SOLVING: ReadonlySet<Stage> = new Set(['turn', 'spinning', 'landed', 'question', 'qclosed', 'letter', 'revealing', 'solved']);

export const teamName = (t: number) => `Team ${t + 1}`;
export const teamColour = (t: number) => `var(--game-team-${(Math.max(0, t) % 4) + 1})`;
const fmt = (n: number) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('en-AU');
const segLabel = (v: Segment) => (v === 'bankrupt' ? 'BANKRUPT' : v === 'lose' ? 'LOSE A TURN' : String(v));
const kv = (v: RoomView): WheelView | null => (v.kind_view && typeof v.kind_view === 'object' && 'stage' in (v.kind_view as object) ? (v.kind_view as WheelView) : null);
const endsAt = (v: RoomView, w: WheelView) => v.ends_at ?? w.ends_at;

/* ── Wheel physics (pure, exported for tests) ────────────────────── */

/** Degrees turned from angular speed `w` (deg/s) until friction stops it. */
export function travel(w: number): number {
  let d = 0;
  while (w > 3) {
    d += w * DT;
    w -= (FC + FK * w) * DT;
  }
  return d;
}
/** The segment under the pointer at rotation `theta`. */
export const segmentAt = (theta: number): number => Math.floor(((((-theta) % 360) + 360) % 360) / SA) % WHEEL_SEGMENTS.length;
/**
 * The angular speed that lands on `target` from `theta`, near the natural
 * speed for `power` (0–1), at least two full turns. `jitter` (−1..1) places the
 * pointer within the segment so landings don't all look the same.
 */
export function omegaFor(theta: number, target: number, power: number, jitter = 0): number {
  const want = target * SA + SA / 2 + jitter * SA * 0.32;
  const base = (((-want - theta) % 360) + 360) % 360;
  const natural = 700 + Math.max(0, Math.min(1, power)) * 800;
  let d = base + 360 * Math.round((travel(natural) - base) / 360);
  if (d < 720) d += 360;
  let lo = 60;
  let hi = 2600;
  for (let i = 0; i < 44; i++) {
    const m = (lo + hi) / 2;
    if (travel(m) < d) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
/** Seconds the physics runs for speed `w`. */
export function spinSeconds(w: number): number {
  let t = 0;
  while (w > 3) {
    w -= (FC + FK * w) * DT;
    t += DT;
  }
  return t;
}

/** Wraps the board form into rows of at most `width` characters, by word. */
export function puzzleRows(board: string, width = 14): string[] {
  const rows: string[] = [];
  let row = '';
  for (let word of board.split(' ')) {
    while (word.length > width) {
      if (row) rows.push(row);
      rows.push(word.slice(0, width));
      word = word.slice(width);
      row = '';
    }
    if (!row) row = word;
    else if (row.length + 1 + word.length <= width) row += ` ${word}`;
    else {
      rows.push(row);
      row = word;
    }
  }
  if (row) rows.push(row);
  return rows;
}

const isLetter = (ch: string) => ch.length === 1 && ch >= 'A' && ch <= 'Z';
const isHidden = (ch: string) => ch === '_';

/* ── Question helpers ────────────────────────────────────────────── */

type Opt = { id: string; text: string };
function optionsOf(item: PublicItem): Opt[] | null {
  if (item.shape !== 'question') return null;
  const q = item.question as unknown as PublicQuestion;
  if (q.kind === 'multiple_choice' || q.kind === 'odd_one_out' || q.kind === 'quote_technique') return q.options.map((o) => ({ id: o.id, text: o.text }));
  if (q.kind === 'true_false') return [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }];
  return null;
}
function promptOf(item: PublicItem): string {
  if (item.shape === 'question') {
    const q = item.question as unknown as PublicQuestion;
    return q.kind === 'quote_technique' && q.quote ? `${q.prompt} “${q.quote}”` : q.prompt;
  }
  if (item.shape === 'term') return item.clues[0]?.text ?? 'Name the term.';
  return item.shape === 'quote' ? item.text : '';
}
function rightIds(key: QuestionKey | undefined): string[] {
  if (!key) return [];
  if (key.answer.type === 'choice') return key.answer.ids;
  if (key.answer.type === 'boolean') return [String(key.answer.value)];
  return [];
}
function answerText(item: PublicItem, result: WheelQuestionView['result']): string {
  if (!result) return '';
  if (result.term) return result.term;
  const key = result.key;
  if (!key) return '';
  if (key.answer.type === 'text') return key.answer.accepted[0] ?? '';
  const opts = optionsOf(item);
  return (opts ?? []).filter((o) => rightIds(key).includes(o.id)).map((o) => o.text).join(', ');
}
function responseFor(item: PublicItem, pick: string): unknown {
  if (item.shape === 'question' && (item.question as { kind?: string }).kind === 'true_false') return { value: pick === 'true' };
  return { selected: [pick] };
}

/* ── Board ───────────────────────────────────────────────────────── */

function wheelSvg(): string {
  const pt = (a: number, r: number) => [(r * Math.sin((a * Math.PI) / 180)).toFixed(1), (-r * Math.cos((a * Math.PI) / 180)).toFixed(1)];
  const segs = WHEEL_SEGMENTS.map((v, i) => {
    const a0 = i * SA;
    const [x0, y0] = pt(a0, R);
    const [x1, y1] = pt(a0 + SA, R);
    const ink = v === 'bankrupt' ? '#fff' : 'var(--depth, #0a1536)';
    const fs = typeof v === 'number' ? 40 : 22;
    return `<path d="M0 0 L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z" fill="${SEG_COLOURS[i]}" stroke="rgba(10,21,54,.35)" stroke-width="2"/><text transform="rotate(${a0 + SA / 2}) translate(0 ${-R * 0.6}) rotate(-90)" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" letter-spacing="${typeof v === 'number' ? -1 : 1}" fill="${ink}">${segLabel(v)}</text>`;
  }).join('');
  const pegs = WHEEL_SEGMENTS.map((_, i) => {
    const [x, y] = pt(i * SA, R - 10);
    return `<circle cx="${x}" cy="${y}" r="7" fill="#fff" stroke="rgba(10,21,54,.4)" stroke-width="2"/>`;
  }).join('');
  return `<svg viewBox="-330 -340 660 670" role="img" aria-label="Prize wheel"><circle r="${R + 16}" fill="var(--depth, #0a1536)" stroke="var(--game-gold)" stroke-width="8"/><g class="wf-rot">${segs}${pegs}<g class="wf-hlg"></g></g><circle r="58" fill="var(--depth, #0a1536)" stroke="var(--game-gold)" stroke-width="7"/><circle r="20" fill="var(--game-gold)"/><g class="wf-ptr"><path d="M-26 ${-R - 34} L26 ${-R - 34} L0 ${-R + 22} Z" fill="var(--game-gold)" stroke="var(--depth, #0a1536)" stroke-width="4" stroke-linejoin="round"/></g></svg>`;
}

function mountBoard(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'wf-b');
  host.append(root);
  const left = el('div', 'wf-b__left');
  const wheelBox = el('div', 'wf-wheel');
  wheelBox.innerHTML = wheelSvg();
  const stampEl = el('div', 'wf-stamp');
  wheelBox.append(stampEl);
  const panel = el('div', 'wf-panel');
  panel.hidden = true;
  left.append(wheelBox, panel);
  const right = el('div', 'wf-b__right');
  const frame = el('div', 'wf-frame');
  const grid = el('div', 'wf-grid');
  const sweepEl = el('div', 'wf-sweep');
  frame.append(grid, sweepEl);
  const cat = el('div', 'wf-cat');
  const catText = el('span');
  cat.append(catText);
  const used = el('div', 'wf-used');
  used.setAttribute('aria-label', 'Letters called');
  const status = el('p', 'wf-status');
  status.setAttribute('role', 'status');
  const slog = el('p', 'wf-slog');
  right.append(frame, cat, used, status, slog);
  const teams = el('div', 'wf-teams');
  root.append(left, right, teams);

  const rot = wheelBox.querySelector<SVGGElement>('.wf-rot')!;
  const ptr = wheelBox.querySelector<SVGGElement>('.wf-ptr')!;
  const hlg = wheelBox.querySelector<SVGGElement>('.wf-hlg')!;
  const ring: Ring = createRing('wf-ring');

  let theta = 0;
  let spinN = 0;
  let raf = 0;
  let gen = 0;
  let puzzleKey = '';
  let cells: Array<{ node: HTMLElement; idx: number }> = [];
  let shownBoard = '';
  let stampFor = 0;
  let lastStage: Stage | null = null;
  let panelKey = '';
  let flipping = 0;
  let disposed = false;
  let insight = false;
  let totalsShown = -1;
  const prevBank: Record<number, number> = {};
  let current: WheelView | null = null;
  let room: RoomView | null = null;

  const setRot = () => rot.setAttribute('transform', `rotate(${theta.toFixed(3)})`);
  const highlight = (idx: number) => {
    const p = (a: number) => `${(R * Math.sin((a * Math.PI) / 180)).toFixed(1)} ${(-R * Math.cos((a * Math.PI) / 180)).toFixed(1)}`;
    hlg.innerHTML = `<path class="wf-hl" d="M0 0 L${p(idx * SA)} A${R} ${R} 0 0 1 ${p(idx * SA + SA)} Z" fill="#fff" opacity="0"/>`;
  };
  /** Puts segment `idx` under the pointer (calm, reconnects). */
  const settle = (idx: number, jitter = 0) => {
    theta = -(idx * SA + SA / 2 + jitter * SA * 0.32);
    setRot();
  };

  function runSpin(target: number, power: number, jitter: number, onDone: () => void): void {
    const mine = ++gen;
    hlg.innerHTML = '';
    if (api.calm() || typeof requestAnimationFrame !== 'function') {
      settle(target, jitter);
      onDone();
      return;
    }
    let w = omegaFor(theta, target, power, jitter);
    let last = performance.now();
    let acc = 0;
    let peg = Math.floor(theta / SA);
    let lastClick = 0;
    api.sfx.whoosh();
    const frame = (t: number) => {
      raf = 0;
      if (mine !== gen || disposed) return;
      acc += Math.min(0.05, (t - last) / 1000);
      last = t;
      while (acc >= DT && w > 3) {
        theta += w * DT;
        w -= (FC + FK * w) * DT;
        acc -= DT;
      }
      setRot();
      const p = Math.floor(theta / SA);
      if (p !== peg) {
        peg = p;
        // The pointer clicks on each peg: the rate follows the speed.
        if (t - lastClick > 28) {
          api.sfx.click();
          lastClick = t;
        }
        animate(ptr, [{ transform: 'rotate(0)' }, { transform: `rotate(${Math.min(28, 10 + w / 60)}deg)` }, { transform: 'rotate(0)' }], { duration: Math.max(70, Math.min(240, 16000 / Math.max(1, w))), easing: 'ease-out', calmFade: false });
      }
      if (w > 3) raf = requestAnimationFrame(frame);
      else {
        if (segmentAt(theta) !== target) settle(target, jitter);
        onDone();
      }
    };
    raf = requestAnimationFrame(frame);
  }

  function stamp(text: string): void {
    stampEl.textContent = text;
    animate(
      stampEl,
      [
        { opacity: 0, transform: 'translate(-50%,-50%) rotate(-8deg) scale(2.2)' },
        { opacity: 1, transform: 'translate(-50%,-50%) rotate(-8deg) scale(1)', offset: 0.18 },
        { opacity: 1, transform: 'translate(-50%,-50%) rotate(-8deg) scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'translate(-50%,-50%) rotate(-8deg) scale(0.9)' }
      ],
      { duration: 2000 }
    );
    if (api.calm()) {
      stampEl.style.opacity = '1';
      setTimeout(() => (stampEl.style.opacity = '0'), 1600);
    }
  }
  function sweep(): void {
    if (api.calm()) return;
    animate(sweepEl, [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 1, transform: `translateX(${Math.max(600, frame.clientWidth * 1.5)}px)` }], { duration: 1100, easing: 'cubic-bezier(.5,0,.3,1)', calmFade: false });
  }

  /* Puzzle grid */
  function buildGrid(board: string, intro: boolean): void {
    const rows = puzzleRows(board);
    const start = rows.length <= 2 ? 1 : 0;
    grid.replaceChildren();
    cells = [];
    // Index of each row's first character in the board string.
    let at = 0;
    const offsets: number[] = [];
    for (const r of rows) {
      const idx = board.indexOf(r, at);
      offsets.push(idx);
      at = idx + r.length;
    }
    for (let r = 0; r < 4; r++) {
      const row = rows[r - start] ?? '';
      const off = Math.floor((14 - row.length) / 2);
      for (let c = 0; c < 14; c++) {
        const ch = row[c - off];
        const cell = el('div', 'wf-cell');
        if (!ch || ch === ' ') cell.classList.add('is-e');
        else {
          const idx = (offsets[r - start] ?? 0) + (c - off);
          const inner = el('div', 'wf-cell__in');
          const f = el('span', 'wf-cell__f');
          const b = el('span', 'wf-cell__b', isHidden(ch) ? '' : ch);
          inner.append(f, b);
          cell.append(inner);
          if (!isHidden(ch)) cell.classList.add('is-on');
          if (!isLetter(ch) && !isHidden(ch)) cell.classList.add('is-p');
          cells.push({ node: cell, idx });
        }
        grid.append(cell);
      }
    }
    grid.setAttribute('aria-label', `Puzzle: ${board.replace(/_/g, ' blank ')}`);
    shownBoard = board;
    if (intro) {
      [...grid.children].forEach((n, k) =>
        animate(n, [{ opacity: 0, transform: 'translateY(-1em) rotateX(70deg)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 200 + (k % 14) * 30 + Math.floor(k / 14) * 90, fill: 'backwards' })
      );
      animate(wheelBox, [{ opacity: 0, transform: 'rotate(-120deg) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 1100 });
      api.sfx.whoosh();
    }
  }
  /** Turns over the letters newly showing: one at a time with a ding, or all at once (reveal, calm). */
  function flipNew(board: string, fast: boolean): void {
    const fresh = cells.filter((c) => isHidden(shownBoard[c.idx] ?? '') && !isHidden(board[c.idx] ?? '_'));
    shownBoard = board;
    const mine = ++flipping;
    fresh.forEach((c, k) => {
      const b = c.node.querySelector('.wf-cell__b');
      if (b) b.textContent = board[c.idx] ?? '';
      if (api.calm()) {
        c.node.classList.add('is-on');
        return;
      }
      const delay = fast ? k * 45 : k * WHEEL.flipEachMs;
      setTimeout(() => {
        if (disposed || mine !== flipping) return void c.node.classList.add('is-on');
        if (fast) return void c.node.classList.add('is-on');
        c.node.classList.add('is-lit');
        api.sfx.ding();
        setTimeout(() => {
          c.node.classList.add('is-on');
          c.node.classList.remove('is-lit');
        }, 300);
      }, delay);
    });
    grid.setAttribute('aria-label', `Puzzle: ${board.replace(/_/g, ' blank ')}`);
  }

  function paintUsed(w: WheelView): void {
    used.replaceChildren(
      ...[...ALPHABET].map((L) => {
        const s = el('span', '', L);
        if (VOWELS.includes(L)) s.classList.add('is-v');
        if (w.used.includes(L)) s.classList.add(w.hits.includes(L) ? 'is-hit' : 'is-miss');
        return s;
      })
    );
  }

  function paintTeams(w: WheelView): void {
    teams.style.setProperty('--wf-n', String(Math.max(1, w.teams.length)));
    const playing = SOLVING.has(w.stage) && w.stage !== 'solved';
    teams.replaceChildren(
      ...w.teams.map((t) => {
        const card = el('div', `wf-team${playing && t.team === w.turn_team ? ' is-turn' : ''}`);
        card.style.setProperty('--tc', teamColour(t.team));
        card.dataset.team = String(t.team);
        const cap = el('span', 'wf-team__cap');
        if (t.captain) cap.append(avatar(t.captain), 'captain');
        card.append(el('span', 'wf-team__nm', teamName(t.team)), el('span', 'wf-team__rd', fmt(t.round)), cap, el('span', 'wf-team__bk', `Bank ${fmt(t.bank)}`));
        return card;
      })
    );
  }

  function statusFor(w: WheelView): string {
    const t = `<b>${teamName(w.turn_team)}</b>`;
    switch (w.stage) {
      case 'turn':
        return `${t} to spin · captain <b>${w.captain ?? '—'}</b>`;
      case 'spinning':
        return `${t} are spinning…`;
      case 'landed':
        if (w.landed?.segment === 'bankrupt') return `${t} lose ${fmt(w.landed.lost ?? 0)} round points`;
        if (w.landed?.segment === 'lose') return `${t} lose their turn`;
        return `<b>${w.value}</b> a letter · ${teamName(w.turn_team)} answer to earn it`;
      case 'question':
        return `${t} answer on their phones`;
      case 'qclosed': {
        const r = w.q?.result;
        return r?.ok ? `<b>${r.r} of ${r.n}</b> right · ${teamName(w.turn_team)} earn a letter` : `Only <b>${r?.r ?? 0} of ${r?.n ?? 0}</b> right · no letter this time`;
      }
      case 'letter':
        return `${t} earned it · captain <b>${w.captain ?? '—'}</b> is calling a letter`;
      case 'revealing': {
        const l = w.last;
        if (!l) return '';
        if (!l.count) return `${l.vowel ? 'Bought' : 'Called'} <b>${l.letter}</b> · not in this line`;
        return l.vowel ? `Bought <b>${l.letter}</b> · ${l.count} on the board` : `<b>${l.letter}</b> × ${l.count} · ${teamName(w.turn_team)} +${fmt(l.won)}`;
      }
      case 'solved':
        return 'The line stays hidden until the reveal';
      case 'revealed':
      case 'explain':
      case 'ex_closed':
      case 'ex_revealed':
        return w.line ? `“${escapeHtml(w.line)}” · ${escapeHtml(w.category)}` : '';
      default:
        return '';
    }
  }

  /* Panel over the wheel */
  function showPanel(content: HTMLElement[], cls = ''): void {
    const wasHidden = panel.hidden;
    panel.className = `wf-panel${cls ? ` ${cls}` : ''}`;
    panel.hidden = false;
    panel.replaceChildren(...content);
    root.classList.add('is-dim');
    if (wasHidden) animate(panel, [{ opacity: 0, transform: 'translateX(-1.4em) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 520 });
  }
  function hidePanel(): void {
    panel.hidden = true;
    panel.replaceChildren();
    root.classList.remove('is-dim');
    ring.stop();
    panelKey = '';
  }

  function questionPanel(w: WheelView, q: WheelQuestionView): void {
    const revealedNow = !!q.result;
    const key = `${w.stage}:${q.item.id}:${q.closed}:${revealedNow}`;
    const tc = q.team !== undefined ? teamColour(q.team) : 'var(--game-gold)';
    const eb = el('span', 'wf-eb');
    eb.style.setProperty('--tc', tc);
    eb.append(el('i'), q.kind === 'letter' ? `Earn the letter · ${teamName(q.team ?? 0)} answer` : 'Explain · everyone answers');
    const opts = optionsOf(q.item);
    const right = rightIds(q.result?.key);
    const body: HTMLElement[] = [eb, ring.root, el('p', 'wf-q', promptOf(q.item))];
    if (q.item.shape === 'term') body.push(el('p', 'wf-clue', `${q.item.lengths.join(', ')} letters · type it on your phone`));
    if (opts) {
      const list = el('div', 'wf-opts');
      opts.forEach((o, k) => {
        const row = el('div', 'wf-opt');
        if (q.result) row.classList.add(right.includes(o.id) ? 'is-right' : 'is-wrong');
        row.append(el('span', `wf-key wf-key--${k % 4}`, KEY_LETTERS[k] ?? ''), el('span', 'wf-opt__t', o.text), el('span', 'wf-opt__n', String(q.result?.counts[o.id] ?? 0)));
        list.append(row);
      });
      body.push(list);
    } else if (q.result) {
      body.push(el('p', 'wf-answer', answerText(q.item, q.result)));
    } else body.push(el('p', 'wf-clue', 'Answer on your phone.'));
    if (w.split && q.kind === 'explain') {
      const split = el('div', 'wf-split');
      const line = (label: string, s: { n: number; right: number }) => {
        const d = el('div');
        const bar = el('span', 'wf-bar');
        const fill = el('i');
        const share = s.n ? s.right / s.n : 0;
        fill.style.transform = `scaleX(${share})`;
        bar.append(fill);
        d.append(el('span', '', label), bar, el('b', '', s.n ? `${Math.round(share * 100)}%` : '–'));
        animate(fill, [{ transform: 'scaleX(0)' }, { transform: `scaleX(${share})` }], { duration: 900 });
        return d;
      };
      split.append(line('Solved, under half showing', w.split.early), line('Needed more, or not solved', w.split.late));
      body.push(split);
    } else {
      const dots = el('div', 'wf-dots');
      dots.style.setProperty('--tc', tc);
      for (const on of q.dots) dots.append(el('i', on ? 'is-on' : ''));
      dots.append(q.kind === 'letter' && !q.closed ? el('span', '', `Half right earns a ${w.value ?? ''} letter`) : el('b', '', `${q.answered} of ${q.asked}`));
      body.push(dots);
    }
    const cls = ['wf-panel--q', q.closed ? 'is-closed' : '', q.result ? 'is-result' : ''].filter(Boolean).join(' ');
    if (key === panelKey) {
      // Same question: refresh the dots and counts only.
      panel.className = `wf-panel ${cls}`;
      panel.replaceChildren(...body);
    } else {
      panelKey = key;
      showPanel(body, cls);
      if (!q.closed) panel.querySelectorAll('.wf-opt').forEach((n, k) => animate(n, [{ opacity: 0, transform: 'translateY(.7em)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 80 * k, fill: 'backwards' }));
    }
    const end = room ? endsAt(room, w) : undefined;
    if (!q.closed && end) ring.run(end, q.kind === 'letter' ? WHEEL.questionMs : WHEEL.explainMs, api.serverNow);
    else ring.hold(0, 0);
  }

  function solvedPanel(w: WheelView): void {
    const key = `solved:${w.p}`;
    if (key === panelKey) return;
    panelKey = key;
    const win = w.winner;
    const box = el('div', 'wf-solved');
    box.style.setProperty('--tc', teamColour(win?.team ?? 0));
    const big = el('span', 'wf-solved__big', 'Solved');
    const who = el('span', 'wf-solved__who');
    who.append(el('i'), win && win.team >= 0 ? `by a ${teamName(win.team)} player${win.initials ? ` (${win.initials})` : ''}` : 'by a player');
    const bank = el('span', 'wf-solved__bank');
    const bv = el('span', '', '0');
    bank.append('+', bv, ' banked');
    box.append(big, who, bank, el('p', '', `Round points plus ${WHEEL.solveBonus} for the solve. Everyone else has 10 s to solve it for their own record.`), ring.root);
    showPanel([box], 'wf-panel--solved');
    countUp(bv, 0, win?.bank ?? 0, 1000);
    animate(big, [{ transform: 'scale(.5)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'none' }], { duration: 700 });
    const end = room ? endsAt(room, w) : undefined;
    if (end) ring.run(end, WHEEL.solvedMs, api.serverNow);
    sweep();
    api.sfx.fanfare();
  }

  /* Totals and the teacher's letters needed */
  let totalsBox: HTMLElement | null = null;
  function showTotals(w: WheelView): void {
    left.hidden = right.hidden = teams.hidden = true;
    totalsBox?.remove();
    totalsBox = el('div', 'wf-totals');
    if (insight && w.heat) {
      totalsBox.className = 'wf-ins';
      paintInsight(totalsBox, w.heat);
      root.append(totalsBox);
      return;
    }
    totalsBox.append(el('h2', '', `Team totals · after quote ${w.p + 1} of ${w.of}`));
    const list = el('div', 'wf-totals__list');
    const before = [...w.teams].sort((a, b) => (prevBank[b.team] ?? 0) - (prevBank[a.team] ?? 0));
    const after = [...w.teams].sort((a, b) => b.bank - a.bank);
    const rows = new Map<number, HTMLElement>();
    before.forEach((t, i) => {
      const row = el('div', 'wf-trow');
      row.style.setProperty('--tc', teamColour(t.team));
      const pts = el('span', 'wf-trow__p', fmt(prevBank[t.team] ?? 0));
      row.append(el('span', 'wf-trow__r', String(i + 1)), el('span', 'wf-trow__sw'), el('span', 'wf-trow__n', teamName(t.team)), pts, el('span', 'wf-trow__m'));
      rows.set(t.team, row);
      list.append(row);
    });
    totalsBox.append(list);
    if (w.heat) {
      const b = el('button', 'wf-insight-btn', 'Teacher: letters needed');
      b.type = 'button';
      b.addEventListener('click', () => {
        insight = true;
        showTotals(w);
      });
      totalsBox.append(b);
    }
    root.append(totalsBox);
    if (totalsShown === w.p) {
      after.forEach((t, i) => {
        const row = rows.get(t.team)!;
        list.append(row);
        row.querySelector('.wf-trow__r')!.textContent = String(i + 1);
        row.querySelector('.wf-trow__p')!.textContent = fmt(t.bank);
        row.classList.toggle('is-first', i === 0);
      });
      return;
    }
    totalsShown = w.p;
    setTimeout(
      () => {
        if (disposed || !totalsBox?.isConnected) return;
        void flip(list, () => after.forEach((t) => list.append(rows.get(t.team)!)));
        after.forEach((t, i) => {
          const row = rows.get(t.team)!;
          row.classList.toggle('is-first', i === 0);
          row.querySelector('.wf-trow__r')!.textContent = String(i + 1);
          countUp(row.querySelector<HTMLElement>('.wf-trow__p')!, prevBank[t.team] ?? 0, t.bank, 900);
          if (i < before.indexOf(t)) row.querySelector('.wf-trow__m')!.textContent = '▲';
          prevBank[t.team] = t.bank;
        });
        api.sfx.whoosh();
      },
      api.calm() ? 30 : 700
    );
  }

  function paintInsight(box: HTMLElement, heat: WheelHeat): void {
    const head = el('div', 'wf-ins__head');
    head.append(el('span', 'gl-eyebrow', 'Teacher only · not for the projector'), el('h2', '', 'Letters needed to solve'), el('p', '', 'Share of the line showing at each student’s first right solve. Lower means they know the line better.'));
    const back = el('button', 'wf-insight-btn', 'Back to totals');
    back.type = 'button';
    back.addEventListener('click', () => {
      insight = false;
      if (current) showTotals(current);
    });
    head.append(back);
    box.append(head, heatStrip(heat));
    const side = el('div', 'wf-ins__side');
    const card = el('div', 'wf-ins__card');
    card.append(el('h3', '', 'Explain question by solve speed'));
    heat.explain.forEach((s, i) => {
      if (!s) return;
      card.append(el('b', '', heat.puzzles[i]?.category ?? `Quote ${i + 1}`));
      for (const [label, part, colour] of [
        ['Early', s.early, 'var(--game-right)'],
        ['Late / not', s.late, 'var(--game-gold)']
      ] as const) {
        const pair = el('div', 'wf-pair');
        const bar = el('span', 'wf-bar');
        const fill = el('i');
        const share = part.n ? part.right / part.n : 0;
        fill.style.width = `${share * 100}%`;
        fill.style.background = colour;
        bar.append(fill);
        pair.append(el('span', '', label), bar, el('b', '', part.n ? `${Math.round(share * 100)}%` : '–'));
        card.append(pair);
      }
    });
    side.append(card);
    box.append(side);
  }

  function update(v: RoomView): void {
    room = v;
    const w = kv(v);
    if (!w) return;
    current = w;
    const pk = `${w.p}:${w.puzzle}`;
    const newPuzzle = pk !== puzzleKey;
    if (w.stage !== 'totals') {
      totalsBox?.remove();
      totalsBox = null;
      insight = false;
      left.hidden = right.hidden = teams.hidden = false;
    }
    if (newPuzzle) {
      puzzleKey = pk;
      catText.textContent = w.category;
      buildGrid(w.board, lastStage !== null || w.stage === 'turn');
      for (const t of w.teams) prevBank[t.team] ??= t.bank;
    } else if (w.board !== shownBoard) flipNew(w.board, w.stage === 'revealed' || !SOLVING.has(w.stage));

    // The wheel: animate a new spin to the room's segment; otherwise sit on the last landing.
    if (w.spin && w.spin.n !== spinN) {
      const s = w.spin;
      spinN = s.n;
      const late = api.serverNow() - s.at > 600 || w.stage !== 'spinning';
      const jitter = ((s.n * 37) % 11) / 5 - 1;
      if (late) {
        gen++;
        settle(s.seg, jitter);
      } else runSpin(s.seg, s.power, jitter, () => highlight(s.seg));
    }
    if (w.stage === 'landed' && w.landed && stampFor !== w.spin?.n) {
      stampFor = w.spin?.n ?? 0;
      highlight(w.landed.seg);
      if (w.landed.segment === 'bankrupt' || w.landed.segment === 'lose') {
        stamp(w.landed.segment === 'bankrupt' ? 'Bankrupt' : 'Lose a turn');
        api.sfx.buzz();
        const card = teams.querySelector(`[data-team="${w.turn_team}"]`);
        if (card) animate(card, [{ transform: 'translateX(0)' }, { transform: 'translateX(-.3em)' }, { transform: 'translateX(.3em)' }, { transform: 'none' }], { duration: 450, calmFade: false });
      } else api.sfx.ding();
    }

    // Stage changes with sound.
    if (w.stage !== lastStage) {
      if (w.stage === 'qclosed') (w.q?.result?.ok ? api.sfx.right : api.sfx.wrong)();
      if (w.stage === 'revealing' && w.last && !w.last.count) api.sfx.buzz();
      if (w.stage === 'revealing' && w.last && !w.last.vowel && w.last.count) setTimeout(() => !disposed && api.sfx.coin(), WHEEL.flipEachMs * w.last.count);
      if (w.stage === 'revealed') {
        sweep();
        api.sfx.reveal();
      }
      if (w.stage === 'ex_closed') api.sfx.lock();
      if (w.stage === 'ex_revealed') api.sfx.reveal();
    }

    // The panel over the wheel.
    if ((w.stage === 'question' || w.stage === 'qclosed' || w.stage === 'explain' || w.stage === 'ex_closed' || w.stage === 'ex_revealed') && w.q) questionPanel(w, w.q);
    else if (w.stage === 'solved') solvedPanel(w);
    else if (!panel.hidden) hidePanel();

    if (w.stage === 'totals') showTotals(w);
    else totalsShown = -1;

    status.innerHTML = statusFor(w);
    const locked = w.solves.locked;
    slog.innerHTML = SOLVING.has(w.stage)
      ? `Private solves: <b>${w.solves.solved}</b> solved · <b>${w.solves.wrong}</b> wrong guess${w.solves.wrong === 1 ? '' : 'es'}${locked ? ` · ${locked} locked for ${w.lockout_seconds} s` : ''}`
      : `Private solves: <b>${w.solves.solved}</b> solved before the reveal`;
    paintUsed(w);
    paintTeams(w);
    lastStage = w.stage;
  }

  return {
    update,
    controls(v) {
      const w = kv(v);
      if (!w) return [];
      switch (w.stage) {
        case 'turn':
          return [
            { label: 'Reveal the line', name: 'reveal' },
            { label: 'Spin', name: 'spin', primary: true, key: ' ' }
          ];
        case 'letter':
          return [{ label: 'Skip this turn', name: 'skip' }];
        case 'question':
          return [{ label: 'Close answers', name: 'close', primary: true, key: ' ' }];
        case 'solved':
          return [{ label: 'Reveal now', name: 'reveal', primary: true, key: ' ' }];
        case 'revealed':
          return [{ label: 'Explain question', name: 'next', primary: true, key: ' ' }];
        case 'explain':
          return [{ label: 'Close answers', name: 'close', primary: true, key: ' ' }];
        case 'ex_closed':
          return [{ label: 'Reveal', name: 'reveal', primary: true, key: ' ' }];
        case 'ex_revealed':
          return [{ label: 'Team totals', name: 'totals', primary: true, key: ' ' }];
        case 'totals':
          return [{ label: w.p + 1 >= w.of ? 'Final scores' : 'Next quote', name: 'next_puzzle', primary: true, key: ' ' }];
        default:
          return [];
      }
    },
    dispose() {
      disposed = true;
      gen++;
      ring.stop();
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      root.remove();
    }
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** The letters-needed heat strip (teacher): one row per student, one cell per puzzle. Also for the Results panel. */
export function heatStrip(heat: WheelHeat): HTMLElement {
  const wrap = el('div', 'wf-heat');
  wrap.style.setProperty('--wf-p', String(Math.max(1, heat.puzzles.length)));
  const hd = el('div', 'wf-heat__row is-hd');
  hd.append(el('span'), ...heat.puzzles.map((p, i) => el('i', '', p.category || `Q${i + 1}`)));
  wrap.append(hd);
  for (const r of heat.rows) {
    const row = el('div', 'wf-heat__row');
    row.append(avatar(r.initials));
    r.cells.forEach((c) => row.append(heatCell(c)));
    wrap.append(row);
  }
  return wrap;
}
/** Green (few letters) through gold (half) to red (most), as the mockup. */
export function heatColour(pct: number): string {
  return pct < 0.5
    ? `color-mix(in srgb, var(--game-right) ${Math.round((1 - pct * 2) * 100)}%, var(--game-gold))`
    : `color-mix(in srgb, var(--game-gold) ${Math.round((1 - (pct - 0.5) * 2) * 100)}%, var(--game-wrong))`;
}
function heatCell(c: LettersNeeded | null): HTMLElement {
  if (!c) {
    const i = el('i', 'is-no', '–');
    i.title = 'Not solved';
    return i;
  }
  if (c.outlier) {
    const i = el('i', 'is-out', '0% !');
    i.title = '0 letters in under 3 s: left out of the score';
    return i;
  }
  const i = el('i', '', `${Math.round(c.pct * 100)}%`);
  i.style.background = heatColour(c.pct);
  i.title = `${c.shown} of ${c.total} letters showing`;
  return i;
}

/* ── Phone ───────────────────────────────────────────────────────── */

function mountPhone(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'wf-p');
  host.append(root);
  let room: RoomView | null = null;
  let w: WheelView | null = null;
  let screen = '';
  let solveOpen = false;
  let pick: string | null = null;
  let letter: string | null = null;
  let typed = '';
  let qItem = '';
  let response: QuizResponse | null = null;
  let seenShown = new Set<string>();
  let lastResultFor = '';
  let hold: { t0: number; p: number; b: HTMLElement } | null = null;
  let busy = false;
  let disposed = false;
  const timer = setInterval(() => {
    if (disposed || !w) return;
    // A lock running out re-enables Solve.
    const until = w.you?.locked_until ?? 0;
    const btn = root.ownerDocument.querySelector<HTMLButtonElement>('[data-wf="solve"]');
    if (btn && until) {
      const left = Math.ceil((until - api.serverNow()) / 1000);
      if (left > 0) btn.textContent = `Solve locked · ${left} s`;
      else {
        w = { ...w, you: { ...w.you!, locked_until: undefined } };
        render(true);
      }
    }
  }, 500);

  const setActions = (b: HTMLElement[]) => api.setActions?.(b);
  const button = (text: string, kind: 'primary' | 'secondary', onClick: () => void, data?: string) => {
    const b = el('button', `btn btn--${kind} gm-solo__action`, text);
    b.type = 'button';
    if (data) b.dataset.wf = data;
    b.addEventListener('click', () => {
      if (!b.disabled) onClick();
    });
    return b;
  };

  function mini(board: string, category: string): HTMLElement {
    const box = el('div', 'wf-minibox');
    const m = el('div', 'wf-mini');
    m.setAttribute('role', 'img');
    m.setAttribute('aria-label', `Puzzle so far: ${board.replace(/_/g, ' blank ')}`);
    for (const r of puzzleRows(board)) {
      const row = el('div', 'wf-mini__r');
      for (const ch of r) {
        if (ch === ' ') row.append(el('i', 'is-sp'));
        else if (isHidden(ch)) row.append(el('i'));
        else row.append(el('i', `is-on${isLetter(ch) && !seenShown.has(ch) && seenShown.size ? ' is-new' : ''}`, ch));
      }
      m.append(row);
    }
    box.append(m, el('span', '', category));
    return box;
  }

  function top(): HTMLElement {
    const t = w?.you?.team;
    const bar = el('div', 'wf-p__top');
    const team = w?.teams.find((x) => x.team === t);
    const chip = el('span', 'wf-tp');
    if (t !== undefined) {
      chip.style.setProperty('--tc', teamColour(t));
      chip.append(el('i'), `${teamName(t)} · ${fmt(team?.round ?? 0)}`);
    }
    bar.append(chip, el('span', '', w ? `Quote ${w.p + 1} of ${w.of}` : ''));
    return bar;
  }

  function wait(topLine: string, mid: string, sub = '', big = false): HTMLElement {
    const box = el('div', 'wf-wait');
    const inner = el('div');
    inner.append(el('p', 'wf-wait__top', topLine), el('div', big ? 'wf-wait__big' : 'wf-wait__mid', mid));
    if (sub) inner.append(el('p', 'wf-wait__sub', sub));
    box.append(inner);
    return box;
  }

  function lettersCard(): HTMLElement {
    const s = w?.you?.solve;
    const card = el('div', 'wf-break');
    if (!s) {
      const d = el('div');
      d.append(el('span', '', 'Your solve'), el('b', '', 'Not solved'));
      card.append(d, el('p', '', 'Next quote, try Solve as soon as you think you know it.'));
      return card;
    }
    const d = el('div');
    d.append(el('span', '', 'Letters showing when you solved'), el('b', '', `${s.shown} of ${s.total}`));
    const meter = el('div', 'wf-meter');
    const fill = el('i');
    fill.style.width = `${s.pct * 100}%`;
    meter.append(fill);
    const tot = el('div', 'is-tot');
    tot.append(el('span', '', 'Letters needed'), el('span', '', `${Math.round(s.pct * 100)}%`));
    card.append(d, meter, tot);
    return card;
  }

  function solveButton(): HTMLElement | null {
    if (!w || !SOLVING.has(w.stage)) return null;
    const mine = w.you?.solve;
    if (mine) return el('div', 'wf-mysolve', `Solved privately with ${mine.shown} of ${mine.total} letters showing`);
    const until = w.you?.locked_until ?? 0;
    const left = Math.ceil((until - api.serverNow()) / 1000);
    const b = button(left > 0 ? `Solve locked · ${left} s` : 'Solve the line', 'secondary', openSolve, 'solve');
    b.disabled = left > 0;
    return b;
  }
  const withSolve = (buttons: HTMLElement[]) => {
    const s = solveButton();
    return s ? [...buttons, s] : buttons;
  };

  async function send(fn: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    busy = true;
    try {
      await fn();
      return true;
    } catch (e) {
      api.toast(e instanceof Error ? e.message : 'That didn’t go through. Try again.', 'bad');
      return false;
    } finally {
      busy = false;
    }
  }

  function openSolve(): void {
    if (!w) return;
    solveOpen = true;
    typed = '';
    render(true);
  }

  async function submitSolve(input: HTMLInputElement): Promise<void> {
    const text = input.value.trim();
    if (!text || !w) return;
    const puzzle = w.puzzle;
    let res: { correct?: boolean; again?: true } | null = null;
    const ok = await send(async () => {
      res = await api.move({ item: puzzle, move: 'solve', response: { text } });
    });
    if (!ok || !res) return;
    const r = res as { correct?: boolean };
    if (r.correct) {
      solveOpen = false;
      api.sfx.right();
      api.toast('Solved · it counts for your record', 'good');
      render(true);
    } else {
      api.sfx.wrong();
      input.classList.add('wf-shake');
      // The room's next view carries the lock; show it now.
      w = { ...w, you: { ...w.you!, locked_until: api.serverNow() + w.lockout_seconds * 1000 } };
      setTimeout(() => {
        solveOpen = false;
        render(true);
        api.toast(`Not quite · Solve is locked for ${w?.lockout_seconds ?? 20} s`, 'bad');
      }, api.calm() ? 0 : 450);
    }
  }

  function solveScreen(): void {
    if (!w) return;
    const input = el('input', 'wf-input');
    input.type = 'text';
    input.placeholder = 'Type the whole line';
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'characters');
    input.spellcheck = false;
    input.enterKeyHint = 'go';
    input.setAttribute('aria-label', 'Your solve');
    input.value = typed;
    input.addEventListener('input', () => (typed = input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void submitSolve(input);
      }
    });
    root.replaceChildren(top(), el('p', 'wf-ph-q', 'Solve privately'), mini(w.board, w.category), input, el('p', 'wf-note', `Only you see this. A wrong guess locks Solve for ${w.lockout_seconds} s. Punctuation doesn’t matter.`));
    setActions([
      button('Submit solve', 'primary', () => void submitSolve(input)),
      button('Back to the game', 'secondary', () => {
        solveOpen = false;
        render(true);
      })
    ]);
    setTimeout(() => input.focus(), 0);
  }

  function questionScreen(q: WheelQuestionView): void {
    if (!w) return;
    if (qItem !== q.item.id) {
      qItem = q.item.id;
      pick = null;
      typed = '';
      response = null;
    }
    const label = q.kind === 'letter' ? `Earn the letter · ${w.value ?? ''} each` : 'Explain · everyone';
    const parts: HTMLElement[] = [top(), el('span', 'wf-lbl', label)];
    const opts = optionsOf(q.item);
    let ready = () => !!pick;
    let payload = (): unknown => (pick ? responseFor(q.item, pick) : null);
    if (opts) {
      parts.push(el('p', 'wf-ph-q', promptOf(q.item)));
      const list = el('div', 'wf-ph-opts');
      opts.forEach((o, k) => {
        const b = el('button', `wf-ph-opt${pick === o.id ? ' is-sel' : ''}`);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(pick === o.id));
        b.append(el('span', `wf-key wf-key--${k % 4}`, KEY_LETTERS[k] ?? ''), el('span', '', o.text));
        b.addEventListener('click', () => {
          pick = o.id;
          api.sfx.click();
          render(true);
        });
        list.append(b);
      });
      parts.push(list);
    } else if (q.item.shape === 'term' || (q.item.shape === 'question' && ['short_answer'].includes(String((q.item.question as { kind?: string }).kind)))) {
      parts.push(el('p', 'wf-ph-q', promptOf(q.item)));
      if (q.item.shape === 'term') parts.push(el('p', 'wf-note', `${q.item.lengths.join(', ')} letters`));
      const input = el('input', 'wf-input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.enterKeyHint = 'done';
      input.setAttribute('aria-label', 'Your answer');
      input.value = typed;
      input.addEventListener('input', () => {
        typed = input.value;
        lock.disabled = !typed.trim();
      });
      parts.push(input);
      ready = () => !!typed.trim();
      payload = () => ({ text: typed.trim() });
    } else if (q.item.shape === 'question') {
      const player = mountQuestionPlayer({
        question: q.item.question as unknown as PublicQuestion,
        response,
        onChange: (r) => {
          response = r;
          lock.disabled = false;
        }
      });
      parts.push(player);
      ready = () => !!response;
      payload = () => response;
    }
    const note = q.kind === 'letter' ? el('p', 'wf-note', `If half of ${teamName(q.team ?? 0)} get it, your captain calls a letter.`) : null;
    if (note) parts.push(note);
    root.replaceChildren(...parts);
    const lock = button('Lock in', 'primary', () => {
      const r = payload();
      if (!r) return;
      const item = q.item.id;
      void send(async () => {
        await api.move({ item, move: 'answer', response: r });
        api.sfx.lock();
        w = w && w.you ? { ...w, you: { ...w.you, answered: true, ...(pick ? { pick: [pick] } : {}) } } : w;
        render(true);
      });
    });
    lock.disabled = !ready();
    setActions(q.kind === 'letter' ? withSolve([lock]) : [lock]);
  }

  function letterScreen(): void {
    if (!w) return;
    const myRound = w.teams.find((t) => t.team === w!.you?.team)?.round ?? 0;
    const canVowel = myRound >= w.vowel_cost;
    const earned = w.stage === 'letter';
    const parts: HTMLElement[] = [top(), mini(w.board, w.category)];
    if (earned) {
      parts.push(el('span', 'wf-lbl', `Call a consonant · ${w.value ?? ''} each`));
      const keys = el('div', 'wf-keys');
      for (const L of ALPHABET) {
        if (VOWELS.includes(L)) continue;
        keys.append(keyButton(L));
      }
      parts.push(keys);
    }
    parts.push(el('span', 'wf-lbl', `${earned ? 'Or buy' : 'Buy'} a vowel · ${w.vowel_cost}${canVowel ? '' : ' (not enough round points)'}`));
    const vkeys = el('div', 'wf-keys wf-keys--v');
    for (const L of VOWELS) {
      const b = keyButton(L);
      if (!canVowel) b.disabled = true;
      vkeys.append(b);
    }
    parts.push(vkeys);
    return void root.replaceChildren(...parts);
  }
  function keyButton(L: string): HTMLButtonElement {
    const b = el('button', letter === L ? 'is-sel' : '', L);
    b.type = 'button';
    b.setAttribute('aria-label', `${VOWELS.includes(L) ? 'Vowel' : 'Letter'} ${L}`);
    b.setAttribute('aria-pressed', String(letter === L));
    b.disabled = !!w?.used.includes(L);
    b.addEventListener('click', () => {
      letter = L;
      api.sfx.click();
      render(true);
    });
    return b;
  }
  const callButton = () => {
    const b = button(letter ? `${VOWELS.includes(letter) ? 'Buy' : 'Call'} ${letter}` : 'Choose a letter', 'primary', () => {
      const L = letter;
      if (!L) return;
      void send(async () => {
        await api.control('letter', { letter: L });
        letter = null;
      });
    });
    b.disabled = !letter;
    return b;
  };

  function spinButton(): HTMLElement {
    const b = button('', 'primary', () => {
      // Keyboard or a plain click: a middling spin.
      if (!hold) spinWith(0.6);
    });
    b.classList.add('wf-hold');
    b.dataset.wf = 'spin';
    const pw = el('span', 'wf-hold__pw');
    b.append(pw, el('span', '', 'Hold to spin'));
    b.addEventListener('pointerdown', (e) => {
      if (b.disabled) return;
      b.setPointerCapture?.(e.pointerId);
      hold = { t0: performance.now(), p: 0, b };
      const f = (t: number) => {
        if (!hold || hold.b !== b) return;
        const k = ((t - hold.t0) / 1100) % 2;
        hold.p = k < 1 ? k : 2 - k;
        pw.style.transform = `scaleX(${hold.p})`;
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(f);
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(f);
    });
    b.addEventListener('pointerup', () => {
      if (!hold) return;
      const p = Math.max(0.15, hold.p);
      setTimeout(() => (hold = null), 0);
      spinWith(p);
    });
    b.addEventListener('pointercancel', () => {
      hold = null;
      pw.style.transform = 'scaleX(0)';
    });
    return b;
  }
  function spinWith(power: number): void {
    void send(async () => {
      await api.control('spin', { power });
      api.sfx.whoosh();
    });
  }

  function screenKey(): string {
    if (!w) return '';
    const y = w.you;
    return [w.stage, w.p, w.q?.item.id ?? '', w.q?.closed ?? '', !!w.q?.result, y?.answered ?? '', y?.captain ?? '', y?.correct ?? '', !!y?.solve, !!y?.locked_until, w.used.join(''), solveOpen, w.landed?.seg ?? '', w.value ?? ''].join('|');
  }

  function render(force = false): void {
    if (!w || disposed) return;
    const key = screenKey();
    if (!force && key === screen) {
      // Same screen: refresh the puzzle and the top line only.
      const m = root.querySelector('.wf-minibox');
      if (m) m.replaceWith(mini(w.board, w.category));
      const t = root.querySelector('.wf-p__top');
      if (t) t.replaceWith(top());
      remember();
      return;
    }
    screen = key;
    const y = w.you;
    const team = teamName(w.turn_team);
    const myTurn = y?.team === w.turn_team;
    if (solveOpen && SOLVING.has(w.stage) && !y?.solve && !((y?.locked_until ?? 0) > api.serverNow())) return void (solveScreen(), remember());
    solveOpen = false;
    const st = w.stage;
    if (st === 'turn' && y?.captain) {
      letterScreen();
      root.insertBefore(wait('Your turn', `Spin the wheel for ${team}`, 'Hold the button to build power, then let go.'), root.children[2] ?? null);
      setActions(withSolve([spinButton(), ...(letter && VOWELS.includes(letter) ? [callButton()] : [])]));
    } else if (st === 'turn' || st === 'spinning') {
      root.replaceChildren(top(), mini(w.board, w.category), wait(st === 'turn' ? `${team} are up` : 'Spinning', st === 'turn' ? `Captain ${w.captain ?? ''} is about to spin` : `${team} are spinning the wheel`, 'You can solve privately at any time.'));
      setActions(withSolve([]));
    } else if (st === 'landed') {
      const seg = w.landed?.segment;
      const mid = seg === 'bankrupt' ? 'Bankrupt' : seg === 'lose' ? 'Lose a turn' : `${w.value}`;
      root.replaceChildren(top(), mini(w.board, w.category), wait(`${team} landed on`, mid, seg === 'bankrupt' ? 'Round points gone. The bank is safe.' : seg === 'lose' ? 'Play passes on.' : 'A letter question is coming.', typeof seg === 'number'));
      setActions(withSolve([]));
    } else if (st === 'question' && w.q && myTurn && !y?.answered) {
      questionScreen(w.q);
    } else if ((st === 'question' || st === 'qclosed') && w.q) {
      const q = w.q;
      const res = q.result;
      const sub = res ? (res.ok ? `${res.r} of ${res.n} right: letter earned` : `${res.r} of ${res.n} right: no letter`) : `${q.answered} of ${q.asked} answered`;
      const mine = myTurn ? (y?.correct === true ? 'Right' : y?.correct === false ? 'Missed' : y?.answered ? 'Locked in' : 'No answer') : 'Eyes on the board';
      root.replaceChildren(top(), mini(w.board, w.category), wait(myTurn ? 'Your team’s question' : `${team} are earning a letter`, mine, sub));
      if (res && myTurn && lastResultFor !== `${w.p}:${q.item.id}`) {
        lastResultFor = `${w.p}:${q.item.id}`;
        if (y?.correct === true) api.toast('Right · nice work for your team', 'good');
        else if (y?.correct === false) api.toast(`Missed · ${answerText(q.item, res)}`, 'bad');
      }
      setActions(withSolve([]));
    } else if (st === 'letter' && y?.captain) {
      letterScreen();
      setActions(withSolve([callButton()]));
    } else if (st === 'letter' || st === 'revealing') {
      const l = w.last;
      root.replaceChildren(
        top(),
        mini(w.board, w.category),
        wait(st === 'letter' ? `${team} earned a letter` : 'On the board', st === 'letter' ? `Captain ${w.captain ?? ''} is calling it` : l ? `${l.letter} × ${l.count}` : 'Letters turning over', st === 'revealing' && l && !l.vowel && l.count ? `${team} +${fmt(l.won)}` : '')
      );
      setActions(withSolve([]));
    } else if (st === 'solved') {
      const win = w.winner;
      const mine = y?.solve;
      root.replaceChildren(
        top(),
        mini(w.board, w.category),
        wait(win && win.team >= 0 ? `Solved by a ${teamName(win.team)} player` : 'Solved', mine ? 'You got it too' : 'Still time to solve it for your record', mine ? `You needed ${mine.shown} of ${mine.total} letters.` : 'It counts for you, not for points.')
      );
      setActions(withSolve([]));
    } else if (st === 'revealed') {
      root.replaceChildren(top(), mini(w.board, w.category), wait('The line', w.line ?? '', 'An explain question is coming.'), lettersCard());
      setActions([]);
    } else if (st === 'explain' && w.q && !y?.answered) {
      questionScreen(w.q);
    } else if ((st === 'explain' || st === 'ex_closed') && w.q) {
      root.replaceChildren(top(), wait(st === 'explain' ? 'Locked in' : 'Answers closed', y?.answered ? 'Your answer is in' : 'No answer', 'Eyes on the board.'));
      setActions([]);
    } else if (st === 'ex_revealed' && w.q) {
      const ok = y?.correct === true;
      const res = w.q.result;
      root.replaceChildren(top(), wait(ok ? 'You got it' : 'Not this time', ok ? 'Right' : 'Missed', ok ? '' : `The answer: ${answerText(w.q.item, res)}`, true), lettersCard());
      const big = root.querySelector<HTMLElement>('.wf-wait__big');
      if (big) big.style.color = ok ? 'var(--success, #2e7d55)' : 'var(--danger, #c0392b)';
      if (lastResultFor !== `ex:${w.p}`) {
        lastResultFor = `ex:${w.p}`;
        api.toast(ok ? 'Right · you explained the line, not just found it' : 'Missed · worth a second look at the line', ok ? 'good' : 'bad');
      }
      setActions([]);
    } else if (st === 'totals') {
      const sorted = [...w.teams].sort((a, b) => b.bank - a.bank);
      const mineT = sorted.find((t) => t.team === y?.team);
      const place = mineT ? sorted.indexOf(mineT) + 1 : 0;
      const card = el('div', 'wf-break');
      const h = el('div');
      h.append(el('b', '', 'Letters you needed'));
      card.append(h);
      (y?.history ?? []).forEach((p, i) => {
        const d = el('div');
        d.append(el('span', '', p.category || `Quote ${i + 1}`), el('b', '', !p.played ? '–' : p.solve ? `${Math.round(p.solve.pct * 100)}%` : 'Not solved'));
        card.append(d);
      });
      root.replaceChildren(top(), place ? wait(`${teamName(y?.team ?? 0)} are`, ordinal(place), `Bank ${fmt(mineT?.bank ?? 0)}`, true) : wait('Team totals', 'Eyes on the board'), card);
      setActions([]);
    } else {
      root.replaceChildren(top(), wait('Wheel', 'Eyes on the board'));
      setActions([]);
    }
    remember();
  }
  function remember(): void {
    if (!w) return;
    seenShown = new Set([...w.board].filter(isLetter));
  }

  return {
    update(v) {
      room = v;
      const next = kv(v);
      if (!next) return;
      if (w && next.p !== w.p) {
        seenShown = new Set();
        letter = null;
      }
      if (next.stage !== 'letter' && next.stage !== 'turn') letter = null;
      w = next;
      render();
      void room;
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
      root.remove();
    }
  };
}

registerLiveKind('wheel', { board: mountBoard, phone: mountPhone });

export { mountBoard as mountWheelBoard, mountPhone as mountWheelPhone };
