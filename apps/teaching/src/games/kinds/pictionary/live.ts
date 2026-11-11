import { el } from '@/quiz/dom';
import type { RoomView } from '../../core/room-protocol';
import { avatar, createLeaderboard, createRing, type Ring } from '../../live/board-parts';
import { registerLiveKind, type KindView, type KindViewApi } from '../../live/kind-views';
import { animate, countUp, flyTo } from '../../motion/motion';
import { createPad, paintStrokes, PEN_COLOURS, PEN_NAMES, type DrawnStroke, type Pad, type StrokeBatch } from './canvas';
import type { PictionaryBoardView, PictionaryPhoneView } from './rules';
import './pictionary.css';

/**
 * Pictionary on the board and the phone (approved mockup
 * docs/mockups/games/pictionary.html). Board: the paper with the drawing
 * arriving stroke by stroke, the blanks (first letters after 40 s), the ring,
 * and "Got it" initials ticking in; after the round the answer, the drawer's
 * points, the fastest three, and the drawing flying to the gallery. Phone:
 * the drawer's prompt, pad and pens; everyone else's guess box, private
 * history and the green "Got it!".
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Gallery drawings, by round, as PNG data URLs (this board's copy). */
const drawings = new Map<number, string>();
/**
 * Where the board sends each finished drawing to be kept (spec §4.1 media:
 * games/{lesson}/{game_id}/media/{play_id}/{item}). The launcher sets it when
 * the media endpoint is there; without it the gallery lives on this board.
 */
let saver: ((round: { n: number; item: string; answer: string; drawer: string; png: string }) => Promise<void> | void) | null = null;
export function setPictionarySaver(fn: typeof saver): void {
  saver = fn;
}

function blanksHtml(b: { lengths: number[]; first?: string[] } | undefined, answer?: string): string {
  if (answer) return answer.split(/\s+/).filter(Boolean).map((w) => `<span class="pc-word">${[...w].map((ch) => `<i class="is-shown">${esc(ch.toUpperCase())}</i>`).join('')}</span>`).join('');
  if (!b) return '';
  return b.lengths.map((n, wi) => `<span class="pc-word">${Array.from({ length: n }, (_, i) => (i === 0 && b.first?.[wi] ? `<i class="is-shown">${esc(b.first[wi] as string)}</i>` : '<i></i>')).join('')}</span>`).join('');
}

/** A square PNG of the drawing on paper. */
function snapshot(strokes: DrawnStroke[], size = 800): string | null {
  try {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (!g) return null;
    paintStrokes(g, strokes, size, true);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

/* ── Board ───────────────────────────────────────────────────────── */

function mountBoard(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'pc-board');
  host.append(root);
  const ring: Ring = createRing('pc-ring');
  const lb = createLeaderboard({ title: 'Top five' });
  let k: PictionaryBoardView | null = null;
  let mode = '';
  let paper: HTMLCanvasElement | null = null;
  let raf = 0;
  let strokes: DrawnStroke[] = [];
  let pad: Pad | null = null;
  const saved = new Set<number>();

  const paint = () => {
    raf = 0;
    if (!paper) return;
    const size = paper.clientWidth || 600;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (paper.width !== Math.round(size * dpr)) {
      paper.width = Math.round(size * dpr);
      paper.height = Math.round(size * dpr);
    }
    const g = paper.getContext?.('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintStrokes(g, strokes, size);
  };
  const schedule = () => {
    if (raf) return;
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(paint);
    else paint();
  };

  function renderRound(view: RoomView, v: PictionaryBoardView) {
    const key = `round:${v.n}`;
    const fresh = mode !== key;
    const prev = fresh ? null : k;
    mode = key;
    if (fresh) {
      pad?.dispose();
      pad = null;
      root.className = 'pc-board pc-board--round';
      root.innerHTML = `<div class="pc-eyebrow"><b>Round ${v.n} of ${v.of}</b><span class="pc-who"></span></div>
        <div class="pc-paper"><span class="pc-live"></span><canvas aria-label="The drawing"></canvas></div>
        <div class="pc-side"><div class="pc-hint"><span class="pc-kind"></span><div class="pc-blanks"></div><span class="pc-why"></span></div><div class="pc-gotbox"></div></div>
        <span class="pc-galbadge"><span class="pc-galic" aria-hidden="true"></span>Gallery <b class="pc-galn">0</b></span>`;
      paper = root.querySelector('.pc-paper canvas');
      root.querySelector('.pc-hint')!.after(ring.root);
      if (!api.calm()) {
        void animate(root.querySelector('.pc-paper'), [{ opacity: 0, transform: 'translateY(1.4em) rotate(-1.5deg) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 700 });
        void animate(root.querySelector('.pc-side'), [{ opacity: 0, transform: 'translateX(1.4em)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 120 });
      }
    }
    const drawing = v.phase === 'draw';
    const who = root.querySelector('.pc-who')!;
    who.textContent = `${v.drawer ?? ''} is drawing · guesses stay secret`;
    const live = root.querySelector('.pc-live')!;
    live.replaceChildren();
    if (v.drawer) live.append(v.drawer === 'Teacher' ? el('span', 'pc-tav', 'T') : avatar(v.drawer), document.createTextNode(`${v.drawer} drawing`));
    if (drawing) live.append(el('span', 'pc-dot'));
    root.querySelector('.pc-kind')!.textContent = v.shape === 'quote' ? 'Quote · guess the key words' : `Term · ${v.blanks?.lengths.length ?? 1} word${(v.blanks?.lengths.length ?? 1) === 1 ? '' : 's'}`;
    const blanks = root.querySelector('.pc-blanks')!;
    const bh = blanksHtml(v.blanks, v.answer && v.shape !== 'quote' ? v.answer : undefined);
    if (blanks.innerHTML !== bh) {
      const hadFirst = !!prev?.blanks?.first;
      blanks.innerHTML = bh;
      if (!hadFirst && v.blanks?.first && drawing) {
        api.sfx.ding();
        if (!api.calm()) blanks.querySelectorAll('.is-shown').forEach((n) => void animate(n, [{ transform: 'translateY(-0.7em)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500 }));
      }
    }
    root.querySelector('.pc-why')!.textContent = v.closed === 'void' ? 'No points this round' : v.answer ? (v.shape === 'quote' ? 'Key words of the quote' : 'Answer revealed') : v.blanks?.first ? 'First letters are showing' : 'First letters appear at 40 s';
    root.querySelector('.pc-galn')!.textContent = String(v.gallery.filter((g) => !g.void).length);

    // The drawing.
    strokes = v.strokes ?? [];
    schedule();

    // The teacher drawing from the laptop: a pad over the paper, and the prompt for the teacher only.
    if (drawing && v.teacher_drawing && v.prompt && !pad) {
      pad = createPad({ send: (b: StrokeBatch) => void api.control('stroke', b).catch(() => undefined), hint: 'Draw with the mouse' });
      root.querySelector('.pc-paper')!.append(pad.root);
      const tip = el('div', 'pc-tprompt');
      tip.innerHTML = `<span>Draw this · only on your screen</span><b>${esc(v.prompt)}</b>`;
      root.querySelector('.pc-side')!.prepend(tip);
    }
    if (!drawing && pad) {
      pad.lock(true);
      root.querySelector('.pc-tprompt')?.remove();
    }

    if (drawing && view.ends_at) ring.run(view.ends_at, (v.seconds ?? 75) * 1000, api.serverNow);
    else {
      ring.stop();
      ring.root.style.opacity = '0.3';
    }
    if (drawing) ring.root.style.opacity = '';

    const box = root.querySelector('.pc-gotbox')!;
    if (drawing) {
      if (!box.querySelector('.pc-got')) {
        box.innerHTML = `<div class="pc-got"><div class="pc-got-head"><h3>Got it</h3><span class="pc-g"><span class="pc-gn">0</span> guesses so far</span><span class="pc-n"><span class="pc-gotn">0</span><small> / ${v.guessers}</small></span></div><div class="pc-chips"><p class="pc-empty">Nobody yet. Only right answers appear here, never the guesses.</p></div></div>`;
      }
      box.querySelector('.pc-gn')!.textContent = String(v.guesses);
      const chips = box.querySelector('.pc-chips')!;
      const had = prev?.got.length ?? 0;
      if (v.got.length) chips.querySelector('.pc-empty')?.remove();
      v.got.forEach((g, i) => {
        if (chips.querySelector(`[data-i="${g.initials}"]`)) return;
        const chip = el('div', `pc-chip${i < 3 ? ' is-top' : ''}`);
        chip.dataset.i = g.initials;
        chip.append(avatar(g.initials), document.createTextNode(g.initials), el('span', 'pc-t', `${g.s} s`));
        chips.append(chip);
        if (i >= had && prev) {
          api.sfx.coin();
          if (!api.calm()) void animate(chip, [{ opacity: 0, transform: 'translateY(0.9em) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 520 });
        }
      });
      const n = box.querySelector<HTMLElement>('.pc-gotn')!;
      if (n.textContent !== String(v.got.length)) countUp(n, had, v.got.length, api.calm() ? 1 : 300);
    } else if (v.answer !== undefined || v.closed) {
      if (!box.querySelector('.pc-sum')) {
        const paperBox = root.querySelector('.pc-paper')!;
        if (v.closed === 'void') {
          const stamp = el('div', 'pc-void');
          stamp.innerHTML = 'Disqualified<small>Letters in the drawing · round void, no points</small>';
          paperBox.append(stamp);
          api.sfx.buzz();
          if (!api.calm()) void animate(stamp, [{ transform: 'translate(-50%, -50%) rotate(-9deg) scale(2.2)', opacity: 0 }, { transform: 'translate(-50%, -50%) rotate(-9deg) scale(1)', opacity: 1 }], { duration: 420 });
          box.innerHTML = '<div class="pc-got is-dim"><div class="pc-sum"><p class="pc-empty">No points this round.</p></div></div>';
        } else {
          const ans = el('div', `pc-answer${v.shape === 'quote' ? ' is-quote' : ''}`);
          ans.innerHTML = `<span>${v.closed === 'all' ? 'Everyone got it · it was' : 'It was'}</span><b>${esc(v.shape === 'quote' ? v.answer ?? '' : cap(v.answer ?? ''))}</b>`;
          paperBox.append(ans);
          api.sfx.reveal();
          if (!api.calm()) void animate(ans, [{ transform: 'translateY(2em) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650 });
          const fast = v.got.slice(0, 3);
          box.innerHTML = `<div class="pc-got"><div class="pc-sum"><div class="pc-drew"><span class="pc-dav"></span><span>${esc(v.drawer ?? '')} drew it<small>${v.got.length} of ${v.guessers} got it from the drawing</small></span><span class="pc-pts">+<span class="pc-dp">0</span></span></div><h4>Fastest</h4><div class="pc-fast">${
            fast.length ? fast.map((g) => `<div data-i="${esc(g.initials)}"><span class="pc-fav"></span><span>${esc(g.initials)}</span><span>${g.s} s</span></div>`).join('') : '<p class="pc-empty">Nobody got this one. A hard prompt: worth a second look in class.</p>'
          }</div></div></div>`;
          if (v.drawer) box.querySelector('.pc-dav')!.replaceWith(v.drawer === 'Teacher' ? el('span', 'pc-tav', 'T') : avatar(v.drawer));
          box.querySelectorAll<HTMLElement>('.pc-fast > div').forEach((d) => d.querySelector('.pc-fav')!.replaceWith(avatar(d.dataset.i ?? '')));
          countUp(box.querySelector<HTMLElement>('.pc-dp')!, 0, v.drawer_points ?? 0, api.calm() ? 1 : 900);
          if (!saved.has(v.n)) {
            saved.add(v.n);
            void keep(v);
          }
        }
      }
    }
  }

  async function keep(v: PictionaryBoardView) {
    const png = snapshot(v.strokes ?? []);
    if (!png) return;
    drawings.set(v.n, png);
    const entry = v.gallery.find((g) => g.n === v.n);
    try {
      await saver?.({ n: v.n, item: entry?.item ?? '', answer: v.answer ?? '', drawer: v.drawer ?? '', png });
    } catch {
      api.toast('That drawing didn’t save to the gallery. It’s still on this board.', 'bad');
    }
    const badge = root.querySelector('.pc-galbadge');
    const paperBox = root.querySelector('.pc-paper');
    if (badge && paperBox && !api.calm()) {
      const fly = el('img', 'pc-fly');
      fly.alt = '';
      fly.src = png;
      const rb = root.getBoundingClientRect();
      const rp = paperBox.getBoundingClientRect();
      const rg = badge.getBoundingClientRect();
      fly.style.width = `${rp.width}px`;
      fly.style.height = `${rp.height}px`;
      root.append(fly);
      api.sfx.whoosh();
      await flyTo(fly, { x: rp.left - rb.left, y: rp.top - rb.top }, { x: rg.left - rb.left, y: rg.top - rb.top }, { duration: 900, scale: 40 / Math.max(40, rp.width) });
      fly.remove();
    }
    api.toast('Saved to the gallery', 'good');
  }

  function renderStandings(view: RoomView, v: PictionaryBoardView) {
    if (mode !== 'standings') {
      mode = 'standings';
      pad?.dispose();
      pad = null;
      paper = null;
      root.className = 'pc-board pc-board--standings';
      root.replaceChildren();
      const lbBox = el('div', 'pc-lb');
      lbBox.append(el('h2', '', 'Top five'), lb.root);
      const gal = el('div', 'pc-gallery');
      gal.innerHTML = `<h3>Our drawings</h3><p>Saved with their prompts.</p>`;
      const frames = el('div', 'pc-frames');
      v.gallery.forEach((g, i) => {
        const f = el('figure', `pc-frame${g.void ? ' is-void' : ''}`);
        f.style.setProperty('--tilt', `${[-1.6, 1.2, -0.8][i % 3]}deg`);
        const src = drawings.get(g.n);
        f.innerHTML = `<div class="pc-pic">${g.void ? 'Round void' : src ? `<img alt="Drawing of ${esc(g.answer)}" src="${src}">` : '<span>On the board that drew it</span>'}<span class="pc-tape"></span></div><figcaption><b>${esc(g.answer)}</b><span>${esc(g.drawer)} · ${g.void ? 'disqualified' : `${g.got} of ${g.of} got it`}</span></figcaption>`;
        frames.append(f);
        if (!api.calm()) void animate(f, [{ opacity: 0, transform: 'translateY(2em) rotate(4deg) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 750, delay: i * 160 });
      });
      gal.append(frames);
      root.append(lbBox, gal);
    }
    lb.update(view.leaderboard);
  }

  function renderReady(v: PictionaryBoardView) {
    if (mode === 'ready') return;
    mode = 'ready';
    root.className = 'pc-board pc-board--ready';
    root.innerHTML = `<div class="pc-intro"><span class="gl-eyebrow">Pictionary</span><h2>One drawer, everyone else guesses</h2><p>The drawer sees the prompt on their phone. Guess on yours: only right answers reach the board, as initials. ${v.of} prompts.</p></div>`;
  }

  return {
    update(view) {
      const v = view.kind_view as PictionaryBoardView | undefined;
      if (!v || v.who !== 'board') return;
      if (v.phase === 'ready') renderReady(v);
      else if (v.phase === 'standings') renderStandings(view, v);
      else renderRound(view, v);
      k = v;
    },
    controls(view) {
      const v = view.kind_view as PictionaryBoardView | undefined;
      if (!v || v.who !== 'board' || view.phase !== 'playing') return [];
      const more = v.deck_left > 0;
      switch (v.phase) {
        case 'ready':
          return [
            { label: 'Teacher draws', name: 'teacher_draws' },
            { label: 'Start round', name: 'next_round', primary: true, key: ' ' }
          ];
        case 'draw':
          return [
            { label: 'Disqualify drawing', name: 'disqualify' },
            { label: '+15 s', name: 'more_time' },
            { label: 'End round', name: 'end_round', primary: true }
          ];
        case 'reveal':
          return [{ label: more ? 'Leaderboard' : 'Leaderboard and gallery', name: 'standings', primary: !more }, ...(more ? [{ label: 'Next round', name: 'next_round', primary: true, key: ' ' }] : [])];
        case 'standings':
          return more
            ? [
                { label: 'Teacher draws', name: 'teacher_draws' },
                { label: 'Next round', name: 'next_round', primary: true, key: ' ' }
              ]
            : [{ label: 'Final scores', name: 'final', primary: true }];
      }
    },
    dispose() {
      ring.stop();
      pad?.dispose();
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      root.remove();
    }
  };
}

/* ── Phone ───────────────────────────────────────────────────────── */

function mountPhone(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'pc-phone');
  host.append(root);
  let v: PictionaryPhoneView | null = null;
  let mode = '';
  let pad: Pad | null = null;
  let pen = { c: 0, w: 0 };
  let bar: HTMLElement | null = null;
  let raf = 0;
  let sending = false;

  const tickBar = () => {
    raf = 0;
    if (!bar || !v?.started_at || !v.seconds || v.phase !== 'draw') return;
    const left = Math.max(0, v.started_at + v.seconds * 1000 - api.serverNow());
    (bar.firstElementChild as HTMLElement).style.transform = `scaleX(${(left / (v.seconds * 1000)).toFixed(4)})`;
    bar.classList.toggle('is-low', left < 10_000);
    if (left > 0 && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tickBar);
  };
  const timerBar = () => {
    bar = el('div', 'gl-bar pc-bar');
    bar.append(el('i'));
    bar.setAttribute('aria-hidden', 'true');
    if (!raf) tickBar();
    return bar;
  };
  const btn = (label: string, cls: string, on: () => void) => {
    const b = el('button', `btn ${cls}`, label);
    b.type = 'button';
    b.addEventListener('click', on);
    return b;
  };

  function drawerScreen(p: PictionaryPhoneView) {
    root.className = 'pc-phone';
    root.replaceChildren(timerBar());
    const card = el('div', 'pc-prompt');
    card.innerHTML = `<span>Draw this · only you can see it</span><b class="${p.shape === 'quote' ? 'is-quote' : ''}">${esc(p.shape === 'quote' ? p.prompt ?? '' : cap(p.prompt ?? ''))}</b><small>Pictures only: no letters or numbers.</small>`;
    pad?.dispose();
    const item = p.item ?? '';
    pad = createPad({
      send: (b) => {
        void api.move({ item, move: 'draw', response: b }).catch((e: unknown) => {
          if (e instanceof Error && /full/i.test(e.message)) api.toast(e.message, 'bad');
        });
      }
    });
    pad.setPen(pen.c, pen.w);
    const tools = el('div', 'pc-tools');
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', 'Pen');
    PEN_COLOURS.forEach((colour, c) => {
      const b = el('button', 'pc-sw');
      b.type = 'button';
      b.setAttribute('aria-label', `${PEN_NAMES[c]} pen`);
      b.setAttribute('aria-pressed', String(pen.c === c));
      const dot = el('i');
      dot.style.background = colour;
      b.append(dot);
      b.addEventListener('click', () => {
        pen = { ...pen, c };
        pad?.setPen(pen.c, pen.w);
        tools.querySelectorAll('.pc-sw').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        api.sfx.click();
      });
      tools.append(b);
    });
    tools.append(el('span', 'pc-sep'));
    ['Thin', 'Thick'].forEach((label, w) => {
      const b = el('button', 'pc-wd');
      b.type = 'button';
      b.setAttribute('aria-label', `${label} pen`);
      b.setAttribute('aria-pressed', String(pen.w === w));
      const dot = el('i');
      dot.style.width = dot.style.height = w ? '14px' : '6px';
      b.append(dot);
      b.addEventListener('click', () => {
        pen = { ...pen, w };
        pad?.setPen(pen.c, pen.w);
        tools.querySelectorAll('.pc-wd').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        api.sfx.click();
      });
      tools.append(b);
    });
    const count = el('div', 'pc-count');
    count.innerHTML = `<b class="pc-gotn">${p.got_count}</b> of ${p.guessers} got it so far`;
    root.append(card, pad.root, tools, count);
    api.setActions?.([btn('Undo', 'btn--secondary', () => pad?.undo()), btn('Clear', 'btn--secondary', () => pad?.clear())]);
  }

  function guessScreen(p: PictionaryPhoneView) {
    root.className = 'pc-phone';
    root.replaceChildren(timerBar());
    const role = el('div', 'pc-role');
    role.append(p.drawer === 'Teacher' ? el('span', 'pc-tav', 'T') : avatar(p.drawer ?? ''), el('span', '', ''));
    (role.lastChild as HTMLElement).innerHTML = `<b>${esc(p.drawer ?? '')}</b> is drawing. Watch the board.`;
    const h = el('p', 'pc-h', p.shape === 'quote' ? 'Which line is it?' : 'What is being drawn?');
    const blanks = el('div', 'pc-pblanks');
    blanks.setAttribute('aria-label', `Letter blanks: ${(p.blanks?.lengths ?? []).join(', ')} letters`);
    blanks.innerHTML = blanksHtml(p.blanks);
    const sub = el('p', 'pc-sub', p.shape === 'quote' ? 'Type the key words of the quote.' : 'Type as many guesses as you like. Only you see them.');
    const hist = el('div', 'pc-hist');
    root.append(role, h, blanks, sub, hist);
    paintHistory(p);
    const form = el('form', 'pc-guessrow');
    form.setAttribute('autocomplete', 'off');
    const input = el('input', 'gm-input pc-input');
    input.name = 'g';
    input.placeholder = 'Your guess';
    input.setAttribute('aria-label', 'Your guess');
    input.setAttribute('enterkeyhint', 'send');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.spellcheck = false;
    input.maxLength = 120;
    const go = el('button', 'btn btn--primary', 'Guess');
    go.type = 'submit';
    form.append(input, go);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || sending || !v?.item) return;
      sending = true;
      input.value = '';
      input.focus({ preventScroll: true });
      void api
        .move({ item: v.item, move: 'guess', response: { text } })
        .then((r) => {
          if (r.correct) {
            api.sfx.ding();
            return;
          }
          const near = v?.mine?.tries.at(-1);
          if (near?.close) api.toast('Close! Part of it is right. Keep going.');
          else if (!api.calm()) void animate(input, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 300 });
        })
        .catch((e: unknown) => api.toast(e instanceof Error ? e.message : 'That didn’t go through.', 'bad'))
        .finally(() => {
          sending = false;
        });
    });
    api.setActions?.([form]);
  }

  function paintHistory(p: PictionaryPhoneView) {
    const hist = root.querySelector('.pc-hist');
    if (!hist) return;
    hist.innerHTML = (p.mine?.tries ?? [])
      .slice()
      .reverse()
      .map((t) => `<div class="${t.close ? 'is-close' : 'is-no'}"><span>${esc(t.text)}</span><em>${t.close ? 'Close!' : 'Not it'}</em></div>`)
      .join('');
  }

  function gotScreen(p: PictionaryPhoneView) {
    root.className = 'pc-phone is-green';
    root.innerHTML = `<div class="pc-gotit"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" fill="rgba(255,255,255,.18)"/><path class="pc-tk" d="M36 62l16 16 32-36" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${api.calm() ? 0 : 1}"/></svg><span class="pc-gbig">Got it!</span><span class="pc-gpts">+${p.mine?.points ?? 0}</span><span class="pc-gans">${esc(cap(p.answer ?? ''))}</span><span class="pc-gsub">${p.mine?.s ?? 0} s · hidden from everyone else</span></div><div class="pc-watch">Keep watching: <b class="pc-gotn">${p.got_count}</b> of ${p.guessers} got it</div>`;
    const tk = root.querySelector('.pc-tk');
    if (tk && !api.calm()) void animate(tk, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 500, delay: 150, fill: 'forwards' });
    api.setActions?.([]);
  }

  function waitScreen(html: string) {
    root.className = 'pc-phone';
    root.innerHTML = `<div class="pc-wait">${html}</div>`;
    api.setActions?.([]);
  }

  function render(p: PictionaryPhoneView) {
    const got = !!p.mine?.got;
    const key = `${p.phase}:${p.n}:${p.role}:${got}`;
    if (p.phase === 'draw' && p.role === 'drawer') {
      if (mode !== key) drawerScreen(p);
      else root.querySelector('.pc-gotn')!.textContent = String(p.got_count);
    } else if (p.phase === 'draw' && p.role === 'guesser') {
      if (got) {
        if (mode !== key) {
          gotScreen(p);
          if (!api.calm()) void animate(root.querySelector('.pc-gotit svg'), [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520 });
        } else root.querySelector('.pc-gotn')!.textContent = String(p.got_count);
      } else if (mode !== key) guessScreen(p);
      else {
        const b = root.querySelector('.pc-pblanks');
        const bh = blanksHtml(p.blanks);
        if (b && b.innerHTML !== bh) b.innerHTML = bh;
        paintHistory(p);
      }
    } else if (p.phase === 'reveal') {
      if (mode === key) return;
      pad?.lock(true);
      if (p.closed === 'void') waitScreen(`<span>Round void</span><div class="pc-big is-bad">Disqualified</div><p class="pc-sub">${p.role === 'drawer' ? 'The teacher saw letters in your drawing. Pictures only next time.' : 'The drawing had letters in it. No points this round.'}</p>`);
      else if (p.role === 'drawer' && p.drew) {
        const mini = pad?.strokes() ?? [];
        waitScreen(`<span>Round over</span><div class="pc-big is-good">+${p.drew.points}</div><span class="pc-ans">${p.drew.got} of ${p.guessers} got it from your drawing</span><div class="pc-mini"><canvas width="240" height="240" aria-label="Your drawing"></canvas></div></div><div class="pc-break"><div><span>Points per guesser</span><b>20</b></div><div><span>First to get it</span><b>${p.drew.first ? `${esc(p.drew.first.initials)} · ${p.drew.first.s} s` : 'nobody'}</b></div><div><span>Saved to the class gallery</span><b>Yes</b>`);
        const g = root.querySelector<HTMLCanvasElement>('.pc-mini canvas')?.getContext?.('2d');
        if (g) paintStrokes(g, mini, 240, true);
      } else if (got) {
        const w = root.querySelector('.pc-watch');
        if (w) w.innerHTML = `Round over: <b>${p.got_count}</b> of ${p.guessers} got it`;
        else gotScreen(p);
      } else {
        const tries = p.mine?.tries ?? [];
        const closest = tries.find((t) => t.close) ?? tries[tries.length - 1];
        waitScreen(`<span>Round over · it was</span><span class="pc-ans${p.shape === 'quote' ? ' is-quote' : ''}">${esc(cap(p.answer ?? ''))}</span><p class="pc-sub">${tries.some((t) => t.close) ? 'You were close. Next one.' : 'No points this round.'}</p>${
          tries.length ? `</div><div class="pc-break"><div><span>Your guesses</span><b>${tries.length}</b></div><div><span>Closest</span><b>${esc(closest?.text ?? '')}</b></div>` : ''
        }`);
      }
      pad?.dispose();
      pad = null;
    } else if (p.phase === 'standings') {
      if (mode !== key) waitScreen(`<span>Leaderboard on the board</span><div class="pc-big">${p.score}</div><p class="pc-sub">points so far</p>`);
    } else if (mode !== key) {
      waitScreen(`<span>Pictionary</span><div class="pc-big">Get ready</div><p class="pc-sub">When it’s your turn to draw, the prompt appears here. Everyone else guesses.</p>`);
    }
    mode = key;
  }

  return {
    update(view) {
      const p = view.kind_view as PictionaryPhoneView | undefined;
      if (!p || p.who !== 'phone') return;
      v = p;
      render(p);
      if (p.phase === 'draw' && !raf) tickBar();
    },
    dispose() {
      pad?.dispose();
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      root.remove();
    }
  };
}

registerLiveKind('pictionary', { board: mountBoard, phone: mountPhone });
