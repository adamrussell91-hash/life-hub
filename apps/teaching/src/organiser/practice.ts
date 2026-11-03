/**
 * A practice session: one card at a time. Got it and Again post at once; Again also brings the card
 * back later in this session. A result that can't be posted waits in local storage and goes with the next
 * review. No scores, streaks or percentages: only how many cards are left.
 */
import { el, readJSON, writeJSON } from '@/quiz/dom';
import { studentOrganiserApi } from './api';
import type { PracticeCard, PracticeLoad, PracticeNext, ReviewResult } from './types';

export type PracticeApi = { review(classId: string, results: ReviewResult[]): Promise<{ today: number; next: PracticeNext }> };
export type PracticeOptions = {
  classId: string;
  load: PracticeLoad;
  /** Test seam; defaults to the student organiser endpoint. */
  api?: PracticeApi;
  /** Back to the organiser after the session. */
  onExit?: () => void;
};
export type PracticeHandle = {
  /** Resolves once every result posted so far has settled. */
  settled(): Promise<void>;
  dispose(): void;
};

const pendingKey = (classId: string): string => `teaching.organiser.pending.${classId}`;
const MAX_PER_REVIEW = 40;

export function readPending(classId: string): ReviewResult[] {
  const v = readJSON<ReviewResult[]>(pendingKey(classId));
  return Array.isArray(v) ? v.filter((r) => r && typeof r.line_id === 'string' && (r.result === 'got' || r.result === 'again')) : [];
}
function writePending(classId: string, list: ReviewResult[]): void {
  writeJSON(pendingKey(classId), list.length ? list : null);
}

function weekday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' });
}
export function nextCardsLine(next: PracticeNext): string {
  if (!next) return 'New lines join your practice after each lesson.';
  return `Your next ${next.count === 1 ? 'card comes' : `${next.count} cards come`} on ${weekday(next.date)}.`;
}

export function mountPractice(host: HTMLElement, options: PracticeOptions): PracticeHandle {
  const { classId, load } = options;
  const api = options.api ?? studentOrganiserApi;
  const queue: PracticeCard[] = [...load.cards];
  let i = 0;
  let shown = false;
  let typed = '';
  let next: PracticeNext = load.next;
  let disposed = false;
  let chain: Promise<void> = Promise.resolve();

  /** Sends what is waiting plus the new result; on failure everything stays queued for next time. */
  const post = (result?: ReviewResult): Promise<void> => {
    chain = chain.then(async () => {
      const list = [...readPending(classId), ...(result ? [result] : [])];
      if (!list.length) return;
      try {
        let reply: Awaited<ReturnType<PracticeApi['review']>> | undefined;
        for (let at = 0; at < list.length; at += MAX_PER_REVIEW) reply = await api.review(classId, list.slice(at, at + MAX_PER_REVIEW));
        writePending(classId, []);
        if (reply) next = reply.next;
      } catch {
        writePending(classId, list);
      }
    });
    return chain;
  };

  function answerCard(result: 'got' | 'again'): void {
    const card = queue[i]!;
    void post({ line_id: card.line_id, result });
    if (result === 'again') queue.push(card);
    i += 1;
    shown = false;
    typed = '';
    paint();
  }

  function paint(): void {
    if (disposed) return;
    const wrap = el('div', 'kos-root');
    if (i >= queue.length) {
      const card = el('div', 'kos-card');
      card.append(el('p', 'kos-card__cue', 'All done for today.'));
      const line = el('p', 'kos-hint', `Everything you practised is booked in to come back. ${nextCardsLine(next)}`);
      line.setAttribute('role', 'status');
      card.append(line);
      const actions = el('div', 'kos-actions');
      const back = el('button', 'kos-btn kos-btn--primary', 'Back to my organiser');
      back.type = 'button';
      back.addEventListener('click', () => options.onExit?.());
      actions.append(back);
      card.append(actions);
      wrap.append(card);
      host.replaceChildren(wrap);
      // The words above use what the last review said; settle the rest and refresh the line.
      void chain.then(() => {
        if (!disposed && i >= queue.length) line.textContent = `Everything you practised is booked in to come back. ${nextCardsLine(next)}`;
      });
      return;
    }
    const c = queue[i]!;
    const card = el('div', 'kos-card');
    card.append(el('p', 'kos-card__from', c.section), el('p', 'kos-card__cue', c.cue));
    if (!shown) {
      const ta = el('textarea', 'kos-card__type');
      ta.placeholder = 'Type it if you like, or say it to yourself';
      ta.setAttribute('aria-label', 'Your answer');
      ta.value = typed;
      ta.addEventListener('input', () => (typed = ta.value));
      const actions = el('div', 'kos-actions');
      const show = el('button', 'kos-btn kos-btn--primary', 'Show answer');
      show.type = 'button';
      show.addEventListener('click', () => {
        shown = true;
        paint();
      });
      actions.append(show);
      card.append(ta, actions);
    } else {
      if (typed.trim()) {
        const w = el('div', 'kos-wroteblock');
        w.append(el('b', undefined, 'You wrote'), document.createTextNode(typed.trim()));
        card.append(w);
      }
      card.append(el('p', 'kos-card__answer', c.answer));
      for (const m of c.more) {
        const d = el('div', 'kos-card__more');
        d.append(el('span', undefined, m.label), document.createTextNode(m.text));
        card.append(d);
      }
      if (c.builds) {
        const b = el('p', 'kos-card__builds');
        b.append(el('b', undefined, 'This builds your big idea'), document.createTextNode(c.builds));
        card.append(b);
      }
      const actions = el('div', 'kos-actions');
      const got = el('button', 'kos-btn kos-btn--primary', 'Got it');
      got.type = 'button';
      got.dataset.result = 'got';
      got.addEventListener('click', () => answerCard('got'));
      const again = el('button', 'kos-btn', 'Again');
      again.type = 'button';
      again.dataset.result = 'again';
      again.addEventListener('click', () => answerCard('again'));
      actions.append(got, again);
      card.append(actions);
    }
    const left = queue.length - i;
    wrap.append(card, el('p', 'kos-card__count', `${left} to go today`));
    host.replaceChildren(wrap);
  }

  // Anything left over from an earlier sitting goes first.
  if (readPending(classId).length) void post();
  paint();

  return {
    settled: () => chain,
    dispose() {
      disposed = true;
    }
  };
}
