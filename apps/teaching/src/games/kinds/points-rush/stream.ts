import { el } from '@/quiz/dom';
import { animate, countUp, pop, shake } from '../../motion/motion';
import type { Sfx } from '../../sound/sfx';
import { fmt, LETTERS, optionsOf, responseFor, type ShownItem } from '../wager/content';
import '../wager/wager.css';
import { STREAK_BONUS, UPGRADE_INFO, type ShopRow, type Upgrade, type Verdict } from './engine';

/**
 * Points rush on a phone (spec §6.6; approved mockup
 * docs/mockups/games/points-rush.html, phone side): a status row (multiplier,
 * streak dots, insurance shield, Upgrades), the question card ("↻ Back again"
 * when a miss comes back) and big answer buttons. Right: a points burst flies
 * from the button to the score. Wrong: no points lost, it comes back. The
 * Upgrades sheet is a bottom sheet with three rows, one tap to buy (R4: full
 * width, flush to the bottom, docked 44 px action).
 *
 * The live phone (live.ts) and the solo player (player.ts) both mount this
 * with their own driver: the room, or the engine run on the phone.
 */

export type StreamState = {
  points: number;
  streak: number;
  best: number;
  mult: number;
  up: Record<Upgrade, number>;
  shop: ShopRow[];
  cur: { item: string; back: boolean; n: number; q: ShownItem | null } | null;
  endsAt?: number;
  totalMs: number;
  over: boolean;
};

export type StreamDriver = {
  /** Sends one answer; resolves with the verdict and the state after it (the next question). */
  answer(item: string, response: unknown): Promise<{ verdict: Verdict | null; correct: boolean; state: StreamState }>;
  buy(key: Upgrade): Promise<StreamState | null>;
  now(): number;
};

export type StreamOptions = {
  driver: StreamDriver;
  calm(): boolean;
  sfx: Sfx;
  toast(text: string, tone?: 'good' | 'bad' | 'plain'): void;
  setActions?(buttons: HTMLElement[]): void;
};

export type Stream = {
  root: HTMLElement;
  /** A new state from outside (live view, timer, purchase elsewhere). Redraws only what changed. */
  set(state: StreamState): void;
  onKey(e: KeyboardEvent): boolean;
  dispose(): void;
};

const ICONS: Record<Upgrade, string> = {
  mult: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  streak: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z" fill="currentColor"/></svg>',
  ins: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/></svg>'
};
const SHIELD = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/></svg>';

function describe(row: ShopRow): string {
  if (row.key === 'mult') return row.cost === null ? 'Top level reached' : `Every right answer ×${row.level + 2}`;
  if (row.key === 'streak') return row.cost === null ? 'Top level reached' : `+${STREAK_BONUS[row.level + 1]} on every 3 in a row`;
  return row.cost === null ? 'Ready: your next wrong answer keeps your streak' : 'Your next wrong answer keeps your streak';
}

export function mountStream(host: HTMLElement, o: StreamOptions): Stream {
  const root = el('div', 'pr-phone');
  host.append(root);
  const top = el('div', 'pr-top');
  const scoreBox = el('span', 'pr-score');
  const scoreNum = el('b', '', '0');
  scoreBox.append(scoreNum, ' pts');
  const clockEl = el('span', 'pr-clock-chip', '');
  top.append(clockEl, scoreBox);
  const bar = el('div', 'gl-bar pr-timer');
  const barFill = el('i');
  bar.append(barFill);
  bar.setAttribute('aria-hidden', 'true');
  const status = el('div', 'pr-status');
  const card = el('div', 'pr-q');
  const note = el('p', 'pr-note');
  note.setAttribute('role', 'status');
  const answers = el('div', 'pr-answers');
  root.append(top, bar, status, card, note, answers);

  let s: StreamState | null = null;
  let shownItem = '';
  let shownN = -1;
  let busy = false;
  let shownPoints = 0;
  let raf = 0;
  let disposed = false;
  let sheet: HTMLElement | null = null;
  let typed = '';
  let timers: number[] = [];
  const later = (fn: () => void, ms: number) => {
    timers.push(window.setTimeout(() => !disposed && fn(), o.calm() ? Math.min(ms, 250) : ms));
  };

  function tickClock() {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
    if (!s?.endsAt) {
      bar.hidden = true;
      clockEl.textContent = '';
      return;
    }
    bar.hidden = false;
    const ends = s.endsAt;
    const total = s.totalMs;
    let lastSec = -1;
    const frame = () => {
      if (disposed) return;
      const left = Math.max(0, ends - o.driver.now());
      barFill.style.transform = `scaleX(${left / Math.max(1, total)})`;
      const sec = Math.ceil(left / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        clockEl.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        clockEl.classList.toggle('is-low', sec <= 15);
        bar.classList.toggle('is-low', sec <= 15);
      }
      if (left > 0 && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
    };
    frame();
  }

  function paintStatus() {
    if (!s) return;
    status.replaceChildren();
    const mult = el('span', 'pr-chip pr-chip--mult', `×${s.mult}`);
    mult.setAttribute('aria-label', `Multiplier ×${s.mult}`);
    const streak = el('span', 'pr-chip');
    streak.setAttribute('aria-label', `Streak ${s.streak}`);
    const dots = el('span', 'pr-streak');
    const fill = s.streak && s.streak % 3 === 0 ? 3 : s.streak % 3;
    for (let j = 0; j < 3; j++) dots.append(el('i', j < fill ? 'is-on' : ''));
    streak.append(dots, String(s.streak));
    status.append(mult, streak);
    if (s.up.ins > 0) {
      const sh = el('span', 'pr-chip pr-shield');
      sh.innerHTML = SHIELD;
      sh.setAttribute('aria-label', 'Insurance ready');
      sh.title = 'Insurance ready';
      status.append(sh);
    }
    const n = s.shop.filter((r) => r.can).length;
    const shop = el('button', 'pr-shop-btn', 'Upgrades');
    shop.type = 'button';
    shop.disabled = s.over;
    if (n) {
      const badge = el('span', 'pr-shop-btn__n', String(n));
      badge.setAttribute('aria-label', `${n} you can buy`);
      shop.append(badge);
    }
    shop.addEventListener('click', () => {
      o.sfx.click();
      openShop();
    });
    status.append(shop);
  }

  function paintScore(animateIt: boolean) {
    if (!s) return;
    if (animateIt && s.points !== shownPoints) countUp(scoreNum, shownPoints, s.points, 450);
    else scoreNum.textContent = fmt(s.points);
    shownPoints = s.points;
  }

  function paintQuestion(anim: boolean) {
    if (!s) return;
    const cur = s.cur;
    card.replaceChildren();
    answers.replaceChildren();
    note.textContent = '';
    o.setActions?.([]);
    typed = '';
    if (!cur || !cur.q || s.over) {
      card.append(el('p', 'pr-q__p', s.over ? 'Time!' : 'Waiting for the next question…'));
      return;
    }
    const q = cur.q;
    const eb = el('span', `pr-q__eb${cur.back ? ' is-back' : ''}`, cur.back ? '↻ Back again · you missed this one' : `Question ${cur.n}`);
    card.append(eb);
    if (q.clue_kind && q.mode === 'text' && q.lengths) card.append(el('span', 'pr-q__kind', q.clue_kind === 'example' ? 'Name the term from the example' : 'Name the term'));
    card.append(el('p', 'pr-q__p', q.prompt));
    if (q.quote) card.append(el('p', 'pr-q__quote', q.quote));
    if (q.mode === 'text') {
      const form = el('form', 'pr-type');
      const input = el('input', 'pr-input');
      input.type = 'text';
      input.maxLength = 200;
      input.autocomplete = 'off';
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('aria-label', 'Your answer');
      input.placeholder = q.lengths?.length ? `Type it (${q.lengths.join(', ')})` : 'Type your answer';
      input.addEventListener('input', () => {
        typed = input.value;
        go.disabled = !typed.trim();
      });
      form.append(input);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (typed.trim()) void answer(typed.trim(), null);
      });
      answers.append(form);
      const go = el('button', 'btn btn--primary', 'Check');
      go.type = 'button';
      go.disabled = true;
      go.addEventListener('click', () => typed.trim() && void answer(typed.trim(), null));
      o.setActions?.([go]);
      if (!o.calm()) setTimeout(() => input.focus({ preventScroll: true }), 50);
    } else {
      optionsOf(q).forEach((opt, i) => {
        const b = el('button', 'pr-opt');
        b.type = 'button';
        b.dataset.id = opt.id;
        b.append(el('span', `wg-key wg-key--${(i % 4) + 1}`, LETTERS[i] ?? '•'), el('span', 'pr-opt__txt', opt.text));
        b.addEventListener('click', () => void answer(opt.id, b));
        answers.append(b);
      });
    }
    if (anim && !o.calm()) {
      void animate(card, [{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }], { duration: 380 });
      answers.querySelectorAll('.pr-opt').forEach((b, k) => void animate(b, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 60 + k * 45, fill: 'backwards' }));
    }
  }

  function burst(from: Element | null, html: string, cls = ''): Promise<void> {
    const b = el('span', `pr-burst ${cls}`);
    b.innerHTML = html;
    root.append(b);
    const box = root.getBoundingClientRect();
    const a = (from ?? answers).getBoundingClientRect();
    const z = scoreBox.getBoundingClientRect();
    const start = { x: a.left - box.left + 40, y: a.top - box.top + 8 };
    const end = { x: z.left - box.left - 10, y: z.top - box.top };
    if (o.calm() || typeof b.animate !== 'function') {
      b.remove();
      return Promise.resolve();
    }
    return animate(
      b,
      [
        { transform: `translate(${start.x}px, ${start.y}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${start.x}px, ${start.y - 34}px) scale(1.15)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(.7)`, opacity: 0.9 }
      ],
      { duration: 720, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards', calmFade: false }
    ).then(() => b.remove());
  }

  async function answer(pick: string, btn: HTMLButtonElement | null) {
    if (!s?.cur?.q || busy || s.over) return;
    busy = true;
    const cur = s.cur;
    const q = cur.q as ShownItem;
    answers.querySelectorAll<HTMLButtonElement>('button, input').forEach((b) => (b.disabled = true));
    o.setActions?.([]);
    btn?.classList.add('is-picked');
    let out: Awaited<ReturnType<StreamDriver['answer']>>;
    try {
      out = await o.driver.answer(cur.item, responseFor(q, pick));
    } catch (e) {
      busy = false;
      o.toast(e instanceof Error && e.message ? e.message : 'That didn’t send. Try again.', 'bad');
      if (s) paintQuestion(false);
      return;
    }
    if (disposed) return;
    const v = out.verdict;
    const right = out.correct;
    btn?.classList.add(right ? 'is-right' : 'is-wrong');
    answers.querySelectorAll<HTMLElement>('.pr-opt').forEach((b) => b !== btn && b.classList.add('is-dim'));
    const before = shownPoints;
    s = { ...out.state, cur: s.cur };
    if (right) {
      o.sfx.right();
      const gain = v?.gain ?? 0;
      const bonus = v?.bonus ?? 0;
      note.textContent = cur.back ? 'Fixed it. That one won’t come back.' : (v?.streak ?? 0) >= 3 ? `${v?.streak} in a row` : '';
      void burst(btn ?? card, `+${fmt(gain)}${(s?.mult ?? 1) > 1 ? ` <small>(100 × ${s?.mult})</small>` : ''}`).then(() => {
        if (disposed) return;
        countUp(scoreNum, before, before + gain, 450);
        shownPoints = before + gain;
        void pop(scoreBox);
      });
      if (bonus) {
        later(() => {
          o.sfx.coin();
          void burst(btn ?? card, `Streak +${fmt(bonus)}`, 'is-bonus').then(() => {
            countUp(scoreNum, before + gain, before + gain + bonus, 450);
            shownPoints = before + gain + bonus;
          });
        }, 260);
      }
    } else {
      o.sfx.wrong();
      void shake(card);
      note.textContent = 'No points lost. This one comes back in a few questions.';
      o.toast(v?.insurance_used ? 'Insurance used: streak kept' : 'Not this time. You’ll see it again soon.', 'bad');
    }
    paintStatus();
    const next = out.state;
    later(
      () => {
        busy = false;
        if (!s) return;
        s = next;
        paintScore(false);
        paintStatus();
        shownItem = next.cur?.item ?? '';
        shownN = next.cur?.n ?? -1;
        paintQuestion(true);
      },
      right ? (v?.bonus ? 1050 : 800) : 1500
    );
  }

  function openShop() {
    if (!s || s.over || sheet) return;
    const panel = (host.closest('.gm-solo__panel') as HTMLElement | null) ?? host;
    if (getComputedStyle(panel).position === 'static') panel.style.position = 'relative';
    const wrap = el('div', 'pr-sheet-wrap');
    const bg = el('div', 'pr-sheet-bg');
    bg.addEventListener('click', closeShop);
    const sh = el('div', 'pr-sheet');
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-label', 'Upgrades');
    sh.setAttribute('aria-modal', 'true');
    wrap.append(bg, sh);
    panel.append(wrap);
    sheet = wrap;
    paintShop();
    requestAnimationFrame(() => wrap.classList.add('is-shown'));
    sh.querySelector<HTMLElement>('.pr-up:not([disabled])')?.focus({ preventScroll: true });
  }

  function paintShop(bought?: Upgrade) {
    const sh = sheet?.querySelector('.pr-sheet');
    if (!sh || !s) return;
    sh.replaceChildren();
    const head = el('div', 'pr-sheet__h');
    const have = el('span');
    have.innerHTML = `You have <b>${fmt(s.points)}</b> pts`;
    head.append(el('b', '', 'Upgrades'), have);
    const list = el('div', 'pr-sheet__list');
    for (const row of s.shop) {
      const b = el('button', `pr-up${row.cost === null ? ' is-maxed' : ''}${bought === row.key ? ' is-bought' : ''}`);
      b.type = 'button';
      b.disabled = !row.can;
      const ic = el('span', `pr-up__ic pr-up__ic--${row.key}`);
      ic.innerHTML = ICONS[row.key];
      const text = el('span', 'pr-up__text');
      text.append(el('span', 'pr-up__nm', `${UPGRADE_INFO[row.key].name}${row.key === 'mult' ? ` · now ×${row.level + 1}` : ''}`), el('span', 'pr-up__ds', describe(row)));
      if (row.max > 1) {
        const lv = el('span', 'pr-up__lv');
        for (let j = 0; j < row.max; j++) lv.append(el('i', j < row.level ? 'is-on' : ''));
        text.append(lv);
      }
      const cost = el('span', 'pr-up__cost', row.cost === null ? (row.key === 'ins' ? 'Held' : 'Max') : row.can ? fmt(row.cost) : `Need ${fmt(row.cost - s.points)} more`);
      b.append(ic, text, cost);
      b.setAttribute('aria-label', `${UPGRADE_INFO[row.key].name}: ${describe(row)}. ${cost.textContent}`);
      b.addEventListener('click', () => void buyIt(row.key));
      list.append(b);
    }
    const back = el('button', 'btn btn--primary pr-sheet__back', 'Back to questions');
    back.type = 'button';
    back.addEventListener('click', closeShop);
    const dock = el('div', 'pr-sheet__dock');
    dock.append(back);
    sh.append(head, list, el('p', 'pr-sheet__note', 'Tap an upgrade to buy it. Spending points never lowers the class goal.'), dock);
  }

  async function buyIt(key: Upgrade) {
    if (!s) return;
    const from = s.points;
    const next = await o.driver.buy(key).catch((e: unknown) => {
      o.toast(e instanceof Error && e.message ? e.message : 'That didn’t go through.', 'bad');
      return null;
    });
    if (!next || disposed) return;
    s = { ...next, cur: s.cur };
    o.sfx.coin();
    countUp(scoreNum, from, s.points, 400);
    shownPoints = s.points;
    paintStatus();
    paintShop(key);
    o.toast(key === 'mult' ? `Multiplier now ×${s.mult}` : key === 'ins' ? 'Insurance ready' : `Streak bonus level ${s.up.streak}`, 'good');
    later(closeShop, 650);
  }

  function closeShop() {
    const w = sheet;
    if (!w) return;
    sheet = null;
    w.classList.remove('is-shown');
    setTimeout(() => w.remove(), o.calm() ? 0 : 420);
  }

  return {
    root,
    set(next) {
      const first = !s;
      const prev = s;
      s = next;
      if (first || prev?.endsAt !== next.endsAt) tickClock();
      if (busy) return;
      paintScore(!first);
      paintStatus();
      if (sheet) paintShop();
      if (next.over) {
        closeShop();
        if (shownItem !== '__over') {
          shownItem = '__over';
          paintQuestion(false);
        }
        return;
      }
      if ((next.cur?.item ?? '') !== shownItem || (next.cur?.n ?? -1) !== shownN) {
        shownItem = next.cur?.item ?? '';
        shownN = next.cur?.n ?? -1;
        paintQuestion(!first);
      }
    },
    onKey(e) {
      if (sheet && e.key === 'Escape') {
        closeShop();
        return true;
      }
      if (!s?.cur?.q || busy || sheet || s.cur.q.mode === 'text') return false;
      const n = LETTERS.indexOf(e.key.toUpperCase());
      const b = answers.querySelectorAll<HTMLButtonElement>('.pr-opt')[n];
      if (n >= 0 && b) {
        b.click();
        return true;
      }
      return false;
    },
    dispose() {
      disposed = true;
      timers.forEach(clearTimeout);
      timers = [];
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      sheet?.remove();
      root.remove();
    }
  };
}
