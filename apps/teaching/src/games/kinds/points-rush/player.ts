import { el } from '@/quiz/dom';
import type { MountedPlayer, PlayerContext } from '../../solo/registry';
import { countUp, enter } from '../../motion/motion';
import { confetti } from '../../motion/confetti';
import { contentItems, fmt, shownItem, type ShownItem } from '../wager/content';
import { applyAnswer, buy, multiplier, newRunner, nextItem, runnerSummary, shopRows, type Runner } from './engine';
import { mountStream, type StreamState } from './stream';
import './points-rush.css';

/**
 * Points rush, solo (homework; spec §6.6 "Live or solo"). The same stream,
 * scoring, come-backs and shop as live, run on the phone by the engine; every
 * answer still goes to the server (the solo endpoint) to be marked, with the
 * verdict awaited so a wrong answer can come back. The clock is the game's
 * setting (5–15 min). At the end: points, right first try, fixed when it came
 * back, best streak, and what's still to fix; then the shell saves and shows
 * its finish card.
 */

export function mountPointsRush(host: HTMLElement, ctx: PlayerContext): MountedPlayer {
  const items = contentItems(ctx.game).filter((i) => shownItem(i));
  const shown = new Map<string, ShownItem>(items.map((i) => [i.id, shownItem(i) as ShownItem]));
  const ids = items.map((i) => i.id);
  const minutes = Math.min(15, Math.max(5, Number(ctx.game.settings?.minutes) || 8));
  const totalMs = minutes * 60_000;
  const t0 = Date.now();
  const endsAt = t0 + totalMs;
  const r: Runner = newRunner(ids, Math.random);
  nextItem(r, ids, Math.random, Date.now());
  let over = false;
  let disposed = false;

  const wrap = el('div', 'pr-solo');
  host.append(wrap);

  const state = (): StreamState => ({
    points: r.points,
    streak: r.streak,
    best: r.best,
    mult: multiplier(r),
    up: { ...r.up },
    shop: shopRows(r),
    cur: r.cur && !over ? { item: r.cur.item, back: r.cur.back, n: r.cur.n, q: shown.get(r.cur.item) ?? null } : null,
    endsAt,
    totalMs,
    over
  });

  const stream = mountStream(wrap, {
    calm: ctx.calm,
    sfx: ctx.sfx,
    toast: ctx.toast,
    setActions: ctx.setActions,
    driver: {
      now: () => Date.now(),
      async answer(item, response) {
        const cur = r.cur;
        if (!cur || cur.item !== item || over) throw new Error('Time’s up.');
        const result = await ctx.emit({ item, move: 'answer', response, time_ms: Math.max(0, Date.now() - cur.shown_at), extra: { back: cur.back, n: cur.n } }, { now: true });
        const correct = result.correct === true;
        const verdict = applyAnswer(r, correct, Math.random, Date.now());
        nextItem(r, ids, Math.random, Date.now());
        return { correct, verdict, state: state() };
      },
      async buy(key) {
        return buy(r, key) ? state() : null;
      }
    }
  });
  stream.set(state());
  if (!items.length) ctx.toast('This game has no questions yet.', 'plain');

  const tick = window.setInterval(() => {
    const left = endsAt - Date.now();
    const s = Math.max(0, Math.ceil(left / 1000));
    ctx.setStatus(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left · ${fmt(r.points)} pts`);
    if (left <= 0) end();
  }, 250);

  function end() {
    if (over || disposed) return;
    over = true;
    clearInterval(tick);
    ctx.sfx.buzz();
    stream.set(state());
    const s = runnerSummary(r);
    const card = el('section', 'pr-end');
    card.setAttribute('aria-labelledby', 'pr-end-h');
    const h = el('h3', 'pr-end__h', 'Time! Your points');
    h.id = 'pr-end-h';
    const big = el('div', 'pr-big', '0');
    countUp(big, 0, r.points, 900);
    const list = el('div', 'pr-list');
    const row = (a: string, b: string, cls = '') => {
      const d = el('div', cls);
      d.append(el('span', '', a), el('span', '', b));
      list.append(d);
    };
    row('Right first try', `${s.first_right} of ${s.tried}`);
    row('Fixed when it came back', `${s.fixed} of ${s.missed}`);
    row('Best streak', String(s.best));
    if (s.still.length) row('Still to fix', s.still.map((id) => (shown.get(id)?.prompt ?? id).slice(0, 60)).slice(0, 3).join(' · '), 'is-tot');
    card.append(h, big, list);
    wrap.replaceChildren(card);
    void enter(card);
    if (!ctx.calm() && s.tried && s.first_right === s.tried) void confetti(card, { pieces: 60 });
    const done = el('button', 'btn btn--primary', 'Save and finish');
    done.type = 'button';
    done.addEventListener('click', () => ctx.finish());
    ctx.setActions([done]);
  }

  return {
    onKey: (e) => (over ? false : stream.onKey(e)),
    dispose() {
      disposed = true;
      clearInterval(tick);
      stream.dispose();
      wrap.remove();
    }
  };
}
