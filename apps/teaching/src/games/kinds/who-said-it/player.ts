import { el } from '@/quiz/dom';
import type { EventResult } from '../../api';
import { FAKE_SPEAKER } from '../../core/schema';
import { animate, countUp } from '../../motion/motion';
import type { MountedPlayer, PlayerContext } from '../../solo/registry';
import { cameo, castLooks, type Look } from './portraits';

/**
 * Who said it?, solo (spec §6.12; approved mockup
 * docs/mockups/games/who-said-it.html). A quote types on; the cast fans in as
 * a hand of cards; the student picks a character or "Nobody: it's fake" and
 * locks in. The server marks it and sends back who said it, with the source
 * or why it's fake. Points for speed, double for a caught fake (shown on the
 * phone only; the server's score is right / answered). The end summary gives
 * the student's own ear for the text: fakes caught against false alarms.
 */

type Quote = { id: string; text: string };
type Answer = { item: string; pick: string; speaker: string | null; correct: boolean; points: number };

const FAKE_LABEL = 'Nobody: it’s fake';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Points for one answer: 100, plus up to 100 for speed inside the round's seconds, doubled for a caught fake. */
export function quotePoints(correct: boolean, fake: boolean, ms: number, seconds: number): number {
  if (!correct) return 0;
  const share = Math.max(0, 1 - ms / Math.max(1, seconds * 1000));
  return (100 + Math.round(share * 10) * 10) * (fake ? 2 : 1);
}

/** Ear for the text: fake catch rate minus false-alarm rate, as a whole number from −100 to +100. */
export function earForText(answers: ReadonlyArray<{ pick: string; speaker: string | null }>): { fakes: number; caught: number; real: number; alarms: number; ear: number } {
  let fakes = 0;
  let caught = 0;
  let real = 0;
  let alarms = 0;
  for (const a of answers) {
    if (a.speaker === null) continue;
    if (a.speaker === FAKE_SPEAKER) {
      fakes += 1;
      if (a.pick === FAKE_SPEAKER) caught += 1;
    } else {
      real += 1;
      if (a.pick === FAKE_SPEAKER) alarms += 1;
    }
  }
  const rate = (n: number, of: number) => (of ? n / of : 0);
  return { fakes, caught, real, alarms, ear: Math.round((rate(caught, fakes) - rate(alarms, real)) * 100) };
}

const maskIcon =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8c0-2 16-2 16 0 0 6-4 11-8 11S4 14 4 8z" stroke-dasharray="3 3"/><path d="M8 11q2-1.6 4 0M12 11q2-1.6 4 0"/></svg>';

export function mountWhoSaidIt(host: HTMLElement, ctx: PlayerContext): MountedPlayer {
  const cast = (ctx.game.cast ?? []).filter((c) => c.id !== FAKE_SPEAKER);
  const looks = castLooks(cast);
  const quotes: Quote[] = (ctx.game.items ?? []).flatMap((i) => (i.shape === 'quote' ? [{ id: i.id, text: i.text }] : []));
  const seconds = Math.max(5, Number(ctx.game.settings.seconds) || 20);
  const nameOf = (id: string | null) => (id === FAKE_SPEAKER ? 'Nobody' : cast.find((c) => c.id === id)?.name || 'Someone');
  const lookOf = (id: string): Look | 'fake' => (id === FAKE_SPEAKER ? 'fake' : looks.get(id) ?? { hat: 0, prop: 0, tone: 1 });
  const emblemOf = (id: string) => cast.find((c) => c.id === id)?.emblem;

  let at = 0;
  let pick: string | null = null;
  let locked = false;
  let shownAt = 0;
  let typedAt = 0;
  let typing = 0;
  let points = 0;
  let disposed = false;
  let mode: 'answer' | 'result' | 'summary' = 'answer';
  const answers: Answer[] = [];

  const root = el('div', 'ws');
  root.tabIndex = -1;
  /** Buttons that leave or go disabled drop focus to the page; keep it in the game so the keys still reach it. */
  const keepFocus = () => {
    const a = document.activeElement;
    if (!a || a === document.body || !a.isConnected || (a instanceof HTMLButtonElement && a.disabled)) root.focus({ preventScroll: true });
  };
  host.append(root);

  const fakeBtn = el('button', 'btn btn--secondary ws-fakebtn');
  fakeBtn.type = 'button';
  fakeBtn.innerHTML = `${maskIcon}<span>${FAKE_LABEL}</span>`;
  fakeBtn.addEventListener('click', () => choose(FAKE_SPEAKER));
  const lockBtn = el('button', 'btn btn--primary ws-lock ws-lock--go', 'Lock in');
  lockBtn.type = 'button';
  lockBtn.addEventListener('click', () => void lockIn());
  const nextBtn = el('button', 'btn btn--primary ws-lock');
  nextBtn.type = 'button';
  nextBtn.addEventListener('click', () => next());
  const finishBtn = el('button', 'btn btn--primary ws-lock', 'Finish');
  finishBtn.type = 'button';
  finishBtn.addEventListener('click', () => ctx.finish());

  function status(): void {
    if (mode === 'summary') ctx.setStatus(`${points.toLocaleString('en-AU')} points`);
    else ctx.setStatus(`Quote ${Math.min(at + 1, quotes.length)} of ${quotes.length} · ${points.toLocaleString('en-AU')} pts`);
  }

  /* ── Answer ─────────────────────────────────────────────────────── */

  let hand: HTMLElement | null = null;
  let pickLine: HTMLElement | null = null;
  let typedEl: HTMLElement | null = null;

  function fanTransform(k: number, n: number, selected: boolean): string {
    const width = hand?.clientWidth || 343;
    const half = Math.max(0.5, (n - 1) / 2);
    // Outer cards keep their whole face (and their tilt) inside the hand.
    const step = n > 1 ? Math.min(60, Math.max(16, (width / 2 - 72) / half)) : 0;
    const d = k - (n - 1) / 2;
    const x = d * step;
    const y = ((d * d) / (half * half)) * 20 - (selected ? 30 : 0);
    const r = (d / half) * 12 * (selected ? 0.5 : 1);
    return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${selected ? 1.08 : 1})`;
  }

  function paintHand(): void {
    if (!hand) return;
    const cards = [...hand.querySelectorAll<HTMLButtonElement>('.ws-pc')];
    cards.forEach((b, k) => {
      const on = b.dataset.pick === pick;
      b.classList.toggle('is-sel', on);
      b.setAttribute('aria-pressed', String(on));
      b.style.transform = fanTransform(k, cards.length, on);
      b.style.zIndex = String(on ? 20 : k);
      b.disabled = locked;
    });
    const fakeOn = pick === FAKE_SPEAKER;
    fakeBtn.classList.toggle('is-sel', fakeOn);
    fakeBtn.setAttribute('aria-pressed', String(fakeOn));
    fakeBtn.disabled = locked;
    lockBtn.disabled = locked || !pick;
    if (pickLine) {
      pickLine.replaceChildren();
      if (pick) pickLine.append('Your pick: ', el('b', '', pick === FAKE_SPEAKER ? FAKE_LABEL : nameOf(pick)));
      else pickLine.textContent = 'Tap a card, or call it a fake';
    }
  }

  function choose(id: string): void {
    if (locked || mode !== 'answer') return;
    pick = pick === id ? null : id;
    ctx.sfx.click();
    paintHand();
  }

  async function typeOn(target: HTMLElement, text: string, token: number): Promise<void> {
    const full = `“${text}”`;
    if (ctx.calm()) {
      target.textContent = full;
      return;
    }
    const out = el('span');
    const caret = el('i', 'ws-caret');
    target.replaceChildren(out, caret);
    await sleep(350);
    const per = Math.min(26, 2200 / full.length);
    for (let n = 1; n <= full.length; n += 1) {
      if (token !== typing || disposed) return;
      out.textContent = full.slice(0, n);
      if (n % 3 === 0 && full[n - 1] !== ' ') ctx.sfx.tick();
      await sleep(/[,.:;!?]/.test(full[n - 1]) ? per * 5 : per);
    }
    setTimeout(() => caret.remove(), 900);
  }

  function showQuote(): void {
    mode = 'answer';
    pick = null;
    locked = false;
    lockBtn.textContent = 'Lock in';
    const q = quotes[at];
    const slip = el('div', 'ws-slip');
    slip.append(el('span', 'ws-eyebrow', `Quote ${at + 1} of ${quotes.length}`));
    const quote = el('p', 'ws-quote');
    quote.append(el('span', 'ws-ghost', `“${q.text}”`));
    typedEl = el('span', 'ws-typed');
    typedEl.setAttribute('aria-hidden', 'true');
    quote.append(typedEl);
    quote.setAttribute('aria-label', q.text);
    // Tap the quote to show it all at once.
    quote.addEventListener('click', () => {
      if (typedEl && typedEl.textContent !== `“${q.text}”`) {
        typing += 1;
        typedEl.textContent = `“${q.text}”`;
        typedAt = Math.min(typedAt, ctx.elapsedMs());
      }
    });
    slip.append(quote);
    const ask = el('p', 'ws-ask', 'Who said it?');
    hand = el('div', 'ws-hand');
    hand.setAttribute('role', 'group');
    hand.setAttribute('aria-label', 'The cast');
    cast.forEach((c, k) => {
      const b = el('button', 'ws-pc');
      b.type = 'button';
      b.dataset.pick = c.id;
      b.setAttribute('aria-label', `${k + 1}: ${c.name}`);
      // One word per line, as the mockup did, so the part of a card not covered by the next shows the name.
      const name = el('b');
      c.name.trim().split(/\s+/).forEach((w, i) => name.append(...(i ? [el('br'), w] : [w])));
      b.append(cameo(lookOf(c.id), c.emblem), name);
      b.addEventListener('click', () => choose(c.id));
      hand!.append(b);
    });
    pickLine = el('p', 'ws-pick');
    pickLine.setAttribute('aria-live', 'polite');
    root.replaceChildren(slip, ask, hand, pickLine);
    ctx.setActions([fakeBtn, lockBtn]);
    paintHand();
    keepFocus();
    status();
    shownAt = ctx.elapsedMs();
    const token = (typing += 1);
    const typingMs = ctx.calm() ? 0 : 350 + Math.min(26, 2200 / (q.text.length + 2)) * (q.text.length + 2);
    typedAt = shownAt + typingMs;
    void typeOn(typedEl, q.text, token);
    if (!ctx.calm()) {
      void animate(slip, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
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
    if (locked || !pick || mode !== 'answer') return;
    const q = quotes[at];
    const chosen = pick;
    locked = true;
    lockBtn.textContent = 'Checking…';
    paintHand();
    ctx.sfx.lock();
    const now = ctx.elapsedMs();
    let result: EventResult;
    try {
      result = await ctx.emit({ item: q.id, move: 'answer', response: { speaker: chosen }, time_ms: Math.max(0, now - shownAt) }, { now: true });
    } catch (e) {
      if (disposed) return;
      locked = false;
      lockBtn.textContent = 'Lock in';
      paintHand();
      ctx.toast(e instanceof Error && e.message ? e.message : 'That didn’t send. Try again.', 'bad');
      return;
    }
    if (disposed) return;
    const speaker = typeof result.reveal?.speaker === 'string' ? result.reveal.speaker : null;
    const correct = result.correct === true;
    const fake = speaker === FAKE_SPEAKER || (correct && chosen === FAKE_SPEAKER);
    const gain = quotePoints(correct, fake, Math.max(0, now - typedAt), seconds);
    answers.push({ item: q.id, pick: chosen, speaker: speaker ?? (correct ? chosen : null), correct, points: gain });
    points += gain;
    showResult(chosen, speaker ?? (correct ? chosen : null), correct, gain, result.reveal);
  }

  /* ── Result ─────────────────────────────────────────────────────── */

  function showResult(chosen: string, speaker: string | null, correct: boolean, gain: number, reveal: EventResult['reveal']): void {
    mode = 'result';
    const fake = speaker === FAKE_SPEAKER;
    const head = correct ? (fake ? 'Fake caught' : 'Right') : chosen === FAKE_SPEAKER ? 'False alarm: it’s real' : fake ? 'It’s a fake' : 'Not this time';
    const box = el('section', `ws-result ${correct ? 'is-right' : 'is-wrong'}`);
    box.append(el('span', 'ws-eyebrow', head));
    const big = el('div', 'ws-big', correct ? `+${gain}` : '+0');
    box.append(big);
    if (speaker) {
      const mini = el('div', 'ws-mini');
      mini.append(cameo(lookOf(speaker), emblemOf(speaker)));
      box.append(mini, el('p', 'ws-who', fake ? 'Nobody said it' : nameOf(speaker)));
      if (!ctx.calm()) void animate(mini, [{ transform: 'perspective(600px) rotateY(90deg) scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: 120, easing: 'cubic-bezier(0.3, 1.3, 0.5, 1)', fill: 'backwards' });
    }
    if (!correct && chosen !== FAKE_SPEAKER) box.append(el('p', 'ws-you', `You said ${nameOf(chosen)}.`));
    const note = el('div', fake ? 'ws-note ws-note--fake' : 'ws-note');
    if (fake) {
      note.append(el('span', '', 'Why it’s fake'), document.createTextNode(reveal?.why_fake || 'It isn’t in the text.'));
    } else if (speaker) {
      note.append(el('span', '', 'Source'), document.createTextNode(reveal?.source ? `${nameOf(speaker)} · ${reveal.source}` : nameOf(speaker)));
    }
    if (note.childNodes.length) box.append(note);
    root.replaceChildren(box);
    status();
    if (!ctx.calm()) void animate(box, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 380 });
    if (correct) {
      ctx.sfx.right();
      ctx.toast(fake ? `+${gain} points: double for catching a fake` : `+${gain} points`, 'good');
    } else {
      ctx.sfx.wrong();
      if (fake) ctx.toast('You trusted a fake. Read why on your screen.', 'bad');
      else if (speaker) ctx.toast(`It was ${nameOf(speaker)}`, 'bad');
    }
    const last = at >= quotes.length - 1;
    nextBtn.textContent = last ? 'See my summary' : 'Next quote';
    ctx.setActions([nextBtn]);
    nextBtn.focus({ preventScroll: true });
  }

  function next(): void {
    if (mode !== 'result') return;
    if (at >= quotes.length - 1) showSummary();
    else {
      at += 1;
      showQuote();
    }
  }

  /* ── Summary ────────────────────────────────────────────────────── */

  function showSummary(): void {
    mode = 'summary';
    const right = answers.filter((a) => a.correct).length;
    const ear = earForText(answers);
    const box = el('section', 'ws-summary');
    box.append(el('span', 'ws-eyebrow', 'Final points'));
    const big = el('div', 'ws-big', '0');
    box.append(big);
    const brk = el('dl', 'ws-break');
    const row = (label: string, value: string, cls = '') => {
      const d = el('div', cls);
      d.append(el('dt', '', label), el('dd', '', value));
      brk.append(d);
    };
    row('Quotes right', `${right} of ${quotes.length}`);
    row('Fakes caught', ear.fakes ? `${ear.caught} of ${ear.fakes}` : 'No fakes this time');
    row('Real quotes called fake', `${ear.alarms} of ${ear.real}`);
    row('Ear for the text', `${ear.ear >= 0 ? '+' : '−'}${Math.abs(ear.ear)}`, 'ws-tot');
    box.append(brk, el('p', 'ws-explain', 'Your ear for the text is the share of fakes you caught minus the share of real quotes you called fake. Catching fakes without crying wolf scores highest.'));
    root.replaceChildren(box);
    status();
    countUp(big, 0, points, 900);
    ctx.sfx.fanfare();
    if (!ctx.calm()) void animate(box, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
    ctx.setActions([finishBtn]);
    finishBtn.focus({ preventScroll: true });
  }

  const onResize = () => paintHand();

  if (!quotes.length || !cast.length) {
    root.append(el('p', 'gm-solo__state', 'This game has no quotes yet.'));
    ctx.setActions([finishBtn]);
  } else {
    showQuote();
    window.addEventListener('resize', onResize);
  }

  return {
    onKey(e: KeyboardEvent): boolean {
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      if (mode === 'answer') {
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
        if (e.key === 'Enter') {
          if (!pick) return false;
          void lockIn();
          return true;
        }
        return false;
      }
      if (e.key === 'Enter') {
        if (mode === 'result') next();
        else ctx.finish();
        return true;
      }
      return false;
    },
    dispose() {
      disposed = true;
      typing += 1;
      window.removeEventListener('resize', onResize);
      ctx.setActions([]);
      root.remove();
    }
  };
}
