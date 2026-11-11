import { el } from '@/quiz/dom';
import type { PublicCrosswordGrid } from '../../core/schema';
import { animate, enter, shake } from '../../motion/motion';
import type { MountedPlayer, PlayerContext } from '../../solo/registry';

/**
 * Crossword, solo (spec §6.1; approved mockup docs/mockups/games/crossword.html).
 * The grid comes from the publish (cell layout and numbers, never a letter):
 * the student taps a cell or clue and types on a hidden 16 px input (so iOS
 * doesn't zoom), or a laptop keyboard (arrows move, Tab next clue, Enter
 * checks). The view zooms to the active word, with a Whole grid toggle. Check
 * word asks the server; the hint ladder (a letter → the first letter of every
 * crossing word → the whole word) comes from the server too, so no answer is
 * ever on the page before it's earned. A solved word sweeps and locks; a
 * crossing shimmers once both its words are solved.
 */

const P = 44;
const CELL = 42;
type Dir = 'across' | 'down';
type Entry = { i: number; item: string; number: number; dir: Dir; x: number; y: number; length: number; cells: string[]; clue: string; kind: string; lengths: number[] };
type Cell = { x: number; y: number; n?: number; across?: number; down?: number };
type Status = 'clean' | 'hint' | 'shown';

const KIND_LABEL: Record<string, string> = { definition: 'Definition', example: 'Example', quote: 'Quote' };
const HINT_STEP = ['a letter', 'crossing starts', 'show the word'];
const key = (x: number, y: number) => `${x},${y}`;

export function mountCrossword(host: HTMLElement, ctx: PlayerContext): MountedPlayer {
  const grid = ctx.game.grid?.kind === 'crossword' ? (ctx.game.grid as PublicCrosswordGrid) : null;
  const items = new Map((ctx.game.items ?? []).filter((i) => i.shape === 'term').map((i) => [i.id, i]));
  const hintsOn = ctx.game.settings.hints !== false;

  const root = el('div', 'gm-cw');
  host.append(root);
  if (!grid || !grid.entries.length) {
    root.append(el('p', 'gm-note', 'This crossword has no grid yet. Ask your teacher to publish it again.'));
    return { dispose: () => root.remove() };
  }

  /* ── Model ──────────────────────────────────────────────────────── */
  const AT = new Map<string, Cell>();
  const entries: Entry[] = grid.entries.map((g, i) => {
    const item = items.get(g.item);
    const clue = item && item.shape === 'term' ? item.clues[0] : undefined;
    const cells = Array.from({ length: g.length }, (_, k) => {
      const x = g.dir === 'across' ? g.x + k : g.x;
      const y = g.dir === 'down' ? g.y + k : g.y;
      const c = AT.get(key(x, y)) ?? { x, y };
      c[g.dir] = i;
      AT.set(key(x, y), c);
      return key(x, y);
    });
    return { i, item: g.item, number: g.number, dir: g.dir, x: g.x, y: g.y, length: g.length, cells, clue: clue?.text ?? '', kind: clue?.kind ?? 'definition', lengths: item && item.shape === 'term' ? item.lengths : [g.length] };
  });
  for (const e of entries) {
    const first = AT.get(e.cells[0] as string);
    if (first) first.n = e.number;
  }
  const ORDER = [...entries.filter((e) => e.dir === 'across'), ...entries.filter((e) => e.dir === 'down')].map((e) => e.i);
  const W = entries.length;
  const label = (e: Entry) => `${e.number} ${e.dir === 'across' ? 'Across' : 'Down'}`;
  const lenText = (e: Entry) => `(${e.lengths.join(', ')})`;

  const L = new Map<string, string>();
  const given = new Set<string>();
  const status = new Map<number, Status>();
  const hints = new Map<number, number>();
  const tries = new Map<number, number>();
  const first = entries[ORDER[0] as number] as Entry;
  let act = first.i;
  let cx = first.x;
  let cy = first.y;
  let zoom = true;
  let busy = false;
  let done = false;

  const cellStatus = (k: string): '' | 'ok' | 'shown' => {
    const c = AT.get(k);
    if (!c) return '';
    let st: '' | 'shown' = '';
    for (const d of ['across', 'down'] as const) {
      const s = c[d] === undefined ? undefined : status.get(c[d] as number);
      if (s === 'clean' || s === 'hint') return 'ok';
      if (s === 'shown') st = 'shown';
    }
    return st;
  };
  const locked = (k: string) => !!cellStatus(k);

  /* ── DOM ────────────────────────────────────────────────────────── */
  const row = el('div', 'cw-row');
  const sub = el('p', 'cw-sub', 'Tap a square or a clue');
  const zoomBtn = el('button', 'cw-zoom');
  zoomBtn.type = 'button';
  row.append(sub, zoomBtn);
  const view = el('div', 'cw-view');
  const gridEl = el('div', 'cw-grid');
  gridEl.style.width = `${grid.width * P}px`;
  gridEl.style.height = `${grid.height * P}px`;
  const cellEls = new Map<string, HTMLButtonElement>();
  for (const [k, c] of AT) {
    const b = el('button', 'cw-cell');
    b.type = 'button';
    b.dataset.k = k;
    b.tabIndex = -1;
    b.style.left = `${c.x * P + 1}px`;
    b.style.top = `${c.y * P + 1}px`;
    b.setAttribute('aria-label', `Row ${c.y + 1}, column ${c.x + 1}`);
    if (c.n) b.append(el('span', 'n', String(c.n)));
    b.append(el('span', 'l'), el('span', 'sw'), el('span', 'sh'));
    cellEls.set(k, b);
    gridEl.append(b);
  }
  view.append(gridEl);
  const bar = el('div', 'cw-bar');
  const prev = el('button', '', '‹');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous clue');
  const barText = el('div', 't');
  barText.setAttribute('aria-live', 'polite');
  const next = el('button', '', '›');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next clue');
  bar.append(prev, barText, next);
  const list = el('div', 'cw-list');
  const input = el('input', 'cw-key');
  input.setAttribute('aria-label', 'Type a letter');
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'characters');
  input.setAttribute('autocorrect', 'off');
  input.spellcheck = false;
  input.setAttribute('enterkeyhint', 'done');
  const finishLink = el('button', 'cw-finish', 'Finish now');
  finishLink.type = 'button';
  const finishNote = el('p', 'cw-finish-note', 'Clues you haven’t solved count as missed.');
  const foot = el('div', 'cw-foot');
  foot.append(finishLink, finishNote);
  root.append(row, view, bar, list, foot, input);

  const hintBtn = el('button', 'btn btn--secondary gm-solo__action cw-hint');
  hintBtn.type = 'button';
  const checkBtn = el('button', 'btn btn--primary gm-solo__action cw-check', 'Check word');
  checkBtn.type = 'button';
  ctx.setActions(hintsOn ? [hintBtn, checkBtn] : [checkBtn]);

  /* ── Paint ──────────────────────────────────────────────────────── */
  function paintList(): void {
    list.replaceChildren();
    for (const d of ['across', 'down'] as const) {
      const ids = ORDER.filter((i) => entries[i]?.dir === d);
      if (!ids.length) continue;
      list.append(el('h3', '', d === 'across' ? 'Across' : 'Down'));
      for (const i of ids) {
        const x = entries[i] as Entry;
        const st = status.get(i);
        const b = el('button', `cw-clue${i === act ? ' act' : ''}${st ? ' done' : ''}`);
        b.type = 'button';
        b.dataset.w = String(i);
        const text = el('span');
        text.append(el('span', `cw-type${x.kind === 'example' ? ' ex' : ''}`, KIND_LABEL[x.kind] ?? 'Clue'), document.createTextNode(`${x.clue} ${lenText(x)}`));
        const tick = el('span', st ? `tick${st === 'shown' ? ' shown' : ''}` : '', st ? (st === 'shown' ? '•' : '✓') : '');
        if (st) tick.setAttribute('aria-label', st === 'clean' ? 'Solved' : st === 'hint' ? 'Solved with hints' : 'Shown');
        b.append(el('span', 'num', String(x.number)), text, tick);
        list.append(b);
      }
    }
  }

  function paint(): void {
    const e = entries[act] as Entry;
    const inAct = new Set(e.cells);
    const cur = key(cx, cy);
    for (const [k, c] of cellEls) {
      const st = cellStatus(k);
      c.classList.toggle('in', inAct.has(k));
      c.classList.toggle('cur', k === cur && !done);
      c.classList.toggle('ok', st === 'ok');
      c.classList.toggle('shown', st === 'shown');
      c.classList.toggle('given', given.has(k) && !st);
      const l = c.querySelector('.l') as HTMLElement;
      const v = L.get(k) ?? '';
      if (l.textContent !== v) l.textContent = v;
    }
    barText.replaceChildren(el('b', '', `${label(e)} · ${KIND_LABEL[e.kind] ?? 'Clue'}`), el('span', '', `${e.clue} ${lenText(e)}`));
    paintList();
    const h = hints.get(act) ?? 0;
    const solved = status.has(act);
    hintBtn.replaceChildren();
    if (solved) hintBtn.append(el('span', '', 'Solved'), el('small', '', 'Pick another clue'));
    else {
      const top = el('span', '', 'Hint ');
      const dots = el('span', 'cw-dots');
      for (let k = 0; k < 3; k++) dots.append(el('i', k < h ? 'on' : ''));
      top.append(dots);
      hintBtn.append(top, el('small', '', `Next: ${HINT_STEP[Math.min(h, 2)]}`));
    }
    hintBtn.setAttribute('aria-label', solved ? 'Solved' : `Hint, ${h} of 3 used. Next: ${HINT_STEP[Math.min(h, 2)]}`);
    hintBtn.disabled = solved || busy || done;
    checkBtn.disabled = solved || busy || done;
    checkBtn.textContent = busy ? 'Checking…' : 'Check word';
    ctx.setStatus(`${status.size} of ${W} words`);
    const fitsWhole = fitScale() >= 1;
    zoomBtn.hidden = fitsWhole;
    zoomBtn.textContent = zoom ? '⤢ Whole grid' : '⤡ Zoom in';
    zoomBtn.setAttribute('aria-pressed', String(!zoom));
  }

  function viewSize(): { vw: number; vh: number } {
    return { vw: view.clientWidth || 350, vh: view.clientHeight || 330 };
  }
  function fitScale(): number {
    const { vw, vh } = viewSize();
    return Math.min(vw / (grid!.width * P), vh / (grid!.height * P));
  }

  function frame(): void {
    const { vw, vh } = viewSize();
    const GW = grid!.width * P;
    const GH = grid!.height * P;
    const fit = Math.min(1, fitScale());
    if (!zoom || fitScale() >= 1) {
      gridEl.style.transform = `translate(${(vw - GW * fit) / 2}px, ${(vh - GH * fit) / 2}px) scale(${fit})`;
      return;
    }
    const e = entries[act] as Entry;
    const xs = e.cells.map((k) => (AT.get(k) as Cell).x);
    const ys = e.cells.map((k) => (AT.get(k) as Cell).y);
    const wpx = (Math.max(...xs) - Math.min(...xs) + 1) * P;
    const hpx = (Math.max(...ys) - Math.min(...ys) + 1) * P;
    const mx = wpx > vw - 20 ? cx * P + P / 2 : Math.min(...xs) * P + wpx / 2;
    const my = hpx > vh - 20 ? cy * P + P / 2 : Math.min(...ys) * P + hpx / 2;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const tx = GW <= vw ? (vw - GW) / 2 : clamp(vw / 2 - mx, vw - GW, 0);
    const ty = GH <= vh ? (vh - GH) / 2 : clamp(vh / 2 - my, vh - GH, 0);
    gridEl.style.transform = `translate(${tx}px, ${ty}px) scale(1)`;
  }

  const focusKey = () => {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  };

  /* ── Moves ──────────────────────────────────────────────────────── */
  function select(i: number, cellKey?: string): void {
    act = i;
    const e = entries[i] as Entry;
    const k = cellKey && e.cells.includes(cellKey) ? cellKey : e.cells.find((c) => !L.get(c) && !locked(c)) ?? (e.cells[0] as string);
    const c = AT.get(k) as Cell;
    cx = c.x;
    cy = c.y;
    paint();
    frame();
    focusKey();
  }

  function tapCell(k: string): void {
    const c = AT.get(k);
    if (!c || done) return;
    const e = entries[act] as Entry;
    if (!zoom) zoom = true;
    if (k === key(cx, cy) && c.across !== undefined && c.down !== undefined) {
      select(e.dir === 'across' ? c.down : c.across, k);
      return;
    }
    if (e.cells.includes(k)) {
      cx = c.x;
      cy = c.y;
      paint();
      frame();
      focusKey();
      return;
    }
    select((c[e.dir] ?? c.across ?? c.down) as number, k);
  }

  function step(dir: 1 | -1): boolean {
    const e = entries[act] as Entry;
    const at = e.cells.indexOf(key(cx, cy));
    for (let j = at + dir; j >= 0 && j < e.cells.length; j += dir) {
      const k = e.cells[j] as string;
      if (!locked(k)) {
        const c = AT.get(k) as Cell;
        cx = c.x;
        cy = c.y;
        return true;
      }
    }
    return false;
  }

  function type(ch: string): void {
    if (done || busy) return;
    let k = key(cx, cy);
    if (locked(k)) {
      if (!step(1)) return;
      k = key(cx, cy);
    }
    L.set(k, ch.toUpperCase());
    given.delete(k);
    paint();
    const l = cellEls.get(k)?.querySelector('.l');
    void animate(l, [{ transform: 'translateY(-16px) scale(1.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, calmFade: false });
    ctx.sfx.click();
    step(1);
    paint();
    frame();
  }

  function back(): void {
    if (done || busy) return;
    const k = key(cx, cy);
    if (L.get(k) && !locked(k)) {
      L.delete(k);
      given.delete(k);
      paint();
      return;
    }
    if (step(-1)) {
      const j = key(cx, cy);
      L.delete(j);
      given.delete(j);
      paint();
      frame();
    }
  }

  function move(dx: number, dy: number): void {
    let x = cx;
    let y = cy;
    for (let n = 0; n < Math.max(grid!.width, grid!.height); n++) {
      x += dx;
      y += dy;
      if (x < 0 || y < 0 || x >= grid!.width || y >= grid!.height) return;
      const c = AT.get(key(x, y));
      if (c) {
        const want: Dir = dx ? 'across' : 'down';
        act = (c[want] ?? c.across ?? c.down) as number;
        cx = x;
        cy = y;
        paint();
        frame();
        return;
      }
    }
  }

  function nextClue(dir: 1 | -1): void {
    const at = ORDER.indexOf(act);
    for (let j = 1; j <= W; j++) {
      const i = ORDER[(at + dir * j + W * 2) % W] as number;
      if (!status.has(i) || j === W) {
        select(i);
        return;
      }
    }
  }

  const wordCells = (i: number) => (entries[i] as Entry).cells.map((k) => cellEls.get(k) as HTMLButtonElement);
  const lettersOf = (e: Entry) => e.cells.map((k) => L.get(k) ?? '.').join('');

  async function check(): Promise<void> {
    if (done || busy) return;
    const i = act;
    const e = entries[i] as Entry;
    if (status.has(i)) return;
    if (e.cells.some((k) => !L.get(k))) {
      ctx.toast('Fill every square first');
      return;
    }
    tries.set(i, (tries.get(i) ?? 0) + 1);
    busy = true;
    paint();
    try {
      const r = await ctx.emit({ item: e.item, move: 'answer', response: { text: lettersOf(e) }, time_ms: ctx.elapsedMs(), extra: { tries: tries.get(i) ?? 1 } }, { now: true });
      busy = false;
      if (r.correct) {
        await solve(i, hints.get(i) ? 'hint' : 'clean');
        return;
      }
      ctx.sfx.wrong();
      wordCells(i).forEach((c) => void shake(c));
      ctx.toast('Not quite. Change a letter, or climb the hint ladder.', 'bad');
      paint();
    } catch (err) {
      busy = false;
      paint();
      ctx.toast(err instanceof Error && err.message ? err.message : 'That didn’t send. Try again.', 'bad');
    }
  }

  async function solve(i: number, how: Status): Promise<void> {
    status.set(i, how);
    paint();
    const cells = wordCells(i);
    if (!ctx.calm()) {
      cells.forEach((c, k) => {
        void animate(c.querySelector('.sw'), [{ opacity: 0 }, { opacity: 0.55 }, { opacity: 0 }], { duration: 520, delay: k * 55, easing: 'ease-out', calmFade: false });
        void animate(c, [{ transform: 'none' }, { transform: 'scale(1.14)' }, { transform: 'none' }], { duration: 420, delay: k * 55, calmFade: false });
      });
    }
    if (how === 'shown') ctx.sfx.reveal();
    else ctx.sfx.right();
    const e = entries[i] as Entry;
    const both = e.cells.filter((k) => {
      const c = AT.get(k) as Cell;
      return c.across !== undefined && c.down !== undefined && status.has(c.across) && status.has(c.down);
    });
    if (how !== 'shown') ctx.toast(how === 'clean' ? `${label(e)} solved. No hints: a clean solve.` : `${label(e)} solved with ${hints.get(i)} hint${(hints.get(i) ?? 0) > 1 ? 's' : ''}.`, 'good');
    if (status.size === W) {
      done = true;
      paint();
      await wait(ctx.calm() ? 200 : 900);
      ctx.finish();
      return;
    }
    await wait(ctx.calm() ? 0 : cells.length * 55 + 200);
    both.forEach((k) =>
      void animate(cellEls.get(k)?.querySelector('.sh'), [{ opacity: 0, transform: 'translateX(-100%)' }, { opacity: 1, offset: 0.4 }, { opacity: 0, transform: 'translateX(100%)' }], { duration: 700, easing: 'ease-in-out', calmFade: false })
    );
    if (act === i) nextClue(1);
  }

  async function hint(): Promise<void> {
    const i = act;
    const e = entries[i] as Entry;
    if (status.has(i) || done || busy || !hintsOn) return;
    busy = true;
    paint();
    let r;
    try {
      r = await ctx.emit({ item: e.item, move: 'hint', response: { letters: lettersOf(e) }, time_ms: ctx.elapsedMs() }, { now: true });
    } catch (err) {
      busy = false;
      paint();
      ctx.toast(err instanceof Error && err.message ? err.message : 'That hint didn’t come through. Try again.', 'bad');
      return;
    }
    busy = false;
    const h = r.reveal?.step ?? Math.min(3, (hints.get(i) ?? 0) + 1);
    hints.set(i, h);
    const cells = r.reveal?.cells ?? [];
    const shown: string[] = [];
    for (const c of cells) {
      const k = key(c.x, c.y);
      if (!AT.has(k) || locked(k) || !/^[A-Z]$/.test(c.ch)) continue;
      L.set(k, c.ch);
      given.add(k);
      shown.push(k);
    }
    ctx.sfx.ding();
    paint();
    popCells(shown);
    if (h === 1) ctx.toast('One letter in. The orange corner marks a hint letter.');
    if (h === 2) ctx.toast(cells.length ? `${cells.length} crossing word${cells.length > 1 ? 's' : ''} started. Their first letters are in.` : 'No crossing words here.');
    if (h >= 3) {
      const word = lettersOf(e);
      ctx.toast(`The word was ${word}. It counts as shown.`);
      // The revealed word is sent as the answer, marked as shown, so the clue closes.
      void ctx.emit({ item: e.item, move: 'answer', response: { text: word }, time_ms: ctx.elapsedMs(), extra: { hints: 3 } }).catch(() => undefined);
      await solve(i, 'shown');
      return;
    }
    frame();
  }

  function popCells(keys: string[]): void {
    keys.forEach((k, n) =>
      void animate(cellEls.get(k)?.querySelector('.l'), [{ transform: 'translateY(-16px) scale(1.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: n * 90, fill: 'backwards' })
    );
  }

  /* ── Wiring ─────────────────────────────────────────────────────── */
  const onClick = (ev: MouseEvent) => {
    const t = ev.target as HTMLElement;
    const cell = t.closest<HTMLElement>('.cw-cell');
    if (cell?.dataset.k) {
      tapCell(cell.dataset.k);
      return;
    }
    const clue = t.closest<HTMLElement>('.cw-clue');
    if (clue?.dataset.w) {
      select(Number(clue.dataset.w));
      ctx.sfx.click();
    }
  };
  root.addEventListener('click', onClick);
  zoomBtn.addEventListener('click', () => {
    zoom = !zoom;
    paint();
    frame();
    focusKey();
  });
  prev.addEventListener('click', () => nextClue(-1));
  next.addEventListener('click', () => nextClue(1));
  checkBtn.addEventListener('click', () => {
    void check();
    focusKey();
  });
  hintBtn.addEventListener('click', () => {
    void hint();
    focusKey();
  });
  finishLink.addEventListener('click', () => {
    if (done) return;
    done = true;
    paint();
    ctx.finish();
  });
  // Phones whose keyboards don't send key names put the letter in the input instead.
  input.addEventListener('input', () => {
    const v = input.value.replace(/[^a-z]/gi, '');
    input.value = '';
    for (const ch of v) type(ch);
  });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => frame()) : null;
  resize?.observe(view);

  // Live, reopened mid-race: this seat's solved words (its own letters) and hints come back from the room.
  if (ctx.restore) {
    for (const r of ctx.restore.solved ?? []) {
      const e = entries.find((x) => x.item === r.item);
      if (!e) continue;
      const letters = (r.text ?? '').toUpperCase();
      e.cells.forEach((k, n) => {
        const ch = letters[n];
        if (ch && /^[A-Z]$/.test(ch)) L.set(k, ch);
      });
      hints.set(e.i, r.hints);
      status.set(e.i, r.hints >= 3 ? 'shown' : r.hints > 0 ? 'hint' : 'clean');
    }
    for (const [item, h] of Object.entries(ctx.restore.hints ?? {})) {
      const e = entries.find((x) => x.item === item);
      if (e && !status.has(e.i)) hints.set(e.i, h.step);
    }
    const open = ORDER.find((i) => !status.has(i));
    if (status.has(act) && open !== undefined) {
      // The first clue still open, without select(): that would raise a phone's keyboard unasked.
      act = open;
      const e = entries[open] as Entry;
      const c = AT.get(e.cells.find((k) => !L.get(k) && !locked(k)) ?? (e.cells[0] as string)) as Cell;
      cx = c.x;
      cy = c.y;
    }
  }
  paint();
  frame();
  void enter(root);
  // Keyboards can type straight away; phones wait for a tap so the keyboard doesn't jump up unasked.
  if (typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches) focusKey();

  return {
    onKey(ev: KeyboardEvent): boolean {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
      const t = ev.target as HTMLElement | null;
      // Buttons keep Enter and Space for themselves.
      if ((ev.key === 'Enter' || ev.key === ' ') && t && t !== input && t.closest('button')) return false;
      const k = ev.key;
      if (/^[a-z]$/i.test(k)) {
        type(k);
        return true;
      }
      if (k === 'Backspace') back();
      else if (k === 'ArrowLeft') move(-1, 0);
      else if (k === 'ArrowRight') move(1, 0);
      else if (k === 'ArrowUp') move(0, -1);
      else if (k === 'ArrowDown') move(0, 1);
      else if (k === 'Enter') void check();
      else if (k === 'Tab') nextClue(ev.shiftKey ? -1 : 1);
      else return false;
      return true;
    },
    dispose(): void {
      resize?.disconnect();
      root.removeEventListener('click', onClick);
      ctx.setActions([]);
      root.remove();
    }
  };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
