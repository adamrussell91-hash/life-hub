import { el } from '@/quiz/dom';
import type { EventResult } from '../../api';
import type { PublicWordGrid } from '../../core/schema';
import { animate, enter, shake } from '../../motion/motion';
import type { MountedPlayer, PlayerContext } from '../../solo/registry';

/**
 * Find-a-word, solo (spec §6.2; approved mockup docs/mockups/games/find-a-word.html).
 * Clues only, never a word list. The student drags across letters (pointer
 * events, so mouse, pen and touch alike; the band snaps to the eight
 * directions), or taps the first letter and then the last, or uses the arrow
 * keys and Enter. The selection goes to the server against the picked clue or
 * "Any clue"; the server says right, decoy ("a real word in here, but not
 * this one") or nothing. Hints climb first letter → length → the line it sits
 * in. A found word gets a hand-drawn loop. Once every word is found the
 * hidden message's letters light up, fly into a line, and the last question
 * appears.
 */

type Clue = { i: number; id: string; text: string; kind: string; lengths: number[] };
type Hint = { step: number; first?: string; length?: number; line?: { x: number; y: number; dx: number; dy: number } };
type Pt = { x: number; y: number };

const KIND_LABEL: Record<string, string> = { definition: 'Definition', example: 'Example', quote: 'Quote' };
const INKS = 9;
const OPT_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function mountFindAWord(host: HTMLElement, ctx: PlayerContext): MountedPlayer {
  const grid = ctx.game.grid?.kind === 'wordsearch' ? (ctx.game.grid as PublicWordGrid) : null;
  const hintsOn = ctx.game.settings.hints !== false;
  const root = el('div', 'gm-fw');
  host.append(root);
  if (!grid || !grid.rows.length) {
    root.append(el('p', 'gm-note', 'This find-a-word has no grid yet. Ask your teacher to publish it again.'));
    return { dispose: () => root.remove() };
  }
  const N = grid.size;
  const clues: Clue[] = (ctx.game.items ?? [])
    .filter((i) => i.shape === 'term')
    .map((t, i) => ({ i, id: t.id, text: t.shape === 'term' ? t.clues[0]?.text ?? '' : '', kind: t.shape === 'term' ? t.clues[0]?.kind ?? 'definition' : 'definition', lengths: t.shape === 'term' ? t.lengths : [] }));

  /* ── State ──────────────────────────────────────────────────────── */
  const found = new Map<number, { from: Pt; to: Pt; word: string; hints: number }>();
  const hints = new Map<number, Hint>();
  let act: number | null = clues.length ? 0 : null;
  let anchor: Pt | null = null;
  let cursor: Pt = { x: 0, y: 0 };
  let busy = false;
  let stage: 'play' | 'reveal' | 'question' | 'done' = 'play';
  let message: { text: string; display: string; cells: Array<[number, number]> } | null = null;
  let disposed = false;

  /* ── DOM ────────────────────────────────────────────────────────── */
  const card = el('div', 'fw-card');
  card.setAttribute('aria-live', 'polite');
  const wrap = el('div', 'fw-wrap');
  wrap.setAttribute('role', 'grid');
  wrap.setAttribute('aria-label', `Letter grid, ${N} by ${N}. Drag across a word, or tap its first and last letters.`);
  wrap.style.setProperty('--fw-n', String(N));
  const gridEl = el('div', 'fw-grid');
  const cellEls: HTMLElement[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = el('span', 'fw-c', grid.rows[y]?.[x] ?? '');
      c.dataset.k = String(y * N + x);
      cellEls.push(c);
      gridEl.append(c);
    }
  }
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'fw-svg');
  svg.setAttribute('viewBox', `0 0 ${N * 100} ${N * 100}`);
  svg.setAttribute('aria-hidden', 'true');
  const band = el('div', 'fw-band');
  wrap.append(gridEl, svg, band);
  const list = el('div', 'fw-list');
  root.append(card, wrap, list);

  const anyBtn = el('button', 'btn btn--secondary gm-solo__action fw-any', 'Any clue');
  anyBtn.type = 'button';
  const hintBtn = el('button', 'btn btn--secondary gm-solo__action fw-hint');
  hintBtn.type = 'button';
  const setPlayActions = () => ctx.setActions(hintsOn ? [anyBtn, hintBtn] : [anyBtn]);
  setPlayActions();

  const cellAtIndex = (p: Pt) => cellEls[p.y * N + p.x] as HTMLElement;
  const letters = (from: Pt, to: Pt): string => {
    const cells = lineCells(from, to);
    return cells ? cells.map((p) => grid.rows[p.y]?.[p.x] ?? '').join('') : '';
  };

  /* ── Paint ──────────────────────────────────────────────────────── */
  function lineOfHint(h: Hint | undefined): number[] {
    if (!h?.line) return [];
    const out: number[] = [];
    let { x, y } = h.line;
    while (x >= 0 && y >= 0 && x < N && y < N) {
      out.push(y * N + x);
      x += h.line.dx;
      y += h.line.dy;
    }
    return out;
  }

  function paint(): void {
    const c = act !== null ? clues[act] : undefined;
    const h = c ? hints.get(c.i) : undefined;
    card.classList.toggle('all', !c);
    card.replaceChildren();
    if (c) {
      card.append(el('b', '', `Clue ${c.i + 1} · ${KIND_LABEL[c.kind] ?? 'Clue'}`), el('span', 'q', c.text));
      if (h) {
        const pills = el('span', 'hints');
        if (h.first) pills.append(el('span', '', `Starts with ${h.first}`));
        if (h.step >= 2) pills.append(el('span', '', `${h.length ?? c.lengths.reduce((a, b) => a + b, 0)} letters`));
        if (h.step >= 3) pills.append(el('span', '', 'It sits in the orange line'));
        card.append(pills);
      }
    } else {
      card.append(el('b', '', 'Any clue'), el('span', 'q', 'Drag across any term you can see. It’s checked against every clue you have left.'));
    }
    const line = new Set(lineOfHint(h));
    cellEls.forEach((n, k) => n.classList.toggle('line', line.has(k)));
    cellEls.forEach((n) => n.classList.remove('anchor', 'cursor'));
    if (anchor) cellAtIndex(anchor).classList.add('anchor');
    if (stage === 'play' && wrap.classList.contains('kbd')) cellAtIndex(cursor).classList.add('cursor');

    list.replaceChildren();
    for (const x of clues) {
      const f = found.get(x.i);
      const b = el('button', `fw-clue${x.i === act ? ' act' : ''}${f ? ' done' : ''}`);
      b.type = 'button';
      b.dataset.c = String(x.i);
      b.disabled = stage !== 'play';
      const text = el('span');
      text.append(el('span', `fw-type${x.kind === 'definition' ? ' def' : ''}`, KIND_LABEL[x.kind] ?? 'Clue'), document.createTextNode(x.text));
      if (f) {
        text.append(el('br'));
        const w = el('span', `word ink-${x.i % INKS}`, f.word);
        text.append(w);
      }
      const tick = el('span', f ? 'tick' : '', f ? '✓' : '');
      if (f) tick.setAttribute('aria-label', 'Found');
      b.append(el('span', 'num', String(x.i + 1)), text, tick);
      list.append(b);
    }
    const hs = c ? hints.get(c.i)?.step ?? 0 : 0;
    hintBtn.replaceChildren();
    if (!c) hintBtn.append(el('span', '', 'Hint'), el('small', '', 'Pick a clue first'));
    else {
      const top = el('span', '', 'Hint ');
      const dots = el('span', 'cw-dots');
      for (let k = 0; k < 3; k++) dots.append(el('i', k < hs ? 'on' : ''));
      top.append(dots);
      hintBtn.append(top, el('small', '', hs >= 3 ? 'No more hints' : `Next: ${['first letter', 'length', 'its line'][hs]}`));
    }
    hintBtn.disabled = !c || hs >= 3 || busy || stage !== 'play';
    anyBtn.setAttribute('aria-pressed', String(act === null));
    anyBtn.disabled = stage !== 'play';
    ctx.setStatus(`${found.size} of ${clues.length} found`);
  }

  /* ── Selection band ─────────────────────────────────────────────── */
  const pitch = () => (wrap.clientWidth || N * 34) / N;
  function cellAt(ev: PointerEvent): Pt {
    const r = wrap.getBoundingClientRect();
    const w = r.width || N * 34;
    const s = w / N;
    return { x: clampN(Math.floor((ev.clientX - r.left) / s)), y: clampN(Math.floor((ev.clientY - r.top) / s)) };
  }
  const clampN = (v: number) => Math.max(0, Math.min(N - 1, v));
  type Snap = { dx: number; dy: number; len: number };
  function snap(a: Pt, b: Pt): Snap {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (!dx && !dy) return { dx: 0, dy: 0, len: 0 };
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    const ux = Math.round(Math.cos((ang * Math.PI) / 4));
    const uy = Math.round(Math.sin((ang * Math.PI) / 4));
    let len = Math.max(Math.abs(dx), Math.abs(dy));
    while (len > 0 && (a.x + ux * len < 0 || a.x + ux * len >= N || a.y + uy * len < 0 || a.y + uy * len >= N)) len--;
    return { dx: ux, dy: uy, len };
  }
  function draw(a: Pt, sn: Snap): void {
    const p = pitch();
    const h = p * 0.86;
    const L = sn.len * p * (sn.dx && sn.dy ? Math.SQRT2 : 1);
    band.style.width = `${L + h}px`;
    band.style.height = `${h}px`;
    band.style.borderRadius = `${h / 2}px`;
    band.style.transformOrigin = `${h / 2}px ${h / 2}px`;
    band.style.transform = `translate(${a.x * p + p / 2 - h / 2}px, ${a.y * p + p / 2 - h / 2}px) rotate(${Math.atan2(sn.dy, sn.dx)}rad)`;
  }
  function clearBand(): void {
    void animate(band, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, calmFade: false }).then(() => {
      band.className = 'fw-band';
    });
    if (ctx.calm()) band.className = 'fw-band';
  }

  let drag: { a: Pt; sn: Snap; moved: boolean; id: number } | null = null;
  const onDown = (ev: PointerEvent) => {
    if (stage !== 'play' || busy) return;
    ev.preventDefault();
    try {
      wrap.setPointerCapture(ev.pointerId);
    } catch {
      // Capture isn't available everywhere (tests): moves still arrive on the grid.
    }
    wrap.classList.remove('kbd');
    const a = cellAt(ev);
    drag = { a, sn: { dx: 0, dy: 0, len: 0 }, moved: false, id: ev.pointerId };
    band.className = 'fw-band on';
    draw(a, drag.sn);
  };
  const onMove = (ev: PointerEvent) => {
    if (!drag) return;
    const sn = snap(drag.a, cellAt(ev));
    if (sn.len !== drag.sn.len || sn.dx !== drag.sn.dx || sn.dy !== drag.sn.dy) {
      if (sn.len) ctx.sfx.click();
      drag.sn = sn;
      drag.moved = drag.moved || sn.len > 0;
      draw(drag.a, sn);
    }
  };
  const onUp = () => {
    if (!drag) return;
    const { a, sn, moved } = drag;
    drag = null;
    if (!moved || !sn.len) tap(a);
    else {
      anchor = null;
      paint();
      void judge(a, { x: a.x + sn.dx * sn.len, y: a.y + sn.dy * sn.len });
    }
  };
  /** Tap-tap: the first tap anchors, the second finishes the line. */
  function tap(p: Pt): void {
    if (!anchor) {
      anchor = p;
      band.className = 'fw-band';
      paint();
      return;
    }
    const a = anchor;
    anchor = null;
    paint();
    const sn = snap(a, p);
    if (!sn.len) {
      band.className = 'fw-band';
      return;
    }
    draw(a, sn);
    band.className = 'fw-band on';
    void judge(a, { x: a.x + sn.dx * sn.len, y: a.y + sn.dy * sn.len });
  }
  wrap.addEventListener('pointerdown', onDown);
  wrap.addEventListener('pointermove', onMove);
  wrap.addEventListener('pointerup', onUp);
  wrap.addEventListener('pointercancel', onUp);

  /* ── Judging ────────────────────────────────────────────────────── */
  function sameLine(f: { from: Pt; to: Pt }, a: Pt, b: Pt): boolean {
    const eq = (p: Pt, q: Pt) => p.x === q.x && p.y === q.y;
    return (eq(f.from, a) && eq(f.to, b)) || (eq(f.from, b) && eq(f.to, a));
  }

  async function judge(a: Pt, b: Pt): Promise<void> {
    if (busy) return;
    const c = act !== null ? clues[act] : undefined;
    const word = letters(a, b);
    for (const f of found.values()) {
      if (sameLine(f, a, b)) {
        ctx.toast('Already found');
        clearBand();
        return;
      }
    }
    busy = true;
    paint();
    let r: EventResult;
    try {
      r = await ctx.emit({ item: c ? c.id : 'any', move: 'answer', response: { from: [a.x, a.y], to: [b.x, b.y] }, time_ms: ctx.elapsedMs() }, { now: true });
    } catch (err) {
      busy = false;
      paint();
      ctx.toast(err instanceof Error && err.message ? err.message : 'That didn’t send. Try again.', 'bad');
      clearBand();
      return;
    }
    busy = false;
    if (disposed) return;
    if (r.correct) {
      const hit = clues.find((x) => x.id === r.item) ?? c;
      if (!hit || found.has(hit.i)) {
        ctx.toast('Already found');
        clearBand();
        paint();
        return;
      }
      band.className = 'fw-band';
      if (r.reveal?.message) message = r.reveal.message;
      await onFound(hit, a, b, word);
      return;
    }
    if (r.decoy) {
      band.classList.add('bad');
      void shake(band);
      ctx.sfx.wrong();
      ctx.toast(c ? `That’s a real word in here, but not this one. ${word} is in the grid: read the clue again.` : `That’s a real word in here, but no clue wants it. ${word} is a decoy.`, 'bad');
      await wait(ctx.calm() ? 0 : 500);
      clearBand();
      paint();
      return;
    }
    band.classList.add('miss');
    await wait(ctx.calm() ? 0 : 220);
    clearBand();
    paint();
  }

  function loop(from: Pt, to: Pt, ink: number, instant: boolean): void {
    const S = 100;
    const sx = from.x * S + S / 2;
    const sy = from.y * S + S / 2;
    const ex = to.x * S + S / 2;
    const ey = to.y * S + S / 2;
    const L = Math.hypot(ex - sx, ey - sy);
    const r = 43;
    const deg = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI;
    // A capsule drawn like a pen loop: starts a little off and overshoots where it began.
    const d = `M ${-r * 0.4} ${-r - 3} L ${L} ${-r + 4} A ${r} ${r} 0 0 1 ${L + 1.5} ${r} L -3 ${r - 3} A ${r} ${r} 0 0 1 ${-r * 0.2} ${-r - 7} L ${r * 1.4} ${-r - 6}`;
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('transform', `translate(${sx} ${sy}) rotate(${deg})`);
    g.setAttribute('class', `ink-${ink % INKS}`);
    const fill = document.createElementNS(svgNS, 'path');
    fill.setAttribute('class', 'fill');
    fill.setAttribute('d', d);
    const pen = document.createElementNS(svgNS, 'path');
    pen.setAttribute('class', 'pen');
    pen.setAttribute('d', d);
    pen.setAttribute('pathLength', '1');
    pen.setAttribute('stroke-dasharray', '1');
    pen.setAttribute('stroke-dashoffset', instant || ctx.calm() ? '0' : '1');
    g.append(fill, pen);
    svg.append(g);
    if (instant || ctx.calm()) return;
    if (typeof (pen as unknown as HTMLElement).animate === 'function') {
      (pen as unknown as HTMLElement).animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 620, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
      (fill as unknown as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 400, fill: 'backwards' });
    }
  }

  async function onFound(c: Clue, a: Pt, b: Pt, word: string): Promise<void> {
    const h = hints.get(c.i)?.step ?? 0;
    found.set(c.i, { from: a, to: b, word, hints: h });
    loop(a, b, c.i, false);
    ctx.sfx.right();
    (lineCells(a, b) ?? []).forEach((p, n) => void animate(cellAtIndex(p), [{ transform: 'none' }, { transform: 'scale(1.3)' }, { transform: 'none' }], { duration: 380, delay: n * 45, calmFade: false }));
    ctx.toast(`${word} · clue ${c.i + 1}. ${h ? `Found with ${h} hint${h > 1 ? 's' : ''}.` : 'Found with no hints.'}`, 'good');
    const next = clues.find((x) => !found.has(x.i) && x.i > c.i) ?? clues.find((x) => !found.has(x.i));
    if (act !== null || !next) act = next ? next.i : null;
    paint();
    if (!next) {
      stage = 'reveal';
      paint();
      await wait(ctx.calm() ? 100 : 900);
      if (disposed) return;
      if (message && message.cells.length) await reveal();
      else ctx.finish();
    }
  }

  async function hint(): Promise<void> {
    const c = act !== null ? clues[act] : undefined;
    if (!c || busy || stage !== 'play' || !hintsOn || (hints.get(c.i)?.step ?? 0) >= 3) return;
    busy = true;
    paint();
    let r: EventResult;
    try {
      r = await ctx.emit({ item: c.id, move: 'hint', time_ms: ctx.elapsedMs() }, { now: true });
    } catch (err) {
      busy = false;
      paint();
      ctx.toast(err instanceof Error && err.message ? err.message : 'That hint didn’t come through. Try again.', 'bad');
      return;
    }
    busy = false;
    const prevStep = hints.get(c.i)?.step ?? 0;
    const step = r.reveal?.step ?? prevStep + 1;
    hints.set(c.i, { ...(hints.get(c.i) ?? {}), step, ...(r.reveal?.first ? { first: r.reveal.first } : {}), ...(r.reveal?.length ? { length: r.reveal.length } : {}), ...(r.reveal?.line ? { line: r.reveal.line } : {}) });
    ctx.sfx.ding();
    paint();
    if (step >= 3) lineOfHint(hints.get(c.i)).forEach((k, n) => void animate(cellEls[k], [{ opacity: 0.2 }, { opacity: 1 }], { duration: 300, delay: n * 35, fill: 'backwards', calmFade: false }));
    void animate(card.querySelector('.hints span:last-child'), [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380 });
  }

  /* ── Hidden message ─────────────────────────────────────────────── */
  async function reveal(): Promise<void> {
    if (!message) return;
    wrap.classList.add('reveal');
    ctx.sfx.reveal();
    ctx.setActions([]);
    const nodes = message.cells.map(([x, y]) => cellAtIndex({ x, y }));
    for (const n of nodes) {
      n.classList.add('left', 'glow');
      if (!ctx.calm()) {
        void animate(n, [{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 300, calmFade: false });
        await wait(60);
      }
    }
    await wait(ctx.calm() ? 0 : 500);
    if (disposed) return;
    const from = nodes.map((n) => n.getBoundingClientRect());
    const rootRect = root.getBoundingClientRect();
    // Build the message line, then fly each letter from its cell into its slot.
    const panel = el('div', 'fw-msg-panel');
    panel.append(el('span', 'fw-msg-lbl', 'The hidden message'));
    const msg = el('div', 'fw-msg');
    msg.setAttribute('aria-label', message.display);
    const slots: HTMLElement[] = [];
    let at = 0;
    for (const word of message.display.split(/\s+/).filter(Boolean)) {
      const ln = el('div', 'ln');
      for (const ch of word) {
        if (/[a-z]/i.test(ch) && at < message.text.length) {
          const t = el('span', 't wait', message.text[at] ?? ch.toUpperCase());
          at += 1;
          slots.push(t);
          ln.append(t);
        } else ln.append(el('span', 'p', ch));
      }
      msg.append(ln);
    }
    panel.append(msg);
    const q = questionPanel();
    root.replaceChildren(panel, ...(q ? [q.box] : []));
    await Promise.all(
      slots.map((t, i) => {
        const f = from[i];
        if (ctx.calm() || !f || typeof t.animate !== 'function') {
          t.classList.remove('wait');
          return Promise.resolve();
        }
        const to = t.getBoundingClientRect();
        const fly = el('span', 'fw-fly', t.textContent ?? '');
        fly.style.width = `${to.width}px`;
        fly.style.height = `${to.height}px`;
        root.append(fly);
        const fx = f.left - rootRect.left + (f.width - to.width) / 2;
        const fy = f.top - rootRect.top + (f.height - to.height) / 2;
        const tx = to.left - rootRect.left;
        const ty = to.top - rootRect.top;
        return wait(i * 45)
          .then(() => fly.animate([
            { transform: `translate(${fx}px, ${fy}px) scale(1)` },
            { transform: `translate(${(fx + tx) / 2}px, ${Math.min(fy, ty) - 60}px) scale(1.25) rotate(${(i % 2 ? 1 : -1) * 12}deg)`, offset: 0.5 },
            { transform: `translate(${tx}px, ${ty}px) scale(1)` }
          ], { duration: 820, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).finished)
          .catch(() => undefined)
          .then(() => {
            t.classList.remove('wait');
            fly.remove();
            if (i % 3 === 0) ctx.sfx.click();
          });
      })
    );
    if (disposed) return;
    ctx.sfx.ding();
    stage = 'question';
    if (q) {
      q.box.classList.remove('wait');
      void enter(q.box);
      ctx.setActions([q.lock]);
    } else {
      stage = 'done';
      ctx.setActions([resultsButton()]);
    }
  }

  function resultsButton(): HTMLButtonElement {
    const b = el('button', 'btn btn--primary gm-solo__action', 'See my results');
    b.type = 'button';
    b.addEventListener('click', () => ctx.finish());
    return b;
  }

  /** The final question about the message: choices (or true/false, or a short answer), Lock in, then why. */
  function questionPanel(): { box: HTMLElement; lock: HTMLButtonElement } | null {
    const pq = ctx.game.message?.question as { id?: string; kind?: string; prompt?: string; options?: Array<{ id: string; text: string }> } | undefined;
    if (!pq?.kind) return null;
    const box = el('div', 'fw-q wait');
    box.append(el('p', 'fw-q__prompt', pq.prompt ?? 'What can you say about this line?'));
    const lock = el('button', 'btn btn--primary gm-solo__action', 'Lock in');
    lock.type = 'button';
    lock.disabled = true;
    let response: unknown = null;
    const choiceKinds = ['multiple_choice', 'odd_one_out', 'quote_technique', 'multi_select'];
    const opts: Array<{ id: string; b: HTMLButtonElement }> = [];
    if (choiceKinds.includes(pq.kind) && pq.options?.length) {
      const many = pq.kind === 'multi_select';
      const picked = new Set<string>();
      pq.options.forEach((o, i) => {
        const b = el('button', 'fw-opt');
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.append(el('span', `key k${(i % 4) + 1}`, OPT_KEYS[i] ?? String(i + 1)), el('span', '', o.text));
        b.addEventListener('click', () => {
          if (!many) picked.clear();
          if (picked.has(o.id)) picked.delete(o.id);
          else picked.add(o.id);
          opts.forEach((x) => x.b.setAttribute('aria-pressed', String(picked.has(x.id))));
          response = { selected: [...picked] };
          lock.disabled = !picked.size;
        });
        opts.push({ id: o.id, b });
        box.append(b);
      });
    } else if (pq.kind === 'true_false') {
      for (const [v, text] of [[true, 'True'], [false, 'False']] as const) {
        const b = el('button', 'fw-opt', text);
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          response = { value: v };
          box.querySelectorAll('.fw-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          lock.disabled = false;
        });
        box.append(b);
      }
    } else if (pq.kind === 'short_answer') {
      const input = el('input', 'gm-input fw-q__input');
      input.setAttribute('aria-label', 'Your answer');
      input.autocomplete = 'off';
      input.addEventListener('input', () => {
        response = { text: input.value };
        lock.disabled = !input.value.trim();
      });
      box.append(input);
    } else return null;
    lock.addEventListener('click', () => {
      if (lock.disabled || response === null) return;
      lock.disabled = true;
      lock.textContent = 'Checking…';
      void ctx
        .emit({ item: 'message_q', move: 'answer', response, time_ms: ctx.elapsedMs() }, { now: true })
        .then((r) => {
          const key = r.reveal?.key as { answer?: { type?: string; ids?: string[] }; explanation?: string } | undefined;
          const right = new Set(key?.answer?.type === 'choice' ? key.answer.ids ?? [] : []);
          const mine = new Set((response as { selected?: string[] }).selected ?? []);
          for (const o of opts) {
            o.b.disabled = true;
            o.b.classList.toggle('right', right.has(o.id));
            o.b.classList.toggle('wrong', !right.has(o.id) && mine.has(o.id));
            if (!right.has(o.id) && !mine.has(o.id)) o.b.classList.add('dim');
            if (!right.has(o.id) && mine.has(o.id)) void shake(o.b);
          }
          box.querySelectorAll('button.fw-opt, input').forEach((x) => ((x as HTMLButtonElement).disabled = true));
          if (r.correct) ctx.sfx.right();
          else ctx.sfx.wrong();
          ctx.toast(r.correct ? 'Right' : 'Not this one', r.correct ? 'good' : 'bad');
          if (key?.explanation) box.append(el('p', 'fw-why', key.explanation));
          stage = 'done';
          ctx.setActions([resultsButton()]);
        })
        .catch((err: unknown) => {
          lock.disabled = false;
          lock.textContent = 'Lock in';
          ctx.toast(err instanceof Error && err.message ? err.message : 'That didn’t send. Try again.', 'bad');
        });
    });
    return { box, lock };
  }

  /* ── Wiring ─────────────────────────────────────────────────────── */
  const onListClick = (ev: MouseEvent) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('.fw-clue');
    if (!b?.dataset.c || stage !== 'play') return;
    act = Number(b.dataset.c);
    ctx.sfx.click();
    paint();
  };
  list.addEventListener('click', onListClick);
  anyBtn.addEventListener('click', () => {
    act = null;
    paint();
  });
  hintBtn.addEventListener('click', () => void hint());

  paint();
  void enter(root);

  return {
    onKey(ev: KeyboardEvent): boolean {
      if (stage !== 'play' || ev.metaKey || ev.ctrlKey || ev.altKey) return false;
      const t = ev.target as HTMLElement | null;
      if ((ev.key === 'Enter' || ev.key === ' ') && t?.closest('button')) return false;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const m = moves[ev.key];
      if (m) {
        wrap.classList.add('kbd');
        cursor = { x: clampN(cursor.x + m[0]), y: clampN(cursor.y + m[1]) };
        paint();
        return true;
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        wrap.classList.add('kbd');
        tap(cursor);
        return true;
      }
      return false;
    },
    dispose(): void {
      disposed = true;
      list.removeEventListener('click', onListClick);
      ctx.setActions([]);
      root.remove();
    }
  };
}

/** Cells from a to b in one of the eight directions, or null. */
function lineCells(a: Pt, b: Pt): Pt[] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx && dy && Math.abs(dx) !== Math.abs(dy)) return null;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + Math.sign(dx) * i, y: a.y + Math.sign(dy) * i }));
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
