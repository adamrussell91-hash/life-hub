import { el } from '@/quiz/dom';
import type { RoomView } from '../../core/room-protocol';
import { avatar, createLeaderboard, createRing, type Ring } from '../../live/board-parts';
import { registerLiveKind, type KindView, type KindViewApi } from '../../live/kind-views';
import { animate, countUp } from '../../motion/motion';
import { BATTLES_ITEM, MIN_ANSWERS, type BattlesBoardView, type BattlesPhoneView } from './rules';
import './battles.css';

/**
 * Short-answer battles on the board and the phone (approved mockup
 * docs/mockups/games/battles.html). Board: the prompt and a tile per writer
 * (word count and a pulse, never text); then the judgement counter, the
 * reliability meter and the class scale forming as unnamed dots; Spotlight's
 * Answer A vs Answer B; the top three with the chips that won; sharpest judges.
 * Phone: write and hand in; two anonymous answers a battle (never your own)
 * with optional chips; your judging score and, when the scale is reliable,
 * your third.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const THIRD: Record<string, string> = { top: 'Top third', middle: 'Middle third', bottom: 'Lower third' };

/* ── Board ───────────────────────────────────────────────────────── */

function mountBoard(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'bt-board');
  host.append(root);
  const ring: Ring = createRing('bt-ring');
  const lb = createLeaderboard({ title: 'Sharpest judges' });
  let mode = '';
  let last: BattlesBoardView | null = null;

  const head = (eyebrow: string, q: string, crit: string) =>
    `<div class="bt-head"><span class="gl-eyebrow">${esc(eyebrow)}</span><p class="bt-q">${esc(q)}</p><div class="bt-crit">${crit}</div></div>`;

  function write(view: RoomView, v: BattlesBoardView) {
    if (mode !== 'write') {
      mode = 'write';
      root.className = 'bt-board bt-board--write';
      root.innerHTML = `${head(`Write · ${v.minutes} minutes · on your phone`, v.prompt, `Judged on: <b>${esc(v.criterion)}</b>`)}<div class="bt-grid"></div><div class="bt-foot"><span><b class="bt-tot">0</b> words written</span><span><b class="bt-inn">0</b> of <span class="bt-of">0</span> handed in</span><span>Answers stay hidden until the battles</span></div>`;
      root.querySelector('.bt-head')!.after(ring.root);
    }
    if (view.ends_at) ring.run(view.ends_at, v.minutes * 60_000, api.serverNow);
    const grid = root.querySelector('.bt-grid')!;
    for (const w of v.writers ?? []) {
      let t = grid.querySelector<HTMLElement>(`[data-i="${CSS.escape(w.initials)}"]`);
      if (!t) {
        t = el('div', 'bt-tile');
        t.dataset.i = w.initials;
        const meta = el('span', 'bt-meta');
        meta.innerHTML = `<b>${esc(w.initials)}</b><span><span class="bt-n">0</span> words</span>`;
        const bar = el('span', 'bt-wbar');
        bar.append(el('i'));
        t.append(avatar(w.initials), meta, el('span', 'bt-pulse'), bar);
        grid.append(t);
      }
      const n = t.querySelector<HTMLElement>('.bt-n')!;
      n.textContent = String(w.words);
      (t.querySelector('.bt-wbar i') as HTMLElement).style.transform = `scaleX(${Math.min(1, w.words / 80).toFixed(3)})`;
      const wasIn = t.classList.contains('is-in');
      t.classList.toggle('is-in', w.in);
      t.classList.toggle('is-typing', w.typing);
      if (w.in && !wasIn && last) {
        api.sfx.click();
        if (!api.calm()) void animate(t, [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'none' }], { duration: 420 });
      }
    }
    root.querySelector('.bt-tot')!.textContent = (v.total_words ?? 0).toLocaleString();
    root.querySelector('.bt-inn')!.textContent = String(v.handed_in ?? 0);
    root.querySelector('.bt-of')!.textContent = String(v.writers?.length ?? 0);
  }

  function battle(v: BattlesBoardView) {
    if (mode !== 'battle') {
      mode = 'battle';
      ring.stop();
      root.className = 'bt-board bt-board--battle';
      root.innerHTML = `${head(`Battle round 1 of ${v.rounds}`, v.criterion, 'Every phone gets two anonymous answers, never its own. Tap the better one.')}
        <div class="bt-cards"><div class="bt-card bt-count"><span class="bt-num">0</span><span class="bt-lbl">judgements made</span></div>
        <div class="bt-card bt-clash" aria-hidden="true"><div class="bt-mini is-l"><i></i><i></i><i></i><i></i></div><span class="bt-vs">VS</span><div class="bt-mini is-r"><i></i><i></i><i></i><i></i></div></div>
        <div class="bt-card bt-rel"><div class="bt-reltop"><span>Scale reliability</span><b class="bt-rv">0.00</b></div><div class="bt-meter"><i></i><u></u></div><span class="bt-note">Reliable from 0.70</span></div></div>
        <div class="bt-scale"><span class="bt-cap">The class scale is forming · ${v.answers} answers, no names</span><span class="bt-track"></span><div class="bt-dots"></div><span class="bt-ends"><span>Weaker</span><span>Stronger</span></span></div>
        <div class="bt-foot"><span><b class="bt-judging">0</b> judging</span><span><b class="bt-fin">0</b> finished</span></div>`;
      if (!api.calm()) root.querySelectorAll('.bt-card').forEach((c, i) => void animate(c, [{ opacity: 0, transform: 'translateY(1em)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: i * 120 }));
      api.sfx.whoosh();
    }
    root.querySelector('.bt-head .gl-eyebrow')!.textContent = `Battle round ${v.round ?? 1} of ${v.rounds ?? 5}`;
    const num = root.querySelector<HTMLElement>('.bt-num')!;
    const before = Number(num.textContent) || 0;
    if (before !== (v.judgements ?? 0)) {
      countUp(num, before, v.judgements ?? 0, api.calm() ? 1 : 300);
      if (!api.calm()) clash();
    }
    const r = v.reliability ?? 0;
    root.querySelector('.bt-rv')!.textContent = r.toFixed(2);
    (root.querySelector('.bt-meter i') as HTMLElement).style.transform = `scaleX(${Math.max(0, Math.min(1, r)).toFixed(3)})`;
    const rel = root.querySelector('.bt-rel')!;
    if (v.reliable && !rel.classList.contains('is-ok')) {
      rel.classList.add('is-ok');
      rel.querySelector('.bt-note')!.textContent = 'Reliable: ready for results';
      api.sfx.ding();
    }
    root.querySelector('.bt-judging')!.textContent = String(v.judging ?? 0);
    root.querySelector('.bt-fin')!.textContent = String(v.finished ?? 0);
    const dots = root.querySelector('.bt-dots')!;
    const list = v.dots ?? [];
    while (dots.children.length < list.length) dots.append(el('span', 'bt-dot'));
    const lo = Math.min(-2.5, ...list);
    const hi = Math.max(2.5, ...list);
    list.forEach((t, i) => {
      const d = dots.children[i] as HTMLElement;
      d.style.left = `${(((t - lo) / (hi - lo)) * 100).toFixed(2)}%`;
      d.style.top = `${50 + ((i % 3) - 1) * 28}%`;
    });
  }

  function clash() {
    const st = root.querySelector<HTMLElement>('.bt-clash');
    if (!st || st.dataset.busy) return;
    st.dataset.busy = '1';
    const l = st.querySelector('.is-l')!;
    const r = st.querySelector('.is-r')!;
    const win = Math.random() < 0.5 ? l : r;
    [l, r].forEach((n) => n.classList.remove('is-win'));
    void animate(l, [{ transform: 'translateX(-4em) rotate(-6deg)', opacity: 0 }, { transform: 'translateX(0.9em)', opacity: 1, offset: 0.55 }, { transform: 'none', opacity: 1 }], { duration: 520 });
    void animate(r, [{ transform: 'translateX(4em) rotate(6deg)', opacity: 0 }, { transform: 'translateX(-0.9em)', opacity: 1, offset: 0.55 }, { transform: 'none', opacity: 1 }], { duration: 520 }).then(() => {
      win.classList.add('is-win');
      setTimeout(() => delete st.dataset.busy, 500);
    });
  }

  function spotlight(v: BattlesBoardView) {
    const s = v.spot!;
    const key = `spot:${s.a.length}:${s.b.length}:${s.a.slice(0, 20)}`;
    if (mode !== key) {
      mode = key;
      ring.stop();
      root.className = 'bt-board bt-board--spot';
      root.innerHTML = `<div class="bt-spoth"><span class="gl-eyebrow">${v.phase === 'too_few' ? 'Spotlight · two answers from the class' : 'Spotlight · the closest battle so far'}</span><h2>${esc(v.criterion || 'Which answer is better?')} Talk with your partner.</h2></div>
        <div class="bt-side is-a"><span class="bt-tag gm-glyph--k1">Answer A</span><div class="bt-txt">${esc(s.a)}</div><div class="bt-split"></div></div>
        <div class="bt-bigvs" aria-hidden="true">VS</div>
        <div class="bt-side is-b"><span class="bt-tag gm-glyph--k4">Answer B</span><div class="bt-txt">${esc(s.b)}</div><div class="bt-split"></div></div>`;
      api.sfx.reveal();
      if (!api.calm()) {
        void animate(root.querySelector('.bt-side.is-a'), [{ transform: 'translateX(-5em)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700 });
        void animate(root.querySelector('.bt-side.is-b'), [{ transform: 'translateX(5em)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700 });
        void animate(root.querySelector('.bt-bigvs'), [{ transform: 'scale(0) rotate(-90deg)' }, { transform: 'scale(1.2) rotate(8deg)', offset: 0.7 }, { transform: 'none' }], { duration: 700, delay: 380, fill: 'backwards' });
      }
    }
    if (s.split && !root.classList.contains('is-split')) {
      root.classList.add('is-split');
      const n = (s.a_n ?? 0) + (s.b_n ?? 0) || 1;
      [
        ['.is-a', s.a_n ?? 0, s.a_chips ?? [], 'k1'],
        ['.is-b', s.b_n ?? 0, s.b_chips ?? [], 'k4']
      ].forEach(([sel, count, chips, k]) => {
        const box = root.querySelector(`.bt-side${sel} .bt-split`)!;
        box.innerHTML = `<div class="bt-row"><b>${count}</b> ${count === 1 ? 'judge' : 'judges'} chose it <span class="bt-chips">${(chips as string[]).map((c) => `<span class="bt-chip">${esc(c)}</span>`).join('')}</span></div><div class="bt-bar"><i class="gm-glyph--${k}"></i></div>`;
        const bar = box.querySelector<HTMLElement>('.bt-bar i')!;
        bar.style.transform = `scaleX(${((count as number) / n).toFixed(3)})`;
      });
      api.sfx.whoosh();
    }
  }

  function tooFew(v: BattlesBoardView) {
    if (mode === 'too_few') return;
    mode = 'too_few';
    ring.stop();
    root.className = 'bt-board bt-board--few';
    root.innerHTML = `<div class="bt-few"><span class="gl-eyebrow">${v.answers ?? 0} ${v.answers === 1 ? 'answer' : 'answers'} written</span><h2>Need at least ${MIN_ANSWERS} answers to battle</h2><p>Spotlight still works: put two answers side by side and talk about which is better.</p></div>`;
  }

  function noList() {
    if (mode === 'no_list') return;
    mode = 'no_list';
    root.className = 'bt-board bt-board--few';
    root.innerHTML = `<div class="bt-few"><span class="gl-eyebrow">Short-answer battles</span><h2>This class needs a list to play</h2><p>Battles keeps answers anonymous by knowing who wrote what. Add the class list, then open the game again.</p></div>`;
  }

  function resultsScreen(v: BattlesBoardView) {
    if (mode !== 'results') {
      mode = 'results';
      ring.stop();
      root.className = 'bt-board bt-board--results';
      const top = v.top ?? [];
      root.innerHTML = `<div class="bt-resh"><div><span class="gl-eyebrow">Results · ${v.judgements ?? 0} judgements</span><h2>The class’s top three answers</h2></div><span class="gl-pill${v.reliable ? ' is-ok' : ''}">${v.reliable ? 'Scale reliable' : 'Scale still settling'} · ${(v.reliability ?? 0).toFixed(2)}</span></div>
        <div class="bt-top3">${top
          .map(
            (t, i) =>
              `<div class="bt-res is-r${i + 1}"><div class="bt-rtop"><span class="bt-medal is-m${i + 1}">${i + 1}</span>${['First', 'Second', 'Third'][i]}</div><div class="bt-txt">${esc(t.text)}</div>${
                t.chips.length ? `<span class="bt-won">Won on</span><div class="bt-chips">${t.chips.map(([c, n]) => `<span class="bt-chip">${esc(c)} <b>${n}</b></span>`).join('')}</div>` : ''
              }</div>`
          )
          .join('')}</div>`;
      api.sfx.reveal();
      if (!api.calm()) [...root.querySelectorAll('.bt-res')].reverse().forEach((c, n) => void animate(c, [{ opacity: 0, transform: 'translateY(3em) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 300 + n * 650, fill: 'backwards' }));
    }
  }

  function judges(v: BattlesBoardView) {
    if (mode !== 'judges') {
      mode = 'judges';
      root.className = 'bt-board bt-board--judges';
      root.replaceChildren();
      const h = el('div', 'bt-jh');
      h.innerHTML = '<span class="gl-eyebrow">Sharpest judges</span><h2>Points for agreeing with the class scale</h2><p>Close calls are worth more than easy ones.</p>';
      root.append(h, lb.root);
      api.sfx.fanfare?.();
    }
    lb.update((v.judges ?? []).map((j, i) => ({ initials: j.initials, score: j.points, rank: i + 1 })));
  }

  function teacher(v: BattlesBoardView) {
    if (mode === 'teacher') return;
    mode = 'teacher';
    root.className = 'bt-board bt-board--teacher';
    const t = v.teacher;
    if (!t) {
      root.innerHTML = '<div class="bt-few"><h2>Teacher view is on your laptop</h2><p>Open the game on the teacher screen to see the scale and the judging spread.</p></div>';
      return;
    }
    const max = Math.max(1, ...t.bins);
    root.innerHTML = `<div class="bt-tv"><div><span class="gl-eyebrow">Teacher only · not for the projector</span><h3>Answer scale · reliability ${(v.reliability ?? 0).toFixed(2)}</h3><ol class="bt-scalelist">${t.scale
      .map((r) => `<li><span class="bt-theta">${r.theta > 0 ? '+' : ''}${r.theta.toFixed(2)}</span><span>${esc(r.text)}${r.text.length >= 140 ? '…' : ''}</span></li>`)
      .join('')}</ol></div><div class="bt-ins"><h3>Judging accuracy</h3><div class="bt-row2"><b>Agreement with the final scale</b><div class="bt-hist">${t.bins
      .map((n, k) => `<div><i style="height:${((n / max) * 4).toFixed(2)}em"></i>${k}/${t.bins.length - 1}</div>`)
      .join('')}</div></div><div class="bt-row2"><b>Check in with: ${esc(t.low.join(', ') || 'nobody')}</b><span>Agreed on two in five or fewer.</span></div><div class="bt-row2"><b>Every call right: ${esc(t.perfect.slice(0, 8).join(', ') || 'nobody')}</b><span>Good pairing partners for the next redraft.</span></div><div class="bt-row2"><b>Written answers → To mark</b><span>Every answer folds into the class evidence with its place on the scale.</span></div></div></div>`;
  }

  return {
    update(view) {
      const v = view.kind_view as BattlesBoardView | undefined;
      if (!v || v.who !== 'board') return;
      if (v.phase === 'no_list') noList();
      else if (v.phase === 'write') write(view, v);
      else if (v.screen === 'spotlight' && v.spot) spotlight(v);
      else if (v.phase === 'too_few') tooFew(v);
      else if (v.phase === 'battle') battle(v);
      else if (v.screen === 'judges') judges(v);
      else if (v.screen === 'teacher') teacher(v);
      else resultsScreen(v);
      if (v.screen !== 'spotlight') root.classList.remove('is-split');
      last = v;
    },
    controls(view) {
      const v = view.kind_view as BattlesBoardView | undefined;
      if (!v || v.who !== 'board' || view.phase !== 'playing') return [];
      if (v.phase === 'write') return [{ label: '+1 min', name: 'more_time' }, { label: 'Start battles', name: 'battle', primary: true }];
      if (v.screen === 'spotlight') {
        const back = v.phase === 'too_few' ? [{ label: 'Another pair', name: 'next_pair' }] : [];
        return [...back, ...(v.spot && !v.spot.split && v.phase !== 'too_few' ? [{ label: 'Show the split', name: 'show_split' }] : []), { label: v.phase === 'battle' ? 'Back to battles' : 'Back', name: 'back', primary: true }];
      }
      if (v.phase === 'too_few') return [{ label: 'Spotlight', name: 'spotlight', primary: true }, { label: 'Finish', name: 'final' }];
      if (v.phase === 'battle') return [{ label: 'Spotlight', name: 'spotlight' }, { label: 'Show results', name: 'results', primary: true }];
      if (v.phase === 'results') {
        // Teacher view only where the view carries it (the teacher's own screen), never as a dead end on the board.
        if (v.screen === 'judges') return [{ label: 'Top answers', name: 'back' }, ...(v.teacher ? [{ label: 'Teacher view', name: 'teacher' }] : []), { label: 'Final scores', name: 'final', primary: true }];
        if (v.screen === 'teacher') return [{ label: 'Top answers', name: 'back' }, { label: 'Final scores', name: 'final', primary: true }];
        return [{ label: 'Spotlight', name: 'spotlight' }, { label: 'Sharpest judges', name: 'judges', primary: true }];
      }
      return [];
    },
    dispose() {
      ring.stop();
      root.remove();
    }
  };
}

/* ── Phone ───────────────────────────────────────────────────────── */

function mountPhone(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'bt-phone');
  host.append(root);
  let mode = '';
  let v: BattlesPhoneView | null = null;
  let text = '';
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pick: 'left' | 'right' | null = null;
  let chips = new Set<number>();
  let sending = false;
  let toasted = false;

  const btn = (label: string, cls: string, on: () => void, disabled = false) => {
    const b = el('button', `btn ${cls}`, label);
    b.type = 'button';
    b.disabled = disabled;
    b.addEventListener('click', on);
    return b;
  };
  const count = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

  const send = (handIn?: boolean) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    return api.move({ item: BATTLES_ITEM, move: 'answer', response: { text, ...(handIn !== undefined ? { hand_in: handIn } : {}) } });
  };

  function writeScreen(p: BattlesPhoneView) {
    const d = p.draft!;
    if (!mode.startsWith('write')) text = d.text;
    root.className = 'bt-phone';
    root.innerHTML = `<p class="bt-psub">Write · ${p.minutes} minutes</p><p class="bt-ph">${esc(p.prompt)}</p><div class="bt-pcrit">Judged on: ${esc(p.criterion)}</div>`;
    const ta = el('textarea', 'gm-input bt-ta');
    ta.placeholder = 'Write your answer here…';
    ta.setAttribute('aria-label', 'Your answer');
    ta.maxLength = 4000;
    ta.value = text;
    const wc = el('div', 'bt-wc');
    wc.innerHTML = `<span><b class="bt-mywc">${count(text)}</b> words · aim for 40 to 80</span>`;
    root.append(ta, wc);
    const hand = btn('Hand in', 'btn--primary', () => {
      if (!count(text)) return;
      api.sfx.lock?.();
      void send(true).catch((e: unknown) => api.toast(e instanceof Error ? e.message : 'That didn’t go through.', 'bad'));
    }, !count(text));
    ta.addEventListener('input', () => {
      text = ta.value;
      const n = count(text);
      wc.querySelector('.bt-mywc')!.textContent = String(n);
      hand.disabled = !n;
      if (saveTimer) clearTimeout(saveTimer);
      // Drafts go up every couple of seconds so nothing is lost and the board's word counts move.
      saveTimer = setTimeout(() => void send().catch(() => undefined), 1500);
    });
    api.setActions?.([hand]);
  }

  function handedScreen(p: BattlesPhoneView) {
    root.className = 'bt-phone';
    root.innerHTML = `<div class="bt-wait"><div class="bt-tick" aria-hidden="true">✓</div><span class="bt-psub">Handed in</span><div class="bt-big">${p.draft?.words ?? 0}</div><p class="bt-psub">words</p><p class="bt-psub">You can edit until the battles start.</p></div>`;
    api.setActions?.([btn('Edit my answer', 'btn--secondary', () => void send(false).catch(() => undefined))]);
  }

  function battleScreen(p: BattlesPhoneView) {
    const pair = p.pair!;
    root.className = 'bt-phone';
    root.innerHTML = `<div class="bt-prow"><p class="bt-psub">Battle ${(p.done ?? 0) + 1} of ${p.rounds}</p><span class="bt-pips">${Array.from({ length: p.rounds ?? 5 }, (_, i) => `<i class="${i < (p.done ?? 0) ? 'is-on' : ''}"></i>`).join('')}</span></div><p class="bt-ph bt-ph--crit">${esc(p.criterion)}</p>`;
    const list = el('div', 'bt-pair');
    (['left', 'right'] as const).forEach((side, i) => {
      const b = el('button', `bt-ans${pick === side ? ' is-sel' : pick ? ' is-off' : ''}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(pick === side));
      b.innerHTML = `<span class="bt-lab">Answer ${'AB'[i]}<span class="bt-pick">Your pick</span></span>${esc(pair[side].text)}`;
      b.addEventListener('click', () => {
        pick = side;
        api.sfx.click();
        battleScreen(p);
      });
      list.append(b);
    });
    root.append(list);
    if (pick && p.chips.length) {
      root.append(el('p', 'bt-psub', 'What made it better? Optional.'));
      const row = el('div', 'bt-pchips');
      p.chips.forEach((label, i) => {
        const c = el('button', 'bt-pchip', label);
        c.type = 'button';
        c.setAttribute('aria-pressed', String(chips.has(i)));
        c.addEventListener('click', () => {
          if (chips.has(i)) chips.delete(i);
          else chips.add(i);
          c.setAttribute('aria-pressed', String(chips.has(i)));
        });
        row.append(c);
      });
      root.append(row);
    }
    const lock = btn(pick ? `Lock in Answer ${pick === 'left' ? 'A' : 'B'}` : 'Tap the better answer', 'btn--primary', () => {
      if (!pick || sending) return;
      sending = true;
      lock.disabled = true;
      const winner = pair[pick].id;
      const sideChips = [...chips].sort((a, b) => a - b);
      api.sfx.lock?.();
      void api
        .move({ item: BATTLES_ITEM, move: 'judge', response: { left: pair.left.id, right: pair.right.id, winner, chips: { left: pick === 'left' ? sideChips : [], right: pick === 'right' ? sideChips : [] } } })
        .then(() => {
          pick = null;
          chips = new Set();
          if (!api.calm()) void animate(list, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-110%)', opacity: 0 }], { duration: 300, fill: 'forwards' });
        })
        .catch((e: unknown) => {
          api.toast(e instanceof Error ? e.message : 'That didn’t go through.', 'bad');
          lock.disabled = false;
        })
        .finally(() => {
          sending = false;
        });
    }, !pick);
    api.setActions?.([lock]);
  }

  function waitScreen(html: string) {
    root.className = 'bt-phone';
    root.innerHTML = `<div class="bt-wait">${html}</div>`;
    api.setActions?.([]);
  }

  function resultScreen(p: BattlesPhoneView) {
    const r = p.result!;
    const agreed = r.agree.filter(Boolean).length;
    const pct = r.agree.length ? Math.round((agreed / r.agree.length) * 100) : 0;
    root.className = 'bt-phone';
    root.innerHTML = `<div class="bt-wait bt-wait--top"><span class="bt-psub">Your judging score</span><div class="bt-big">${pct}%</div><p class="bt-psub">You agreed with the class on <b>${agreed} of ${r.agree.length}</b> battles.</p></div>
      <div class="bt-list">${r.agree.map((ok, i) => `<div><span>Battle ${i + 1}</span><span class="${ok ? 'is-ok' : 'is-no'}">${ok ? 'Agreed' : 'The class went the other way'}</span></div>`).join('') || '<div><span>No battles judged</span></div>'}
      <div class="bt-sum"><span>Judging points</span><b>${r.points}</b></div><div><span>Your place</span><b>${r.place} of ${r.of}</b></div></div>
      ${r.third ? `<div class="bt-third"><b>${THIRD[r.third]}</b><span>Where your own answer landed on the class scale.</span></div>` : ''}`;
    api.setActions?.([]);
    if (!toasted && r.points) {
      toasted = true;
      api.toast(`+${r.points} judging points`, 'good');
    }
  }

  function render(p: BattlesPhoneView) {
    if (p.phase === 'write') {
      const key = `write:${p.draft?.in}`;
      if (mode !== key) {
        if (p.draft?.in) handedScreen(p);
        else writeScreen(p);
      }
      mode = key;
      return;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (p.phase === 'no_list') {
      if (mode !== 'no_list') waitScreen('<span class="bt-psub">Short-answer battles</span><div class="bt-big bt-big--sm">Needs a class list</div><p class="bt-psub">Your teacher will set this up.</p>');
      mode = 'no_list';
      return;
    }
    if (p.phase === 'too_few') {
      const key = `few:${p.spotlight}`;
      if (mode !== key) waitScreen(`<span class="bt-psub">Need at least ${MIN_ANSWERS} answers to battle</span><div class="bt-big bt-big--sm">${p.spotlight ? 'Spotlight on the board' : 'Eyes on the board'}</div><p class="bt-psub">Talk about which answer is better.</p>`);
      mode = key;
      return;
    }
    if (p.phase === 'battle') {
      if (p.pair) {
        const key = `pair:${p.done}:${p.pair.left.id}:${p.pair.right.id}`;
        if (mode !== key) {
          pick = null;
          chips = new Set();
          battleScreen(p);
          if (mode.startsWith('pair:') && !api.calm()) void animate(root.querySelector('.bt-pair'), [{ transform: 'translateX(110%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420 });
        }
        mode = key;
      } else {
        const key = `done:${p.done}:${p.spotlight}`;
        if (mode !== key) waitScreen(`<div class="bt-tick" aria-hidden="true">✓</div><span class="bt-psub">All judged</span><div class="bt-big">${p.done} of ${p.rounds}</div><p class="bt-psub">Your picks stay private.</p><p class="bt-psub">${p.spotlight ? 'Spotlight on the board: talk about A and B.' : 'Results soon. Eyes on the board.'}</p>`);
        mode = key;
      }
      return;
    }
    if (p.phase === 'results' && p.result) {
      if (mode !== 'results') resultScreen(p);
      mode = 'results';
    }
  }

  return {
    update(view) {
      const p = view.kind_view as BattlesPhoneView | undefined;
      if (!p || p.who !== 'phone') return;
      v = p;
      render(p);
    },
    dispose() {
      if (saveTimer) clearTimeout(saveTimer);
      if (v?.phase === 'write' && saveTimer) void send().catch(() => undefined);
      root.remove();
    }
  };
}

registerLiveKind('battles', { board: mountBoard, phone: mountPhone });
