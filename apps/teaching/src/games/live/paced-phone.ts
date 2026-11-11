import { el } from '@/quiz/dom';
import type { EventResult } from '../api';
import { FAKE_SPEAKER, type PublicGame } from '../core/schema';
import type { RoomView } from '../core/room-protocol';
import { animate } from '../motion/motion';
import type { Sfx } from '../sound/sfx';
import { cameo, castLooks, type Look } from '../kinds/who-said-it/portraits';
import { earForText } from '../kinds/who-said-it/player';
import '../kinds/who-said-it/who-said-it.css';

/**
 * Who said it?, live on a phone (spec §6.12 "Live"; approved mockup
 * docs/mockups/games/who-said-it.html, phone side). The teacher opens each
 * quote on the board; the phone shows the quote slip, the cast fanned as a
 * hand of cards and "Nobody: it's fake", with a thin bar drawn from the
 * room's clock. Lock in sends one answer; after the reveal the phone shows
 * "Right · +120" (the room's score change) with the source or why it's fake.
 */

export type PacedPhoneOptions = {
  game: PublicGame;
  owner: string;
  /** Sends the answer (a `move` to the room); resolves with the ack's result. */
  answer(item: string, speaker: string, timeMs: number): Promise<EventResult>;
  serverNow(): number;
  setActions(buttons: HTMLElement[]): void;
  setStatus(text: string): void;
  toast(text: string, tone?: 'good' | 'bad' | 'plain'): void;
  calm(): boolean;
  sfx: Sfx;
};

export type PacedPhone = {
  root: HTMLElement;
  update(view: RoomView): void;
  /** What this student answered, for the final card's ear for the text. */
  answers(): Array<{ pick: string; speaker: string | null; correct: boolean }>;
  onKey(e: KeyboardEvent): boolean;
  dispose(): void;
};

type Mode = 'waiting' | 'answer' | 'locked' | 'closed' | 'result';

const FAKE_LABEL = 'Nobody: it’s fake';
const maskIcon =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8c0-2 16-2 16 0 0 6-4 11-8 11S4 14 4 8z" stroke-dasharray="3 3"/><path d="M8 11q2-1.6 4 0M12 11q2-1.6 4 0"/></svg>';

/** The hand's fan: card k of n, lifted when chosen (the solo player's curve). */
export function fanTransform(k: number, n: number, selected: boolean, width = 343): string {
  const half = Math.max(0.5, (n - 1) / 2);
  const step = n > 1 ? Math.min(60, Math.max(16, (width / 2 - 72) / half)) : 0;
  const d = k - (n - 1) / 2;
  const y = ((d * d) / (half * half)) * 20 - (selected ? 30 : 0);
  const r = (d / half) * 12 * (selected ? 0.5 : 1);
  return `translate(${(d * step).toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${selected ? 1.08 : 1})`;
}

export function mountPacedPhone(host: HTMLElement, o: PacedPhoneOptions): PacedPhone {
  const cast = (o.game.cast ?? []).filter((c) => c.id !== FAKE_SPEAKER);
  const looks = castLooks(cast);
  const quotes = new Map((o.game.items ?? []).flatMap((i) => (i.shape === 'quote' ? [[i.id, i.text] as const] : [])));
  const nameOf = (id: string | null) => (id === FAKE_SPEAKER ? 'Nobody' : cast.find((c) => c.id === id)?.name || 'Someone');
  const lookOf = (id: string): Look | 'fake' => (id === FAKE_SPEAKER ? 'fake' : looks.get(id) ?? { hat: 0, prop: 0, tone: 1 });
  const emblemOf = (id: string) => cast.find((c) => c.id === id)?.emblem;

  const root = el('div', 'ws gl-paced');
  root.tabIndex = -1;
  host.append(root);
  const bar = el('div', 'gl-bar');
  bar.setAttribute('aria-hidden', 'true');
  const barFill = el('i');
  bar.append(barFill);

  let mode: Mode = 'waiting';
  let itemId: string | null = null;
  let pick: string | null = null;
  let scoreBefore = 0;
  let view: RoomView | null = null;
  let raf = 0;
  let disposed = false;
  let hand: HTMLElement | null = null;
  let pickLine: HTMLElement | null = null;
  const log: Array<{ item: string; pick: string; speaker: string | null; correct: boolean }> = [];
  const myPicks = new Map<string, string>();

  const fakeBtn = el('button', 'btn btn--secondary ws-fakebtn');
  fakeBtn.type = 'button';
  fakeBtn.innerHTML = `${maskIcon}<span>${FAKE_LABEL}</span>`;
  fakeBtn.addEventListener('click', () => choose(FAKE_SPEAKER));
  const lockBtn = el('button', 'btn btn--primary ws-lock ws-lock--go', 'Lock in');
  lockBtn.type = 'button';
  lockBtn.addEventListener('click', () => void lockIn());

  const myScore = () => view?.you?.seat?.score ?? 0;
  const status = () => {
    const item = view?.item;
    const pts = `${myScore().toLocaleString('en-AU')} pts`;
    o.setStatus(item ? `Quote ${item.index + 1} of ${item.of} · ${pts}` : pts);
  };

  function paintHand(): void {
    if (!hand) return;
    const cards = [...hand.querySelectorAll<HTMLButtonElement>('.ws-pc')];
    const width = hand.clientWidth || 343;
    cards.forEach((b, k) => {
      const on = b.dataset.pick === pick;
      b.classList.toggle('is-sel', on);
      b.setAttribute('aria-pressed', String(on));
      b.style.transform = fanTransform(k, cards.length, on, width);
      b.style.zIndex = String(on ? 20 : k);
      b.disabled = mode !== 'answer';
    });
    fakeBtn.classList.toggle('is-sel', pick === FAKE_SPEAKER);
    fakeBtn.setAttribute('aria-pressed', String(pick === FAKE_SPEAKER));
    fakeBtn.disabled = mode !== 'answer';
    lockBtn.disabled = mode !== 'answer' || !pick;
    if (pickLine) {
      pickLine.replaceChildren();
      if (pick) pickLine.append('Your pick: ', el('b', '', pick === FAKE_SPEAKER ? FAKE_LABEL : nameOf(pick)));
      else pickLine.textContent = 'Tap a card, or call it a fake';
    }
  }

  function choose(id: string): void {
    if (mode !== 'answer') return;
    pick = pick === id ? null : id;
    o.sfx.click();
    paintHand();
  }

  function wait(eyebrow: string, line: string, who?: string | null, big?: string): void {
    const box = el('div', 'gl-wait');
    box.append(el('span', 'ws-eyebrow', eyebrow));
    if (big !== undefined) box.append(el('div', 'ws-big', big));
    if (who) {
      const mini = el('div', 'ws-mini');
      mini.append(cameo(lookOf(who), emblemOf(who)));
      box.append(mini, el('p', 'ws-who', who === FAKE_SPEAKER ? FAKE_LABEL : nameOf(who)));
    }
    box.append(el('p', 'gl-wait__line', line));
    root.replaceChildren(bar, box);
    o.setActions([]);
  }

  function showAnswer(): void {
    mode = 'answer';
    const item = view?.item;
    if (!item) return;
    const slip = el('div', 'ws-slip');
    slip.append(el('span', 'ws-eyebrow', `Quote ${item.index + 1} of ${item.of}`));
    const text = quotes.get(item.item);
    slip.append(el('p', 'ws-quote', text ? `“${text}”` : 'Read the quote on the board.'));
    const ask = el('p', 'ws-ask', 'Who said it?');
    hand = el('div', 'ws-hand');
    hand.setAttribute('role', 'group');
    hand.setAttribute('aria-label', 'The cast');
    cast.forEach((c, k) => {
      const b = el('button', 'ws-pc');
      b.type = 'button';
      b.dataset.pick = c.id;
      b.setAttribute('aria-label', `${k + 1}: ${c.name}`);
      const name = el('b');
      c.name.trim().split(/\s+/).forEach((w, i) => name.append(...(i ? [el('br'), w] : [w])));
      b.append(cameo(lookOf(c.id), c.emblem), name);
      b.addEventListener('click', () => choose(c.id));
      hand!.append(b);
    });
    pickLine = el('p', 'ws-pick');
    pickLine.setAttribute('aria-live', 'polite');
    root.replaceChildren(bar, slip, ask, hand, pickLine);
    o.setActions([fakeBtn, lockBtn]);
    paintHand();
    if (!o.calm()) {
      [...hand.children].forEach((n, k) => {
        const end = (n as HTMLElement).style.transform;
        void animate(n, [{ transform: 'translate(0, 90px) rotate(0deg) scale(0.8)', opacity: 0 }, { transform: end, opacity: 1 }], {
          duration: 620,
          delay: 80 + k * 70,
          easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
          fill: 'backwards'
        });
      });
    }
  }

  async function lockIn(): Promise<void> {
    const item = view?.item;
    if (mode !== 'answer' || !pick || !item) return;
    const chosen = pick;
    mode = 'locked';
    lockBtn.textContent = 'Locking in…';
    paintHand();
    o.sfx.lock();
    myPicks.set(item.item, chosen);
    try {
      await o.answer(item.item, chosen, Math.max(0, o.serverNow() - item.opened_at));
    } catch (e) {
      if (disposed || view?.item?.item !== item.item) return;
      myPicks.delete(item.item);
      mode = 'answer';
      lockBtn.textContent = 'Lock in';
      paintHand();
      o.toast(e instanceof Error && e.message ? e.message : 'That didn’t send. Try again.', 'bad');
      return;
    }
    if (disposed || itemId !== item.item) return;
    lockBtn.textContent = 'Lock in';
    if (!view?.item?.revealed) wait('Locked in', 'Eyes on the board.', chosen);
  }

  function showResult(): void {
    const item = view?.item;
    if (!item?.revealed) return;
    mode = 'result';
    const reveal = item.revealed.reveal;
    const speaker = typeof reveal?.speaker === 'string' ? reveal.speaker : null;
    const chosen = myPicks.get(item.item) ?? null;
    const last = view?.you?.last;
    const correct = last && last.item === item.item && typeof last.correct === 'boolean' ? last.correct : !!chosen && chosen === speaker;
    const gain = Math.max(0, myScore() - scoreBefore);
    const fake = speaker === FAKE_SPEAKER;
    if (chosen && !log.some((a) => a.item === item.item)) log.push({ item: item.item, pick: chosen, speaker, correct });
    const head = !chosen ? 'No answer this time' : correct ? (fake ? 'Fake caught' : 'Right') : chosen === FAKE_SPEAKER ? 'False alarm: it’s real' : fake ? 'It’s a fake' : 'Not this time';
    const box = el('section', `ws-result ${correct ? 'is-right' : 'is-wrong'}`);
    box.append(el('span', 'ws-eyebrow', head), el('div', 'ws-big', correct ? `+${gain}` : '+0'));
    if (speaker) {
      const mini = el('div', 'ws-mini');
      mini.append(cameo(lookOf(speaker), emblemOf(speaker)));
      box.append(mini, el('p', 'ws-who', fake ? 'Nobody said it' : nameOf(speaker)));
    }
    const note = el('div', fake ? 'ws-note ws-note--fake' : 'ws-note');
    if (fake) note.append(el('span', '', 'Why it’s fake'), document.createTextNode(reveal?.why_fake || 'It isn’t in the text.'));
    else if (speaker) note.append(el('span', '', 'Source'), document.createTextNode(reveal?.source ? `${nameOf(speaker)} · ${reveal.source}` : nameOf(speaker)));
    if (note.childNodes.length) box.append(note);
    root.replaceChildren(box);
    o.setActions([]);
    if (!o.calm()) void animate(box, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
    if (correct) {
      o.sfx.right();
      o.toast(`${fake ? 'Fake caught' : 'Right'} · +${gain}`, 'good');
    } else if (chosen) {
      o.sfx.wrong();
      o.toast(fake ? 'You trusted a fake. Read why on your screen.' : `It was ${nameOf(speaker)}`, 'bad');
    }
  }

  function tick(): void {
    raf = 0;
    const item = view?.item;
    if (disposed || !item || item.revealed) return;
    const total = Math.max(1, item.ends_at - item.opened_at);
    const left = Math.max(0, item.ends_at - o.serverNow());
    barFill.style.transform = `scaleX(${(left / total).toFixed(4)})`;
    bar.classList.toggle('is-low', left <= 5000);
    if (left <= 0) {
      if (mode === 'answer') {
        mode = 'closed';
        wait('Answers closed', 'See how the class split on the board.', null, '–');
      }
      return;
    }
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
  }

  function update(next: RoomView): void {
    view = next;
    status();
    const item = next.item;
    if (!item) {
      if (mode !== 'waiting') {
        mode = 'waiting';
        itemId = null;
        wait('Who said it?', next.phase === 'lobby' ? 'Waiting for your teacher to start.' : 'Next quote coming. Eyes on the board.');
      } else if (!root.childNodes.length) wait('Who said it?', 'Eyes on the board.');
      return;
    }
    if (item.item !== itemId) {
      itemId = item.item;
      pick = null;
      scoreBefore = myScore();
      mode = 'waiting';
    }
    if (item.revealed) {
      if (mode !== 'result') showResult();
      return;
    }
    const answered = item.answered.includes(o.owner);
    const timeUp = o.serverNow() >= item.ends_at;
    if (answered) {
      if (mode !== 'locked') {
        mode = 'locked';
        wait('Locked in', 'Eyes on the board.', myPicks.get(item.item) ?? null);
      }
    } else if (timeUp) {
      if (mode !== 'closed' && mode !== 'locked') {
        mode = 'closed';
        wait('Answers closed', 'See how the class split on the board.', null, '–');
      }
    } else if (mode === 'waiting') showAnswer();
    if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
    else if (typeof requestAnimationFrame !== 'function') tick();
  }

  const onResize = () => paintHand();
  window.addEventListener('resize', onResize);

  return {
    root,
    update,
    answers: () => log.map(({ pick: p, speaker, correct }) => ({ pick: p, speaker, correct })),
    onKey(e) {
      if (mode !== 'answer' || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (/^[1-9]$/.test(e.key)) {
        const k = Number(e.key) - 1;
        if (k < cast.length) choose(cast[k].id);
        else if (k === cast.length) choose(FAKE_SPEAKER);
        else return false;
        return true;
      }
      if (e.key === '0' || e.key.toLowerCase() === 'f') {
        choose(FAKE_SPEAKER);
        return true;
      }
      if (e.key === 'Enter' && pick) {
        void lockIn();
        return true;
      }
      return false;
    },
    dispose() {
      disposed = true;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      o.setActions([]);
      root.remove();
    }
  };
}

export { earForText };
