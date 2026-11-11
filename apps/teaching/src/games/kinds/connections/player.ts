import { el } from '@/quiz/dom';
import type { EventResult } from '../../api';
import { animate, flip, shake } from '../../motion/motion';
import { confetti } from '../../motion/confetti';
import type { MountedPlayer, PlayerContext } from '../../solo/registry';

/**
 * Connections wall, solo (spec §6.9; approved mockup
 * docs/mockups/games/connections.html). Sixteen tiles, pick four, Submit. The
 * server marks each guess (a wall id and four tile ids) and, when it's right,
 * sends the group back (label, why, difficulty, tiles). Wrong guesses shake
 * and cost a mistake; "One away…" when three of the four belong together. Out
 * of mistakes, the groups not found are revealed one by one. Walls play in
 * sequence; each ends with a card that shows the guess history.
 */

type Tile = { id: string; text: string };
type Group = { id: string; label: string; why: string; difficulty: number; tiles: string[]; found: boolean };
type Guess = { tiles: string[]; correct: boolean };
type WallState = {
  id: string;
  title: string;
  /** Unsolved tiles in their current order. */
  order: Tile[];
  text: Map<string, string>;
  sel: string[];
  groups: Group[];
  mistakes: number;
  guesses: Guess[];
  done: null | 'solved' | 'out';
  /** Out of mistakes and the server sent no groups: the rest stay as plain tiles. */
  unrevealed: Tile[];
  shownAt: number;
};
type RevealGroup = { id: string; label: string; why: string; difficulty: number; tiles: string[] };
/** The reveal may also carry every group of a wall once the player is out of mistakes (a `pass` on the wall). */
type WallReveal = NonNullable<EventResult['reveal']> & { groups?: RevealGroup[] };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Font size for a tile, from its longest word (words never break mid-way) and its length. */
export function tileFontPx(text: string): number {
  const words = text.trim().split(/\s+/);
  const longest = Math.max(0, ...words.map((w) => w.length));
  let fs = longest > 11 ? 9.5 : longest > 9 ? 10.5 : longest > 7 ? 11.5 : 13;
  if (text.length > 22) fs = Math.min(fs, 10.5);
  return fs;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function mountConnections(host: HTMLElement, ctx: PlayerContext): MountedPlayer {
  const allowed = Math.max(1, Math.min(8, Number(ctx.game.settings.mistakes) || 4));
  const walls: WallState[] = (ctx.game.walls ?? []).map((w) => ({
    id: w.id,
    title: w.title,
    order: w.tiles.map((t) => ({ ...t })),
    text: new Map(w.tiles.map((t) => [t.id, t.text])),
    sel: [],
    groups: [],
    mistakes: 0,
    guesses: [],
    done: null,
    unrevealed: [],
    shownAt: 0
  }));
  let at = 0;
  let busy = false;
  let disposed = false;
  const buttons = new Map<string, HTMLButtonElement>();

  const root = el('div', 'cx');
  root.tabIndex = -1;
  /** Disabled buttons drop focus to the page; keep it in the game so the keys still reach it. */
  const keepFocus = () => {
    const a = document.activeElement;
    if (!a || a === document.body || !a.isConnected) root.focus({ preventScroll: true });
  };
  const head = el('p', 'cx-sub');
  const wallEl = el('div', 'cx-wall');
  wallEl.setAttribute('role', 'group');
  const left = el('div', 'cx-left');
  const endHost = el('div', 'cx-end');
  root.append(head, wallEl, left, endHost);
  host.append(root);

  const act = (text: string, cls: string, onClick: () => void) => {
    const b = el('button', `btn ${cls} cx-act`, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  const shuffleBtn = act('Shuffle', 'btn--secondary', () => doShuffle());
  const clearBtn = act('Deselect', 'btn--secondary', () => {
    const w = walls[at];
    if (!w || busy || w.done) return;
    w.sel = [];
    paintTiles();
  });
  const submitBtn = act('Submit', 'btn--primary cx-act--go', () => void submit());

  const wall = () => walls[at];
  const rowOf = (id: string) => [...wallEl.querySelectorAll<HTMLElement>('.cx-row')].find((r) => r.dataset.group === id) ?? null;

  function status(): void {
    const w = wall();
    if (!w) return;
    const found = w.groups.filter((g) => g.found).length;
    const of = walls.length > 1 ? `Wall ${at + 1} of ${walls.length} · ` : '';
    ctx.setStatus(`${of}${found} of 4 groups`);
  }

  function tileButton(t: Tile): HTMLButtonElement {
    let b = buttons.get(t.id);
    if (!b) {
      b = el('button', 'cx-tile', t.text);
      b.type = 'button';
      b.dataset.id = t.id;
      b.style.setProperty('--fs', `${tileFontPx(t.text)}px`);
      b.addEventListener('click', () => toggle(t.id));
      buttons.set(t.id, b);
    }
    return b;
  }

  function rowFor(g: Group): HTMLElement {
    const w = wall();
    const row = el('div', `cx-row cx-row--${Math.min(4, Math.max(1, g.difficulty))}${g.found ? '' : ' cx-row--missed'}`);
    row.dataset.group = g.id;
    row.append(el('b', '', g.label || 'A group'), el('span', '', g.tiles.map((id) => w.text.get(id) ?? id).join(', ')));
    if (g.why) row.append(el('em', '', g.why));
    if (!g.found) row.setAttribute('aria-label', `Not found: ${g.label}`);
    return row;
  }

  function paintTiles(): void {
    const w = wall();
    for (const t of w.order) {
      const b = tileButton(t);
      const on = w.sel.includes(t.id);
      b.classList.toggle('is-sel', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = busy || !!w.done;
    }
    paintActions();
  }

  function paintActions(): void {
    const w = wall();
    if (!w || w.done) return;
    shuffleBtn.disabled = busy;
    clearBtn.disabled = busy || w.sel.length === 0;
    submitBtn.disabled = busy || w.sel.length !== 4;
  }

  function paintLeft(): void {
    const w = wall();
    left.replaceChildren(el('span', '', 'Mistakes left'));
    for (let k = 0; k < allowed; k += 1) {
      const dot = el('i', k >= allowed - w.mistakes ? 'is-gone' : '');
      left.append(dot);
    }
    left.setAttribute('aria-label', `${allowed - w.mistakes} mistakes left`);
    left.hidden = !!w.done;
  }

  /** Lays the wall out: groups (found or revealed) on top, then the tiles still in play. */
  function layout(): void {
    const w = wall();
    const rows = w.groups.map(rowFor);
    const tiles = w.done ? [] : w.order.map(tileButton);
    const rest = w.unrevealed.map((t) => {
      const b = tileButton(t);
      b.disabled = true;
      b.classList.remove('is-sel');
      b.classList.add('is-left');
      return b;
    });
    wallEl.replaceChildren(...rows, ...tiles, ...rest);
    paintTiles();
    fitTiles();
  }

  /** Last guard against a tile's word running out of its box: shrink until it fits. */
  function fitTiles(): void {
    for (const b of wallEl.querySelectorAll<HTMLButtonElement>('.cx-tile')) {
      let fs = parseFloat(b.style.getPropertyValue('--fs')) || 13;
      let guard = 0;
      while (b.clientWidth > 0 && b.scrollWidth > b.clientWidth && fs > 8 && guard < 8) {
        fs -= 0.5;
        guard += 1;
        b.style.setProperty('--fs', `${fs}px`);
      }
    }
  }

  function startWall(): void {
    const w = wall();
    endHost.replaceChildren();
    head.textContent = walls.length > 1 && w.title ? `${w.title}: make four groups of four` : 'Make four groups of four';
    head.hidden = false;
    w.shownAt = ctx.elapsedMs();
    layout();
    paintLeft();
    status();
    ctx.setActions([shuffleBtn, clearBtn, submitBtn]);
    keepFocus();
    if (!ctx.calm()) {
      wallEl.querySelectorAll('.cx-tile').forEach((n, k) =>
        void animate(n, [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: k * 18, fill: 'backwards' })
      );
    }
  }

  function toggle(id: string): void {
    const w = wall();
    if (!w || busy || w.done) return;
    if (w.sel.includes(id)) w.sel = w.sel.filter((x) => x !== id);
    else if (w.sel.length < 4) w.sel.push(id);
    else return;
    ctx.sfx.click();
    paintTiles();
  }

  function doShuffle(): void {
    const w = wall();
    if (!w || busy || w.done) return;
    ctx.sfx.whoosh();
    void flip(wallEl, () => {
      w.order = shuffle(w.order);
      layout();
    }, { duration: 420 });
  }

  async function lift(ids: string[]): Promise<void> {
    if (ctx.calm()) return;
    for (const id of ids) {
      void animate(buttons.get(id), [{ transform: 'scale(0.94)' }, { transform: 'translateY(-10px) scale(0.94)' }, { transform: 'scale(0.94)' }], { duration: 260, calmFade: false });
      await sleep(90);
    }
    await sleep(220);
  }

  async function submit(): Promise<void> {
    const w = wall();
    if (!w || busy || w.done || w.sel.length !== 4) return;
    const guess = [...w.sel];
    if (w.guesses.some((g) => sameSet(g.tiles, guess))) {
      ctx.toast('Already guessed');
      return;
    }
    busy = true;
    paintTiles();
    ctx.sfx.lock();
    const sent = ctx.emit({ item: w.id, move: 'guess', response: { tiles: guess }, time_ms: Math.max(0, ctx.elapsedMs() - w.shownAt) }, { now: true });
    let result: EventResult;
    try {
      [result] = await Promise.all([sent, lift(guess)]);
    } catch (e) {
      if (disposed) return;
      busy = false;
      paintTiles();
      ctx.toast(e instanceof Error && e.message ? e.message : 'That guess didn’t send. Try again.', 'bad');
      return;
    }
    if (disposed) return;
    w.guesses.push({ tiles: guess, correct: result.correct === true });
    if (result.correct) await right(w, guess, result);
    else await wrong(w, guess, result);
    if (disposed) return;
    busy = false;
    if (!w.done) paintTiles();
    keepFocus();
  }

  async function right(w: WallState, guess: string[], result: EventResult): Promise<void> {
    const g = result.reveal?.group;
    const used = new Set(w.groups.map((x) => x.difficulty));
    const group: Group = g
      ? { id: g.id, label: g.label, why: g.why, difficulty: g.difficulty, tiles: g.tiles.every((id) => w.text.has(id)) ? g.tiles : guess, found: true }
      : { id: `found_${w.groups.length}`, label: 'Group found', why: '', difficulty: [1, 2, 3, 4].find((d) => !used.has(d)) ?? 1, tiles: guess, found: true };
    const from = new Map(guess.map((id) => [id, buttons.get(id)?.getBoundingClientRect()]));
    w.groups.push(group);
    w.order = w.order.filter((t) => !group.tiles.includes(t.id) && !guess.includes(t.id));
    w.sel = [];
    ctx.sfx.right();
    await flip(wallEl, () => layout(), { duration: 520 });
    const row = rowOf(group.id);
    if (row && !ctx.calm()) {
      const tops = [...from.values()].filter((r): r is DOMRect => !!r).map((r) => r.top);
      const dy = tops.length ? tops.reduce((a, b) => a + b, 0) / tops.length - row.getBoundingClientRect().top : 0;
      await animate(row, [{ transform: `translateY(${Math.round(dy)}px) scale(0.92)`, opacity: 0.3 }, { transform: 'scale(1.03)', opacity: 1, offset: 0.65 }, { transform: 'none', opacity: 1 }], { duration: 560 });
    }
    status();
    if (w.groups.length >= 4 || w.order.length === 0) endWall(w, 'solved');
  }

  async function wrong(w: WallState, guess: string[], result: EventResult): Promise<void> {
    w.mistakes += 1;
    ctx.sfx.wrong();
    paintLeft();
    const gone = left.querySelectorAll('i.is-gone')[0];
    void animate(gone, [{ transform: 'scale(1.6)' }, { transform: 'scale(0.6)' }], { duration: 380, calmFade: false });
    await Promise.all(guess.map((id) => shake(buttons.get(id))));
    if (result.one_away) ctx.toast('One away…');
    if (w.mistakes >= allowed) await outOfMistakes(w);
  }

  async function outOfMistakes(w: WallState): Promise<void> {
    w.sel = [];
    paintTiles();
    ctx.toast('Out of mistakes');
    let reveal: WallReveal | undefined;
    try {
      reveal = (await ctx.emit({ item: w.id, move: 'pass' }, { now: true })).reveal as WallReveal | undefined;
    } catch {
      reveal = undefined;
    }
    if (disposed) return;
    const missing = (reveal?.groups ?? []).filter((g) => !w.groups.some((x) => x.id === g.id)).sort((a, b) => a.difficulty - b.difficulty);
    for (const g of missing) {
      if (!ctx.calm()) await sleep(450);
      if (disposed) return;
      w.groups.push({ ...g, tiles: g.tiles.filter((id) => w.text.has(id)), found: false });
      w.order = w.order.filter((t) => !g.tiles.includes(t.id));
      await flip(wallEl, () => layout(), { duration: 480 });
      const row = rowOf(g.id);
      ctx.sfx.reveal();
      if (row) void animate(row, [{ transform: 'scale(0.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420 });
    }
    // Without the groups from the server the tiles still in play stay as plain, unlabelled tiles.
    w.unrevealed = w.order;
    w.order = [];
    endWall(w, 'out');
  }

  function endWall(w: WallState, how: 'solved' | 'out'): void {
    w.done = how;
    head.hidden = true;
    layout();
    paintLeft();
    status();
    const card = el('section', 'cx-done');
    const found = w.groups.filter((g) => g.found).length;
    card.append(el('span', 'cx-sub', how === 'solved' ? 'Wall solved' : 'Out of mistakes'));
    const big = how === 'solved' ? (w.mistakes === 0 ? 'Perfect' : `${w.mistakes} mistake${w.mistakes === 1 ? '' : 's'}`) : `${found} of 4`;
    card.append(el('span', 'cx-big', big));
    const where = new Map<string, number>();
    for (const g of w.groups) for (const id of g.tiles) where.set(id, g.difficulty);
    const grid = el('div', 'cx-mini');
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', `Your ${w.guesses.length} guesses: ${w.guesses.filter((g) => g.correct).length} right`);
    for (const g of w.guesses) {
      for (const id of g.tiles) {
        const d = where.get(id);
        grid.append(el('i', d ? `cx-mini--${d}` : 'cx-mini--unknown'));
      }
    }
    card.append(grid);
    card.append(el('p', 'cx-sub cx-note', w.unrevealed.length ? 'Each row is one of your guesses. Grey tiles are in groups you didn’t find.' : 'Each row is one of your guesses, coloured by where those tiles really belonged.'));
    endHost.replaceChildren(card);
    card.scrollIntoView?.({ block: 'nearest', behavior: ctx.calm() ? 'auto' : 'smooth' });
    void animate(card, [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 450 });
    if (how === 'solved') {
      ctx.sfx.fanfare();
      if (!ctx.calm()) void confetti(root);
    }
    const last = at >= walls.length - 1;
    const next = act(last ? 'See my score' : 'Next wall', 'btn--primary', () => {
      if (last) ctx.finish();
      else {
        at += 1;
        startWall();
      }
    });
    ctx.setActions([next]);
    next.focus({ preventScroll: true });
  }

  if (!walls.length || !walls.some((w) => w.order.length)) {
    root.replaceChildren(el('p', 'gm-solo__state', 'This wall has no tiles yet.'));
    ctx.setActions([act('Back', 'btn--secondary', () => ctx.finish())]);
  } else {
    startWall();
  }

  const onResize = () => fitTiles();
  window.addEventListener('resize', onResize);

  return {
    onKey(e: KeyboardEvent): boolean {
      const w = wall();
      if (!w) return false;
      if (w.done) return false;
      const tiles = [...wallEl.querySelectorAll<HTMLButtonElement>('.cx-tile:not(.is-left)')];
      const i = tiles.indexOf(document.activeElement as HTMLButtonElement);
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 };
      if (e.key in moves) {
        if (!tiles.length) return false;
        const next = i < 0 ? 0 : Math.min(tiles.length - 1, Math.max(0, i + moves[e.key]));
        tiles[next].focus();
        return true;
      }
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (i < 0) return false;
        toggle(tiles[i].dataset.id!);
        return true;
      }
      if (e.key === 'Enter') {
        if (w.sel.length === 4) {
          void submit();
          return true;
        }
        if (i >= 0) {
          toggle(tiles[i].dataset.id!);
          return true;
        }
      }
      return false;
    },
    dispose() {
      disposed = true;
      window.removeEventListener('resize', onResize);
      ctx.setActions([]);
      root.remove();
    }
  };
}
