import type { PublicQuestion, QuizResponse } from '@/quiz/core';
import { el } from '@/quiz/dom';
import { mountQuestionPlayer } from '@/quiz/player';
import type { PublicStationLock, RotationStatus, RushReply } from './api';

/**
 * A lock's rush round: a compact in-page panel. One big question at a time,
 * a streak of pips, a countdown bar. The server marks every answer and picks
 * the next question; the panel only ever says right or wrong, never the answer.
 *
 * The player polls and repaints every few seconds: `update` keeps the question
 * on screen (and the student's pick) unless the round really moved on.
 */

export type RushRoundOptions = {
  lessonId: string;
  stationId: string;
  lock: PublicStationLock;
  /** Sends one answer; resolves to the new status (with `rush`), or null when it failed. */
  submit: (itemId: string, response: QuizResponse) => Promise<RotationStatus | null>;
  /**
   * After the round ran out on this device: an empty answer to the head question. The server
   * resets a timed-out round without marking; if it isn't out there yet it refuses the empty
   * answer, so this never costs a streak. Errors stay quiet.
   */
  reset: (itemId: string) => Promise<RotationStatus | null>;
  /** Clock seam for tests. */
  now?: () => number;
};

export type RushRound = { root: HTMLElement; update(lock: PublicStationLock): void; reply(r: RushReply): void; dispose(): void };

/** Kinds answered with one tap: the tap sends the answer. Others get a Check button. */
const ONE_TAP = new Set(['multiple_choice', 'true_false', 'odd_one_out']);
/** The server refuses answers closer together than this. */
const GAP_MS = 600;

export function mountRushRound(o: RushRoundOptions): RushRound {
  const now = o.now ?? (() => Date.now());
  let lock = o.lock;
  const check = () => (lock.check?.kind === 'rush' ? lock.check : { kind: 'rush' as const, items: [] as PublicQuestion[], streak: 6, seconds: 90 });
  const need = () => check().streak;

  let streak = lock.rush?.streak ?? 0;
  let itemId = lock.rush?.next_item_id ?? null;
  let answered = lock.rush?.answered ?? 0;
  let endsAt = lock.rush?.ends_at ?? null;
  /** Local deadline per round (keyed by the server's ends_at): a round this page started runs on this device's clock. */
  const localEnd = new Map<string, number>();
  let busy = false;
  let lastSent = 0;
  let timedOut = false;
  let message = '';
  let flashTimer = 0;
  let tick = 0;
  let qSig = '';

  const root = el('div', 'rot-rush');
  root.dataset.lock = lock.id;
  const top = el('div', 'rot-rush__top');
  const pips = el('div', 'rot-rush__pips');
  pips.setAttribute('role', 'img');
  const timeLabel = el('span', 'rot-rush__time');
  top.append(pips, timeLabel);
  const bar = el('div', 'rot-rush__bar');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('span');
  bar.append(fill);
  const stage = el('div', 'rot-rush__q');
  const say = el('p', 'rot-rush__say');
  say.setAttribute('aria-live', 'polite');
  root.append(top, bar, stage, say);

  const itemOf = (id: string | null) => check().items.find((q) => q.id === id) ?? null;
  const deadline = (): number | null => {
    if (!endsAt) return null;
    return localEnd.get(endsAt) ?? Date.parse(endsAt);
  };

  function paintPips(): void {
    const n = need();
    pips.replaceChildren();
    pips.setAttribute('aria-label', `${streak} of ${n} right in a row`);
    for (let i = 0; i < n; i++) pips.append(el('i', i < streak ? 'on' : ''));
  }

  function paintTime(): void {
    const end = deadline();
    const total = check().seconds * 1000;
    if (timedOut) {
      fill.style.width = '0%';
      timeLabel.textContent = 'Time’s up';
      root.dataset.timer = 'out';
      return;
    }
    if (!end) {
      fill.style.width = '100%';
      timeLabel.textContent = 'Starts when you answer';
      root.dataset.timer = 'waiting';
      return;
    }
    const left = Math.max(0, end - now());
    fill.style.width = `${Math.min(100, (left / total) * 100)}%`;
    timeLabel.textContent = `${Math.ceil(left / 1000)} s left`;
    root.dataset.timer = left < 10000 ? 'low' : 'running';
    if (left <= 0) { timedOut = true; message = ''; paintAll(); }
  }

  function startTicking(): void {
    window.clearInterval(tick);
    tick = 0;
    if (deadline() && !timedOut) tick = window.setInterval(paintTime, 250);
  }

  function send(id: string, response: QuizResponse): void {
    if (busy) return;
    busy = true;
    stage.dataset.busy = 'true';
    const wait = Math.max(0, lastSent + GAP_MS - now());
    window.setTimeout(() => {
      lastSent = now();
      void o.submit(id, response).then((next) => {
        busy = false;
        stage.dataset.busy = 'false';
        if (next?.rush) reply(next.rush);
        else paintQuestion(true);
      });
    }, wait);
  }

  function paintQuestion(force = false): void {
    const sig = JSON.stringify([itemId, answered, timedOut]);
    if (!force && sig === qSig) return;
    qSig = sig;
    stage.replaceChildren();
    if (timedOut) {
      const box = el('div', 'rot-rush__out');
      box.append(el('p', '', 'Time ran out before your streak was full. Your streak goes back to 0.'));
      const again = el('button', 'rot-btn rot-btn--primary', 'Start again');
      again.type = 'button';
      again.addEventListener('click', restart);
      box.append(again);
      stage.append(box);
      return;
    }
    const q = itemOf(itemId);
    if (!q) { stage.append(el('p', 'rot-note', 'No question to show. Go back to the map and open this station again.')); return; }
    let response: QuizResponse | null = null;
    const player = mountQuestionPlayer({
      question: q,
      shuffle: true,
      seed: `${o.lessonId}:${o.stationId}:${lock.id}:${answered}`,
      onChange: (r) => {
        response = r;
        if (ONE_TAP.has(q.kind)) send(q.id, r);
      }
    });
    stage.append(player);
    if (!ONE_TAP.has(q.kind)) {
      const go = el('button', 'rot-btn rot-btn--primary rot-rush__go', 'Check');
      go.type = 'button';
      go.addEventListener('click', () => { if (response) send(q.id, response); else { message = 'Answer the question first.'; say.textContent = message; } });
      player.addEventListener('keydown', (e) => { if (e.key === 'Enter' && response && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); send(q.id, response); } });
      stage.append(go);
    }
  }

  /** The round ran out on this device: one unmarked answer to the head question makes the server reset it too. */
  function restart(): void {
    if (busy) return;
    const id = itemId ?? check().items[0]?.id;
    timedOut = false;
    message = 'Get ready: the clock starts on your first answer.';
    if (!id || !endsAt) { endsAt = null; paintAll(); return; }
    busy = true;
    window.setTimeout(() => {
      lastSent = now();
      void o.reset(id).then((next) => {
        busy = false;
        if (next?.rush) { endsAt = next.rush.ends_at; streak = next.rush.streak; itemId = next.rush.next_item_id ?? itemId; }
        else endsAt = null;
        timedOut = false;
        message = 'Get ready: the clock starts on your first answer.';
        paintAll(true);
      });
    }, Math.max(0, lastSent + GAP_MS - now()));
  }

  function flash(kind: 'right' | 'wrong'): void {
    window.clearTimeout(flashTimer);
    root.dataset.flash = kind;
    flashTimer = window.setTimeout(() => { delete root.dataset.flash; }, 450);
  }

  function paintAll(force = false): void {
    paintPips();
    paintTime();
    paintQuestion(force);
    say.textContent = message;
    startTicking();
  }

  /** A reply to an answer: flash, then the next question. */
  function reply(r: RushReply): void {
    const firstStart = !endsAt && !!r.ends_at;
    streak = r.streak;
    if (r.ends_at && firstStart && !localEnd.has(r.ends_at)) localEnd.set(r.ends_at, now() + check().seconds * 1000);
    endsAt = r.ends_at;
    if (r.timed_out) {
      timedOut = false;
      endsAt = null;
      message = 'Time ran out, so the round starts again. That answer didn’t count: answer again to start the clock.';
      paintAll(true);
      return;
    }
    if (r.right !== null) answered += 1;
    if (r.right === true) { flash('right'); message = r.passed ? 'Lock open!' : `Right. ${r.need - r.streak} more in a row.`; }
    else if (r.right === false) { flash('wrong'); message = 'Not that one. Your streak starts again; that question will come back.'; }
    if (r.next_item_id) itemId = r.next_item_id;
    timedOut = false;
    paintAll(true);
  }

  paintAll();

  return {
    root,
    reply,
    update(next: PublicStationLock): void {
      lock = next;
      const rs = next.rush;
      if (!rs || busy) return;
      streak = rs.streak;
      // A poll after the round ran out locally keeps the "time's up" panel until the student starts again.
      if (!timedOut) endsAt = rs.ends_at;
      if (rs.next_item_id && rs.next_item_id !== itemId) { itemId = rs.next_item_id; answered = rs.answered; }
      paintPips();
      paintTime();
      paintQuestion();
      startTicking();
    },
    dispose(): void {
      window.clearInterval(tick);
      window.clearTimeout(flashTimer);
    }
  };
}
