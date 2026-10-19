// apps/tasks/src/views/problem-solver/review-panel.ts
// Improve waits for real results: the panel above the chart while it waits, and the banner a
// review task's link opens with. Both start the review through the page's `start`.
import { el } from '@/views/hub-kit';
import { planStepForBook, stepName } from '../../../../../packages/problem-solver/steps.mjs';
import { waitingForReview } from '../../../../../packages/problem-solver/review.mjs';
import type { PsSession } from '../../../../../packages/problem-solver/types';

/** How a review link enters the session: move into Improve, start it there, or reopen it after. */
export type ReviewEntry = { kind: 'move' | 'start' | 'reopen'; step: string };
export type ReviewPanel = { el: HTMLElement; update(session: PsSession): void };

/** The session's Improve plan step, or null before a model is chosen. */
export function improveStep(session: PsSession): string | null {
  return session.model ? planStepForBook(session.model.id, 'improve') : null;
}

/** True while Improve is open and waiting for its review (the server's own rule). */
export function waitingInImprove(session: PsSession): boolean {
  return waitingForReview(session);
}

function dueLabel(due: string | null | undefined): string {
  if (!due) return '';
  return new Date(`${due}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function mountReviewPanel({ start }: { start: () => void }): ReviewPanel {
  const panel = el('section', 'ps-review');
  panel.setAttribute('aria-label', 'Review');
  panel.hidden = true;
  const line = el('p', 'ps-review__line');
  line.setAttribute('role', 'status');
  const go = el('button', 'btn btn--primary ps-review__go', 'Review now') as HTMLButtonElement;
  go.type = 'button';
  const note = el('p', 'ps-review__note', 'Or move on; the review brings you back here.');
  const row = el('div', 'ps-review__row');
  row.append(go, note);
  panel.append(line, row);
  go.addEventListener('click', () => {
    if (go.disabled) return;
    go.disabled = true;
    start();
  });
  return {
    el: panel,
    update(session) {
      const on = waitingInImprove(session);
      panel.hidden = !on;
      go.disabled = false;
      if (!on) return;
      const name = stepName(session.model!.id, session.phase);
      const date = dueLabel(session.reviewState?.due);
      const text = date ? `${name} picks up at your review on ${date}.` : `${name} picks up at your review.`;
      if (line.textContent !== text) line.textContent = text;
    }
  };
}

const BANNER: Record<ReviewEntry['kind'], (name: string) => [string, string]> = {
  move: (name) => [`This review picks up at ${name}.`, 'Start the review'],
  start: () => ['Your review is due.', 'Start the review'],
  reopen: (name) => [`This problem has moved on. The review adds a new ${name} pass, then brings you back.`, 'Review the results']
};

/** The banner a review task's link opens with. `name` is the Improve step's name in this model. */
export function reviewBanner(entry: ReviewEntry, start: () => void, name = 'Improve'): HTMLElement {
  const [text, label] = BANNER[entry.kind](name);
  const banner = el('div', 'ps-resume');
  banner.setAttribute('role', 'status');
  const go = el('button', 'ps-resume__go', label) as HTMLButtonElement;
  go.type = 'button';
  go.addEventListener('click', () => {
    go.disabled = true;
    start();
  });
  banner.append(el('span', 'ps-resume__text', text), go);
  return banner;
}
