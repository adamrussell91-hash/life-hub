import { el } from '@/quiz/dom';
import type { RoomView } from '../../core/room-protocol';
import { registerLiveKind, type KindView, type KindViewApi } from '../../live/kind-views';
import { avatar, createLeaderboard, createRing, type Leaderboard, type Ring } from '../../live/board-parts';
import { animate, countUp, enter, flyTo, pop, shake } from '../../motion/motion';
import { confetti } from '../../motion/confetti';
import { fmt, LETTERS, optionsOf, responseFor, type ShownItem } from './content';
import type { Payout, WagerStage } from './rules';
import './wager.css';

/**
 * Wager live screens (spec §6.8; approved mockup docs/mockups/games/wager.html).
 *
 * Board: the question and its options; a timer ring; the pot on the right
 * with a pile of coins; dots for who has locked in. When answers close, each
 * option shows the points riding on it. Reveal: the right option lifts, the
 * wrong stacks fly into the pot as coins, the pot rolls up, then splits and
 * flies to the right option (or rolls over as a jackpot). Then the top five.
 * After the final question the teacher may open the calibration view
 * (initials, confidence against accuracy) before ending.
 *
 * Phone: answer buttons, then a bet slider snapping to 10s with Min / ¼ / ½ /
 * All in chips; "Lock in 80 points"; after the reveal, the change with its
 * parts: "+104", then "184 back (bet 80, bonus 40, pot share 64)" (the bet
 * was never taken, so the change is bonus + share).
 */

type BoardKV = {
  stage: WagerStage;
  index: number;
  of: number;
  final: boolean;
  bonus: number;
  min_bet: number;
  start: number;
  ends_at?: number;
  item?: ShownItem;
  carried: number;
  pot: number;
  answered: number;
  seats: number;
  locked_initials: string[];
  riding?: Record<string, number>;
  counts?: Record<string, number>;
  pot_in?: number;
  right?: string[];
  winners?: number;
  standings?: Array<{ initials: string; before: number; after: number; climbed: boolean }>;
  misconceptions?: Array<{ item: string; index: number; option: string; text: string; share: number }>;
  calibration?: Array<{ initials: string; confidence: number; accuracy: number; rounds: number; big_wrong: number }>;
};

type PhoneKV = {
  stage: WagerStage;
  index: number;
  of: number;
  final: boolean;
  bonus: number;
  min_bet: number;
  start: number;
  ends_at?: number;
  item?: ShownItem;
  right?: string[];
  you: {
    points: number;
    rescued?: boolean;
    locked?: { choice: string | null; bet: number; text?: string };
    result?: Payout;
    rank?: number;
    of?: number;
    missed?: number;
  };
  summary?: { right: number; of: number; confidence: number | null; accuracy: number | null };
};

const kv = <T>(view: RoomView): T | null => ((view as RoomView & { kind_view?: unknown }).kind_view as T) ?? null;
const keyClass = (k: number) => `wg-key wg-key--${(k % 4) + 1}`;
const bonusWords = (b: number) => (b >= 1 ? 'the same again' : b === 0.5 ? 'half again' : `${Math.round(b * 100)}% again`);

/* ── Board ─────────────────────────────────────────────────────────── */

function mountBoard(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'wg-board');
  host.append(root);
  let last: BoardKV | null = null;
  let ring: Ring | null = null;
  let lb: Leaderboard | null = null;
  let shownPot = 0;
  let token = 0;
  let stopCount: (() => void) | null = null;

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, api.calm() ? Math.min(ms, 60) : ms));

  function setPot(n: number, from?: number) {
    const num = root.querySelector<HTMLElement>('.wg-pot__num');
    if (!num) return;
    stopCount?.();
    stopCount = countUp(num, from ?? shownPot, n, 900);
    shownPot = n;
    pile(n);
  }
  function pile(n: number) {
    const p = root.querySelector<HTMLElement>('.wg-pile');
    if (!p) return;
    const count = Math.min(14, Math.ceil(n / 60));
    p.replaceChildren(
      ...Array.from({ length: count }, (_, j) => {
        const c = el('i');
        c.style.left = `calc(50% - 1.3em + ${((j % 3) - 1) * 2.1 + (j % 2) * 0.3}em)`;
        c.style.bottom = `${Math.floor(j / 3) * 0.65}em`;
        return c;
      })
    );
  }

  /** A whole new question: head, ring, options, pot, locked dots. */
  function buildQuestion(k: BoardKV) {
    ring?.stop();
    lb = null;
    root.className = 'wg-board';
    root.replaceChildren();
    const it = k.item;
    const head = el('div', 'wg-head');
    head.append(el('span', 'gl-eyebrow', k.final ? 'Final question · all in allowed · bonus doubled' : `Question ${k.index + 1} of ${k.of}`));
    head.append(el('p', 'wg-q', it?.prompt ?? ''));
    if (it?.quote) head.append(el('p', 'wg-quote', it.quote));
    ring = createRing('wg-ring');
    const opts = el('div', 'wg-opts');
    const options = optionsOf(it ?? null);
    if (!options.length) opts.classList.add('is-typed');
    options.forEach((o, i) => {
      const card = el('div', 'wg-opt');
      card.dataset.id = o.id;
      const key = el('span', keyClass(i), LETTERS[i] ?? '•');
      const txt = el('span', 'wg-opt__txt', o.text);
      const ride = el('span', 'wg-opt__ride');
      const bar = el('span', 'wg-opt__bar');
      bar.append(el('i'));
      const n = el('b', '', '0');
      ride.append(bar, n, el('span', '', ' pts'));
      const tag = el('span', 'wg-opt__tag', 'Right');
      card.append(key, txt, ride, tag);
      opts.append(card);
    });
    if (!options.length) opts.append(el('p', 'wg-typed', 'Typed answers: everyone writes theirs on the phone.'));
    const pot = el('aside', 'wg-pot');
    pot.setAttribute('aria-label', 'The pot');
    const num = el('span', 'wg-pot__num', fmt(k.carried));
    shownPot = k.carried;
    pot.append(el('span', 'wg-pot__lbl', 'The pot'), num, el('span', 'wg-pot__sub', k.carried ? 'rolled over from last question' : 'fills with every wrong bet'), el('div', 'wg-pile'));
    const side = el('div', 'wg-side');
    if (k.carried) side.append(el('span', 'wg-jackpot', `Jackpot carried over: ${fmt(k.carried)}`));
    side.append(pot);
    const locked = el('div', 'wg-locked');
    const count = el('span', 'wg-locked__n');
    const dots = el('span', 'gl-dots');
    locked.append(count, dots);
    root.append(head, ring.root, opts, side, locked);
    pile(k.carried);
    void enter(head);
    root.querySelectorAll('.wg-opt').forEach((n, i) => void animate(n, [{ opacity: 0, transform: 'translateY(1em) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 120 * i, fill: 'backwards' }));
  }

  function paintLocked(k: BoardKV) {
    const count = root.querySelector('.wg-locked__n');
    const dots = root.querySelector('.gl-dots');
    if (!count || !dots) return;
    count.innerHTML = `<b>${k.answered}</b> / ${k.seats} locked in`;
    while (dots.children.length < k.seats) dots.append(el('i'));
    while (dots.children.length > k.seats) dots.lastElementChild?.remove();
    [...dots.children].forEach((d, i) => d.classList.toggle('is-on', i < k.answered));
  }

  function paintRiding(k: BoardKV) {
    root.classList.add('is-closed');
    ring?.stop();
    const riding = k.riding ?? {};
    const max = Math.max(1, ...Object.values(riding));
    root.querySelectorAll<HTMLElement>('.wg-opt').forEach((card) => {
      const v = riding[card.dataset.id ?? ''] ?? 0;
      const b = card.querySelector<HTMLElement>('.wg-opt__ride b');
      if (b) countUp(b, 0, v, 900);
      const bar = card.querySelector<HTMLElement>('.wg-opt__bar i');
      if (bar) bar.style.transform = `scaleX(${v / max})`;
    });
  }

  /** Coins from `from` to `to` (both elements), relative to the board root. */
  function coins(fromEl: Element, toEl: Element, n: number, delay = 0): Promise<void> {
    if (api.calm()) return Promise.resolve();
    const box = root.getBoundingClientRect();
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const from = { x: a.left - box.left + a.width / 2, y: a.top - box.top + a.height / 2 };
    const to = { x: b.left - box.left + b.width / 2, y: b.top - box.top + b.height / 2 };
    const flights: Promise<void>[] = [];
    for (let j = 0; j < n; j++) {
      const c = el('i', 'wg-coin');
      root.append(c);
      flights.push(
        sleep(delay + j * 70)
          .then(() => {
            api.sfx.coin();
            return flyTo(c, from, { x: to.x + (j - n / 2) * 8, y: to.y }, { duration: 750, scale: 0.7 });
          })
          .then(() => c.remove())
      );
    }
    return Promise.all(flights).then(() => undefined);
  }

  async function reveal(k: BoardKV) {
    const mine = ++token;
    root.classList.add('is-closed', 'is-revealed');
    api.sfx.reveal();
    const right = new Set(k.right ?? []);
    const cards = [...root.querySelectorAll<HTMLElement>('.wg-opt')];
    cards.forEach((c) => c.classList.add(right.has(c.dataset.id ?? '') ? 'is-right' : 'is-wrong'));
    await sleep(900);
    if (mine !== token) return;
    const pot = root.querySelector('.wg-pot');
    const riding = k.riding ?? {};
    if (pot) {
      await Promise.all(cards.filter((c) => !right.has(c.dataset.id ?? '') && (riding[c.dataset.id ?? ''] ?? 0) > 0).map((c, i) => coins(c, pot, 6, i * 120)));
    }
    if (mine !== token) return;
    const full = k.carried + (k.pot_in ?? 0);
    setPot(full, k.carried);
    const sub = root.querySelector('.wg-pot__sub');
    if (sub) sub.textContent = k.winners ? `${k.winners} got it right` : 'Nobody right yet';
    await sleep(1100);
    if (mine !== token) return;
    if (k.winners) {
      const target = cards.find((c) => right.has(c.dataset.id ?? '')) ?? root.querySelector('.wg-opts');
      if (pot && target) void coins(pot, target, 10);
      setPot(0, full);
      api.sfx.right();
    } else {
      if (sub) sub.textContent = full ? 'Nobody right: the pot rolls over' : 'Nobody right';
      if (full) void pop(root.querySelector('.wg-pot'));
    }
  }

  function showStandings(k: BoardKV) {
    ring?.stop();
    token += 1;
    root.className = 'wg-board wg-board--standings';
    root.replaceChildren();
    const box = el('div', 'wg-standings');
    box.append(el('h2', 'gl-lbscreen__h', k.final ? 'Final points' : 'Top five'));
    lb = createLeaderboard({ title: 'Top five' });
    box.append(lb.root);
    if (k.final && k.misconceptions?.length) {
      const m = k.misconceptions[0];
      box.append(el('p', 'wg-note', `Most backed wrong answer: ${m.text} (${Math.round(m.share * 100)}% of the points on question ${m.index + 1})`));
    }
    root.append(box);
    const rows = k.standings ?? [];
    const rank = (key: 'before' | 'after') => {
      const sorted = rows.slice().sort((a, b) => b[key] - a[key] || a.initials.localeCompare(b.initials));
      return sorted.map((r) => ({ initials: r.initials, score: r[key], rank: sorted.indexOf(r) + 1 }));
    };
    lb.update(rank('before'));
    const board = lb;
    setTimeout(() => board.update(rank('after')), api.calm() ? 30 : 700);
  }

  function showCalibration(k: BoardKV) {
    ring?.stop();
    root.className = 'wg-board wg-board--calibration';
    root.replaceChildren();
    const wrap = el('div', 'wg-cal');
    wrap.append(el('span', 'gl-eyebrow', 'Teacher only · not for the projector'));
    const grid = el('div', 'wg-cal__grid');
    const plot = el('div', 'wg-plot');
    plot.setAttribute('role', 'img');
    plot.setAttribute('aria-label', 'Confidence against accuracy, one dot per student');
    plot.append(el('span', 'wg-plot__diag'), el('span', 'wg-plot__under', 'Underconfident'), el('span', 'wg-plot__over', 'Overconfident'), el('span', 'wg-plot__x', 'Confidence (bet ÷ points held) →'), el('span', 'wg-plot__y', 'Accuracy →'));
    for (const r of k.calibration ?? []) {
      const a = avatar(r.initials, 'wg-plot__dot');
      a.style.left = `calc(${r.confidence * 100}% - 1.1em)`;
      a.style.bottom = `calc(${r.accuracy * 100}% - 1.1em)`;
      a.title = `${r.initials}: confidence ${Math.round(r.confidence * 100)}%, accuracy ${Math.round(r.accuracy * 100)}%`;
      plot.append(a);
    }
    const notes = el('div', 'wg-cal__notes');
    const note = (title: string, body: string) => {
      const n = el('div', 'wg-cal__note');
      n.append(el('b', '', title), el('span', '', body));
      notes.append(n);
    };
    const mis = k.misconceptions ?? [];
    note('Confident misconception', mis.length ? mis.slice(0, 2).map((m) => `Q${m.index + 1}: “${m.text}” drew ${Math.round(m.share * 100)}% of the points bet.`).join(' ') : 'No wrong answer drew 30% of the points on any question.');
    const bold = (k.calibration ?? []).filter((r) => r.big_wrong > 0).map((r) => r.initials);
    note('Big bets, wrong (revisit)', bold.length ? `${bold.join(', ')} backed a wrong answer with half their points or more.` : 'Nobody backed a wrong answer with half their points.');
    const shy = (k.calibration ?? []).filter((r) => r.accuracy >= 0.8 && r.confidence <= 0.3).map((r) => r.initials);
    note('Underselling themselves', shy.length ? `${shy.join(', ')}: right most of the time, but bet small.` : 'Nobody was right most of the time on small bets.');
    note('Rescued players', 'Bets made after a rescue top-up stay out of this plot until the player is back above half the starting points.');
    grid.append(plot, notes);
    wrap.append(grid);
    root.append(wrap);
  }

  function update(view: RoomView) {
    const k = kv<BoardKV>(view);
    if (!k) return;
    const prev = last;
    last = k;
    if (k.stage === 'idle') {
      root.replaceChildren(el('p', 'wg-board-wait', 'Get ready to wager…'));
      return;
    }
    if (k.stage === 'standings') {
      if (prev?.stage !== 'standings' || prev.index !== k.index) showStandings(k);
      return;
    }
    if (k.stage === 'calibration') {
      if (prev?.stage !== 'calibration') showCalibration(k);
      return;
    }
    const fresh = !prev || prev.index !== k.index || prev.stage === 'standings' || prev.stage === 'calibration' || prev.stage === 'idle' || !root.querySelector('.wg-opts');
    if (fresh) buildQuestion(k);
    paintLocked(k);
    if (k.stage === 'open') {
      root.classList.remove('is-closed', 'is-revealed');
      if (k.ends_at && ring && view.phase === 'paused') ring.hold(Math.ceil((view.paused_left_ms ?? 0) / 1000), 1);
      if (prev && prev.answered < k.answered && !fresh) api.sfx.lock();
    }
    if (k.stage === 'closed' && (fresh || prev?.stage !== 'closed')) {
      api.sfx.lock();
      paintRiding(k);
    }
    if (k.stage === 'revealed' && (fresh || prev?.stage !== 'revealed')) {
      paintRiding(k);
      void reveal(k);
    }
  }

  // Ring total: measured once per question, from the first view that carries ends_at.
  let ringTotal = 0;
  let ringFor = -1;
  const baseUpdate = update;
  const wrapped = (view: RoomView) => {
    const k = kv<BoardKV>(view);
    if (k?.ends_at && k.index !== ringFor) {
      ringFor = k.index;
      ringTotal = Math.max(1000, k.ends_at - api.serverNow());
    }
    baseUpdate(view);
    if (k?.ends_at && ring && k.stage === 'open' && view.phase === 'playing') ring.run(k.ends_at, ringTotal, api.serverNow);
  };

  return {
    update: wrapped,
    controls() {
      const k = last;
      if (!k) return [];
      const lastQ = k.index >= k.of - 1;
      if (k.stage === 'open') return [{ label: '+15 s', name: 'add_time', data: { seconds: 15 }, key: '+' }, { label: 'Close answers', name: 'close', key: ' ', primary: true }];
      if (k.stage === 'closed') return [{ label: 'Reveal', name: 'reveal', key: ' ', primary: true }];
      if (k.stage === 'revealed') return [{ label: lastQ ? 'Final points' : 'Top five', name: 'standings', key: ' ', primary: true }];
      if (k.stage === 'standings') return lastQ ? [{ label: 'Teacher: calibration view', name: 'calibration' }, { label: 'Podium', name: 'next', key: ' ', primary: true }] : [{ label: 'Next question', name: 'next', key: ' ', primary: true }];
      if (k.stage === 'calibration') return [{ label: 'Podium', name: 'next', key: ' ', primary: true }];
      return [];
    },
    dispose() {
      token += 1;
      ring?.stop();
      stopCount?.();
      root.remove();
    }
  };
}

/* ── Phone ─────────────────────────────────────────────────────────── */

function mountPhone(host: HTMLElement, api: KindViewApi): KindView {
  const root = el('div', 'wg-phone');
  host.append(root);
  let k: PhoneKV | null = null;
  let item = -1;
  let step: 'answer' | 'bet' = 'answer';
  let pick: string | null = null;
  let typed = '';
  let bet = 30;
  let shownAt = 0;
  let sending = false;
  let resultFor = -1;
  let raf = 0;
  const bar = el('div', 'gl-bar wg-timer');
  const barFill = el('i');
  bar.append(barFill);
  bar.setAttribute('aria-hidden', 'true');

  const held = () => k?.you.points ?? 0;
  const minBet = () => Math.min(k?.min_bet ?? 10, held());
  const snap = (v: number) => Math.max(minBet(), Math.min(held(), Math.round(v / 10) * 10));

  function timer() {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
    const ends = k?.ends_at;
    if (!ends || k?.stage !== 'open') {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const total = Math.max(1000, ends - shownAt);
    const frame = () => {
      const left = Math.max(0, ends - api.serverNow());
      barFill.style.transform = `scaleX(${left / total})`;
      bar.classList.toggle('is-low', left < 10_000);
      if (left > 0 && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
    };
    frame();
  }

  function head(): HTMLElement {
    const h = el('div', 'wg-ph-top');
    const pts = el('span', 'wg-ph-pts');
    pts.innerHTML = `<b>${fmt(held())}</b> pts`;
    h.append(el('span', 'wg-ph-q', k ? (k.final ? 'Final question' : `Question ${k.index + 1} of ${k.of}`) : ''), pts);
    return h;
  }

  function optionButtons(it: ShownItem): HTMLElement[] {
    return optionsOf(it).map((o, i) => {
      const b = el('button', 'wg-ans');
      b.type = 'button';
      b.dataset.id = o.id;
      b.classList.toggle('is-sel', pick === o.id);
      b.setAttribute('aria-pressed', String(pick === o.id));
      b.append(el('span', keyClass(i), LETTERS[i] ?? '•'), el('span', 'wg-ans__txt', o.text));
      b.addEventListener('click', () => {
        pick = o.id;
        api.sfx.click();
        render();
      });
      return b;
    });
  }

  function renderAnswer(it: ShownItem) {
    root.append(head(), bar);
    root.append(el('p', 'wg-ph-sub', 'Answer first, then bet'));
    root.append(el('p', 'wg-ph-prompt', it.prompt));
    if (it.quote) root.append(el('p', 'wg-ph-quote', it.quote));
    if (it.mode === 'text') {
      const input = el('input', 'wg-input');
      input.type = 'text';
      input.maxLength = 200;
      input.value = typed;
      input.autocomplete = 'off';
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('aria-label', 'Your answer');
      input.placeholder = 'Type your answer';
      input.addEventListener('input', () => {
        typed = input.value;
        next.disabled = !typed.trim();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && typed.trim()) {
          e.preventDefault();
          step = 'bet';
          render();
        }
      });
      root.append(input);
    } else {
      const list = el('div', 'wg-answers');
      list.append(...optionButtons(it));
      root.append(list);
    }
    const next = el('button', 'btn btn--primary', 'Next: place your bet');
    next.type = 'button';
    next.disabled = it.mode === 'text' ? !typed.trim() : !pick;
    next.addEventListener('click', () => {
      step = 'bet';
      bet = snap(bet);
      render();
    });
    api.setActions?.([next]);
  }

  function renderBet(it: ShownItem) {
    root.append(head(), bar);
    const mine = el('div', 'wg-mine');
    const opts = optionsOf(it);
    const i = opts.findIndex((o) => o.id === pick);
    if (i >= 0) mine.append(el('span', keyClass(i), LETTERS[i]));
    const label = el('span', 'wg-mine__txt');
    label.append('Your answer: ', el('b', '', i >= 0 ? opts[i].text : typed.trim()));
    const change = el('button', 'wg-link', 'Change');
    change.type = 'button';
    change.addEventListener('click', () => {
      step = 'answer';
      render();
    });
    mine.append(label, change);
    const card = el('div', 'wg-bet');
    const amt = el('output', 'wg-bet__amt', fmt(bet));
    const of = el('span', 'wg-bet__of', `of your ${fmt(held())} points`);
    const range = el('input', 'wg-range');
    range.type = 'range';
    range.min = String(minBet());
    range.max = String(held());
    range.step = '10';
    range.value = String(bet);
    range.setAttribute('aria-label', 'Bet');
    range.setAttribute('aria-valuetext', `${bet} points`);
    const paint = () => {
      amt.textContent = fmt(bet);
      range.value = String(bet);
      range.setAttribute('aria-valuetext', `${bet} points`);
      const span = Math.max(1, held() - minBet());
      range.style.setProperty('--p', `${((bet - minBet()) / span) * 100}%`);
      lock.textContent = `Lock in ${fmt(bet)} points`;
    };
    range.addEventListener('input', () => {
      bet = snap(Number(range.value));
      paint();
    });
    const chips = el('div', 'wg-chips');
    const chip = (text: string, value: () => number, cls = '') => {
      const c = el('button', cls, text);
      c.type = 'button';
      c.addEventListener('click', () => {
        bet = Math.max(minBet(), Math.min(held(), value()));
        api.sfx.click();
        paint();
        void pop(amt);
      });
      chips.append(c);
    };
    chip('Min', () => minBet());
    chip('¼', () => snap(held() / 4));
    chip('½', () => snap(held() / 2));
    chip('All in', () => held(), 'is-allin');
    card.append(el('span', 'wg-ph-sub', 'How sure are you?'), amt, of, range, chips);
    const rule = el('p', 'wg-ph-note', `Right: your bet back, plus ${bonusWords(k?.bonus ?? 0.5)}, plus a share of the pot. Wrong: you lose it.`);
    if (k?.you.rescued) root.append(el('p', 'wg-rescue', `Topped up to ${k.min_bet} so you can keep playing.`));
    root.append(mine, card, rule);
    const lock = el('button', 'btn btn--primary wg-lock', '');
    lock.type = 'button';
    lock.addEventListener('click', () => void send());
    paint();
    api.setActions?.([lock]);
  }

  async function send() {
    if (!k?.item || sending) return;
    const it = k.item;
    const answer = it.mode === 'text' ? typed.trim() : pick;
    if (!answer) return;
    sending = true;
    try {
      await api.move({ item: it.id, move: 'answer', response: responseFor(it, answer), extra: { bet }, time_ms: Math.max(0, Math.round(api.serverNow() - shownAt)) });
      api.sfx.lock();
    } catch (e) {
      api.toast(e instanceof Error && e.message ? e.message : 'That didn’t send. Try again.', 'bad');
    } finally {
      sending = false;
    }
  }

  function waitCard(sub: string, big: string, lines: Array<string | HTMLElement>, tone = '') {
    const w = el('div', `wg-wait ${tone}`);
    w.append(el('span', 'wg-ph-sub', sub), el('div', 'wg-big', big));
    for (const l of lines) w.append(typeof l === 'string' ? el('p', 'wg-ph-sub', l) : l);
    return w;
  }

  function choiceText(id: string | null): string {
    const opts = optionsOf(k?.item ?? null);
    const i = opts.findIndex((o) => o.id === id);
    return i >= 0 ? `${LETTERS[i]} · ${opts[i].text}` : '';
  }

  function renderResult(p: Payout) {
    root.append(head());
    const breakdown = el('div', 'wg-break');
    const row = (a: string, b: string, cls = '') => {
      const d = el('div', cls);
      d.append(el('span', '', a), el('b', '', b));
      breakdown.append(d);
    };
    if (p.correct) {
      // The headline is the change in points; the line under it adds up to what came back (the bet was never taken).
      root.append(waitCard('You were right', `+${fmt(p.change)}`, [`${fmt(p.bet + p.bonus + p.share)} back (bet ${fmt(p.bet)}, bonus ${fmt(p.bonus)}, pot share ${fmt(p.share)})`], 'is-good'));
      row('Bet returned', fmt(p.bet));
      row('House bonus', `+${fmt(p.bonus)}`);
      row('Your share of the pot', `+${fmt(p.share)}`);
    } else {
      const right = (k?.right ?? []).map(choiceText).filter(Boolean).join(' or ');
      root.append(waitCard(p.correct === null ? 'No answer' : 'Not this time', `−${fmt(p.bet)}`, [p.correct === null ? 'No answer: the minimum bet went into the pot.' : right ? `The answer was ${right}.` : 'Your answer wasn’t the one.'], 'is-bad'));
    }
    row('Points now', fmt(p.after), 'is-tot');
    if (p.after < (k?.min_bet ?? 10) && p.after >= 0) row('Rescue', `back to ${k?.min_bet ?? 10} next question`);
    root.append(breakdown);
    if (k?.summary) {
      const s = k.summary;
      const sum = el('div', 'wg-break');
      const add = (a: string, b: string) => {
        const d = el('div');
        d.append(el('span', '', a), el('b', '', b));
        sum.append(d);
      };
      add('Questions right', `${s.right} of ${s.of}`);
      if (s.confidence !== null && s.accuracy !== null) {
        const gap = s.confidence - s.accuracy;
        add('Your bets matched your accuracy', Math.abs(gap) <= 0.2 ? 'Well' : gap > 0 ? 'Bold: bet more than you got right' : 'Cautious: you knew more than you bet');
      }
      if (k.you.rank) add('Place', `${k.you.rank} of ${k.you.of}`);
      root.append(sum);
    }
    if (resultFor !== k?.index) {
      resultFor = k?.index ?? -1;
      if (p.correct) {
        api.sfx.right();
        api.toast(`+${fmt(p.change)} points`, 'good');
        void pop(root.querySelector('.wg-big'));
        if (k?.final && k.summary && !api.calm()) void confetti(root, { pieces: 60 });
      } else {
        api.sfx.wrong();
        void shake(root.querySelector('.wg-big'));
      }
    }
  }

  function render() {
    root.replaceChildren();
    api.setActions?.([]);
    if (!k) return;
    const it = k.item;
    if (k.stage === 'idle' || !it) {
      root.append(waitCard('Wager', fmt(held()), ['points to start. Eyes on the board.']));
      return;
    }
    if (k.stage === 'open') {
      if (k.you.locked) {
        const l = k.you.locked;
        root.append(head(), bar, waitCard('Locked in', fmt(l.bet), [`on ${l.choice ? choiceText(l.choice) : `“${l.text ?? ''}”`}`, 'Eyes on the board.']));
      } else if (step === 'bet') renderBet(it);
      else renderAnswer(it);
      timer();
      return;
    }
    if (k.stage === 'closed') {
      const l = k.you.locked;
      root.append(head(), waitCard('Answers closed', fmt(l?.bet ?? Math.min(k.min_bet, held())), [l ? `riding on ${l.choice ? choiceText(l.choice) : `“${l.text ?? ''}”`}` : 'No answer: the minimum bet goes into the pot.']));
      return;
    }
    const p = k.you.result;
    if (p) renderResult(p);
    else root.append(head(), waitCard('This question', 'Next one soon', ['You joined after it started.']));
  }

  return {
    update(view: RoomView) {
      const next = kv<PhoneKV>(view);
      if (!next) return;
      const was = k;
      k = next;
      if (next.index !== item) {
        item = next.index;
        step = 'answer';
        pick = null;
        typed = '';
        bet = Math.max(Math.min(next.min_bet, next.you.points), Math.min(next.you.points, Math.round(next.you.points / 4 / 10) * 10 || next.min_bet));
        shownAt = api.serverNow();
      }
      // Don't redraw under the student's thumb while they set a bet: only a change of stage or lock redraws.
      const same = was && was.stage === next.stage && was.index === next.index && !!was.you.locked === !!next.you.locked && was.you.points === next.you.points && !!was.you.result === !!next.you.result && (was.ends_at ?? 0) === (next.ends_at ?? 0);
      if (!same) render();
      else timer();
    },
    onKey(e) {
      if (!k?.item || k.stage !== 'open' || k.you.locked || step !== 'answer' || k.item.mode === 'text') return false;
      const n = LETTERS.indexOf(e.key.toUpperCase());
      const opts = optionsOf(k.item);
      if (n >= 0 && n < opts.length) {
        pick = opts[n].id;
        render();
        return true;
      }
      return false;
    },
    dispose() {
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      root.remove();
    }
  };
}

registerLiveKind('wager', { board: mountBoard, phone: mountPhone });

export { mountBoard as mountWagerBoard, mountPhone as mountWagerPhone };
