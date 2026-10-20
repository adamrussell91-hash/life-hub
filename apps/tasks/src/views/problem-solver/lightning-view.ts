// apps/tasks/src/views/problem-solver/lightning-view.ts
// The Lightning run page (the question strip, the chart, the coach and how the run ends) and
// the "From Lightning" panel a full session shows when it came from a run. Ink and paper only.
// The page owns no network calls: view.ts passes handlers that go through the session sync.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { LIGHTNING_QUESTIONS, currentEntry, questionOf } from '../../../../../packages/problem-solver/lightning.mjs';
import { createLightningView, type LightningAnswer, type LightningView } from '../../../../../packages/problem-solver/render/lightning';
import type { PsAction, PsLightningNodeId, PsLightningState, PsSession } from '../../../../../packages/problem-solver/types';
import { mountCoachPanel, type CoachPanel } from './coach-panel';

const sessionHref = (id: string): string => `#/problem-solver?id=${encodeURIComponent(id)}`;

/** The four questions across the top. Lit once the current round reaches one; the current one is marked. */
export function createLightningStrip(): { el: HTMLOListElement; update(state: PsLightningState): void } {
  const strip = el('ol', 'ps-ltn-strip');
  strip.setAttribute('aria-label', 'The four questions');
  const items = new Map<string, HTMLLIElement>();
  LIGHTNING_QUESTIONS.forEach((question, i) => {
    const item = el('li', 'ps-ltn-strip__q');
    item.dataset.question = question.id;
    item.dataset.lit = 'false';
    item.append(el('span', 'ps-ltn-strip__n', String(i + 1)), el('span', 'ps-ltn-strip__label', question.label));
    strip.append(item);
    items.set(question.id, item);
  });
  return {
    el: strip,
    update(state) {
      const lit = new Set<string>();
      state.path.forEach((entry, i) => {
        if (entry.round === state.rounds) lit.add(questionOf(entry.node, state.path[i - 1]?.node ?? null));
      });
      const cur = currentEntry(state);
      const now = cur ? questionOf(cur.node, state.path.at(-2)?.node ?? null) : null;
      for (const [id, item] of items) {
        const on = String(lit.has(id));
        if (item.dataset.lit !== on) item.dataset.lit = on;
        if (id === now) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      }
    }
  };
}

export type LightningPageHandlers = {
  /** A Yes or No on the chart's current box. */
  onAnswer(node: PsLightningNodeId, answer: LightningAnswer): void;
  onSay(text: string): void;
  /** Coach panel actions: retry, escalate (Start the full process) and dismiss_suggestion. */
  onAction(action: PsAction): void;
  /** "It came back"; resolves once the new round is posted (or failed). */
  onAgain(): Promise<void>;
};

export type LightningPage = {
  el: HTMLElement;
  coach: CoachPanel;
  update(session: PsSession): void;
  /** A short failure note above the composer, replaced by the next one. */
  flash(err: unknown): void;
  /** Let the chart's Yes and No be pressed again after an answer that did not go through. */
  releaseAnswer(): void;
  destroy(): void;
};

export function mountLightningPage(session: PsSession, handlers: LightningPageHandlers): LightningPage {
  const page = el('div', 'ps-page ps-session ps-ltn-page ps-scope');
  const back = el('a', 'ps-back', '← Problems') as HTMLAnchorElement;
  back.href = '#/problem-solver';
  const title = el('h2', 'ps-session__title', session.title);
  const strip = createLightningStrip();

  const chart = createLightningView(document, { onAnswer: (node, answer) => handlers.onAnswer(node, answer) });
  const chartRow = el('section', 'ps-ltn-page__chart');
  chartRow.setAttribute('aria-label', 'The flowchart');
  chartRow.append(chart.el);

  // How the run ends: done (with It came back), or sent on to the full process.
  const done = el('div', 'ps-ltn-page__done');
  done.hidden = true;
  const again = el('button', 'ps-ltn-page__again', 'It came back') as HTMLButtonElement;
  again.type = 'button';
  again.addEventListener('click', async () => {
    if (again.disabled) return;
    again.disabled = true;
    try {
      await handlers.onAgain();
    } finally {
      again.disabled = false;
    }
  });
  done.append(el('p', 'ps-ltn-page__done-line', 'That run is done'), again);
  const sent = el('div', 'ps-ltn-page__sent');
  sent.setAttribute('role', 'status');
  sent.hidden = true;
  const sentLink = el('a', 'ps-ltn-page__sent-link', 'Open the full process') as HTMLAnchorElement;
  sent.append(el('p', 'ps-ltn-page__sent-line', 'This went to the full process.'), sentLink);

  const coach = mountCoachPanel({ onSay: (text) => handlers.onSay(text), onAction: (action) => handlers.onAction(action) });
  const board = el('div', 'ps-ltn-page__board');
  board.append(done, sent, coach.el);
  page.append(back, title, strip.el, chartRow, board);

  let destroyed = false;
  return {
    el: page,
    coach,
    update(next) {
      if (destroyed) return;
      if (title.textContent !== next.title) title.textContent = next.title;
      const state = next.lightning;
      if (state) {
        strip.update(state);
        chart.update(state);
      }
      const escalatedTo = state?.escalatedTo ?? null;
      sent.hidden = !escalatedTo;
      if (escalatedTo && sentLink.getAttribute('href') !== sessionHref(escalatedTo)) sentLink.href = sessionHref(escalatedTo);
      done.hidden = Boolean(escalatedTo) || !state?.finishedAt;
      coach.update(next);
    },
    flash(err) {
      coach.el.querySelector('.ps-coach__status--failed.is-transient')?.remove();
      coach.el.querySelector('.ps-coach__extras')?.prepend(el('p', 'ps-coach__status ps-coach__status--failed is-transient', errorMessage(err)));
    },
    releaseAnswer() {
      for (const button of chart.el.querySelectorAll('.ps-ltn__answer')) button.removeAttribute('aria-disabled');
    },
    destroy() {
      destroyed = true;
      chart.destroy();
    }
  };
}

/**
 * On a full session escalated from a run: a closed panel that, opened, fetches the run once
 * and shows its chart read-only, with a link back to it. A failed fetch offers a retry.
 */
export function mountFromLightning(runId: string, get: (id: string) => Promise<PsSession>): { el: HTMLDetailsElement; destroy(): void } {
  const panel = el('details', 'ps-ltn-from') as HTMLDetailsElement;
  const summary = el('summary', 'ps-ltn-from__summary', 'From Lightning: the quick route tried first');
  const body = el('div', 'ps-ltn-from__body');
  panel.append(summary, body);
  let chart: LightningView | null = null;
  let loading = false;
  let destroyed = false;

  async function load(): Promise<void> {
    if (chart || loading || destroyed) return;
    loading = true;
    // A retry pressed with the keyboard keeps focus on what replaces it.
    const focused = body.contains(document.activeElement);
    body.replaceChildren(el('p', 'ps-ltn-from__status', 'Loading…'));
    try {
      const run = await get(runId);
      if (destroyed) return;
      const view = createLightningView(document);
      if (run.lightning) view.update(run.lightning);
      chart = view;
      const link = el('a', 'ps-ltn-from__link', 'Open the Lightning run') as HTMLAnchorElement;
      link.href = sessionHref(runId);
      body.replaceChildren(view.el, link);
    } catch {
      if (destroyed) return;
      const retry = el('button', 'ps-ltn-from__retry', 'Try again') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', () => void load());
      const failed = el('div', 'ps-ltn-from__failed');
      failed.setAttribute('role', 'alert');
      failed.append(el('p', 'ps-ltn-from__status', 'Could not load the Lightning run.'), retry);
      body.replaceChildren(failed);
      if (focused) retry.focus();
    } finally {
      loading = false;
    }
  }

  panel.addEventListener('toggle', () => {
    if (panel.open) void load();
  });
  return {
    el: panel,
    destroy() {
      destroyed = true;
      chart?.destroy();
      chart = null;
    }
  };
}
