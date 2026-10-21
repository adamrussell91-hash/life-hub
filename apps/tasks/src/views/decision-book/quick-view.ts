// apps/tasks/src/views/decision-book/quick-view.ts
// The quick decision page (the Yes/No chart with the Stop Rule band, the coach, the check card,
// It came back and Go deeper) and the "From a quick decision" panel a full decision shows when
// it came from one. Shaped like Problem Solver's lightning-view.ts. The page owns no network
// calls: view.ts passes handlers that go through the session sync.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { decisionOf } from '../../../../../packages/decision-book/quick.mjs';
import { checkDateText, createQuickView, type QuickAnswer, type QuickView } from '../../../../../packages/decision-book/render/quick';
import type { DmQuickState, PsAction, PsSession } from '../../../../../packages/problem-solver/types';
import { mountCoachPanel, type CoachPanel } from '../problem-solver/coach-panel';
import { isBusy } from '../problem-solver/api';
import { DM_LOOK } from './decor';

const sessionHref = (id: string): string => `#/decision-maker?id=${encodeURIComponent(id)}`;

export type QuickPageHandlers = {
  /** A Yes or No on the test being asked. */
  onAnswer(node: string, answer: QuickAnswer): void;
  onSay(text: string): void;
  /** Coach panel actions: retry, escalate (Go deeper) and dismiss_suggestion. */
  onAction(action: PsAction): void;
  /** "It came back"; resolves once the new round is posted (or failed). */
  onAgain(): Promise<void>;
  /** The check card: make the task (resolves once it is linked) or set it aside. */
  onCheck(create: boolean): Promise<void>;
};

export type QuickPage = {
  el: HTMLElement;
  coach: CoachPanel;
  update(session: PsSession): void;
  /** A short failure note above the composer, replaced by the next one. */
  flash(err: unknown): void;
  /** Let the chart's Yes and No be pressed again after an answer that did not go through. */
  releaseAnswer(): void;
  /** Hold Go deeper while its post is out ("Opening a full decision…"). */
  setEscalating(pending: boolean): void;
  focusComposer(): void;
  destroy(): void;
};

/** The check card: the date the run set, offered as a task until it is made or set aside. */
function checkCard(onCheck: QuickPageHandlers['onCheck']): { el: HTMLElement; update(state: DmQuickState | null | undefined, title: string): void } {
  const card = el('div', 'dm-qk-check confirm-card');
  card.hidden = true;
  const line = el('p', 'dm-qk-check__line');
  const status = el('p', 'dm-qk-check__status');
  status.setAttribute('role', 'status');
  const create = el('button', 'btn btn--primary', 'Create check task') as HTMLButtonElement;
  create.type = 'button';
  const later = el('button', 'btn btn--ghost', 'Not now') as HTMLButtonElement;
  later.type = 'button';
  const row = el('div', 'dm-qk-check__actions');
  row.append(create, later);
  card.append(el('p', 'dm-qk-check__title', 'A dated check'), line, row, status);
  const press = async (make: boolean) => {
    if (create.disabled) return;
    create.disabled = later.disabled = true;
    status.textContent = '';
    try {
      await onCheck(make);
    } catch (err) {
      status.textContent = errorMessage(err);
    } finally {
      create.disabled = later.disabled = false;
    }
  };
  create.addEventListener('click', () => void press(true));
  later.addEventListener('click', () => void press(false));
  return {
    el: card,
    update(state, title) {
      const check = state?.check;
      card.hidden = !check || Boolean(check.taskId) || check.dismissed;
      if (check) line.textContent = `Check "${title}" on ${checkDateText(check.due)}.`;
    }
  };
}

export function mountQuickPage(session: PsSession, handlers: QuickPageHandlers): QuickPage {
  const page = el('div', 'ps-page ps-session ps-scope dm-scope dm-page dm-qk-page');
  const back = el('a', 'ps-back', '← Decisions') as HTMLAnchorElement;
  back.href = '#/decision-maker';
  const title = el('h2', 'ps-session__title', session.title);
  const kicker = el('p', 'dm-qk-page__kicker', 'Quick decision: three yes/no tests, then a Stop Rule');

  const chart = createQuickView(document, { onAnswer: (node, answer) => handlers.onAnswer(node, answer) });
  const chartRow = el('section', 'dm-qk-page__chart');
  chartRow.append(chart.el);

  const check = checkCard((make) => handlers.onCheck(make));

  // How the run goes on: It came back once it is done; Go deeper while it has not gone deeper.
  const actions = el('div', 'dm-qk-page__actions');
  const doneLine = el('p', 'dm-qk-page__done-line', 'That call is made');
  const again = el('button', 'btn btn--ghost dm-qk-page__again', 'It came back') as HTMLButtonElement;
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
  const deeper = el('button', 'btn btn--ghost dm-qk-page__deeper', 'Go deeper') as HTMLButtonElement;
  deeper.type = 'button';
  deeper.addEventListener('click', () => {
    if (!deeper.disabled) handlers.onAction('escalate');
  });
  const pending = el('p', 'dm-qk-page__pending', 'Opening a full decision…');
  pending.setAttribute('role', 'status');
  pending.hidden = true;
  actions.append(doneLine, again, deeper, pending);

  const sent = el('div', 'dm-qk-page__sent');
  sent.setAttribute('role', 'status');
  sent.hidden = true;
  const sentLink = el('a', 'dm-qk-page__sent-link', 'Open the full decision') as HTMLAnchorElement;
  sent.append(el('p', 'dm-qk-page__sent-line', 'This went on to a full decision.'), sentLink);

  const coach = mountCoachPanel({ onSay: (text) => handlers.onSay(text), onAction: (action) => handlers.onAction(action) }, { look: DM_LOOK });
  const board = el('div', 'dm-qk-page__board');
  board.append(check.el, actions, sent, coach.el);
  const body = el('div', 'dm-qk-page__body');
  body.append(chartRow, board);
  page.append(back, title, kicker, body);

  let destroyed = false;
  let busy = isBusy(session);
  let escalating = false;
  const answerButtons = () => [...chart.el.querySelectorAll<HTMLButtonElement>('.dm-qk__answer')];

  /** While the coach is thinking, the chart's Yes and No wait with it; they come back once it has answered. */
  let lockedForCoach = false;
  function lockAnswers(): void {
    if (busy) {
      lockedForCoach = true;
      for (const button of answerButtons()) button.setAttribute('aria-disabled', 'true');
    } else if (lockedForCoach) {
      lockedForCoach = false;
      for (const button of answerButtons()) button.removeAttribute('aria-disabled');
    }
  }

  /** Go deeper, on the page and on the coach's card, waits while its post is out or the coach is thinking. */
  function holdDeeper(): void {
    deeper.disabled = escalating || busy;
    pending.hidden = !escalating;
    for (const button of coach.el.querySelectorAll<HTMLButtonElement>('.ps-suggestion__actions button')) button.disabled = escalating || busy;
  }

  return {
    el: page,
    coach,
    update(next) {
      if (destroyed) return;
      if (title.textContent !== next.title) title.textContent = next.title;
      const state = next.quick;
      busy = isBusy(next);
      if (state) chart.update(state);
      lockAnswers();
      check.update(state, state ? decisionOf(state) || next.title : next.title);
      const escalatedTo = state?.escalatedTo ?? null;
      sent.hidden = !escalatedTo;
      if (escalatedTo && sentLink.getAttribute('href') !== sessionHref(escalatedTo)) sentLink.href = sessionHref(escalatedTo);
      const finished = Boolean(state?.finishedAt);
      actions.hidden = Boolean(escalatedTo);
      doneLine.hidden = !finished;
      again.hidden = !finished;
      coach.update(next);
      holdDeeper();
    },
    flash(err) {
      coach.el.querySelector('.ps-coach__status--failed.is-transient')?.remove();
      coach.el.querySelector('.ps-coach__extras')?.prepend(el('p', 'ps-coach__status ps-coach__status--failed is-transient', errorMessage(err)));
    },
    releaseAnswer() {
      if (busy) return;
      for (const button of answerButtons()) button.removeAttribute('aria-disabled');
    },
    setEscalating(value) {
      escalating = value;
      holdDeeper();
    },
    focusComposer() {
      const input = coach.el.querySelector<HTMLTextAreaElement>('textarea');
      if (input && !input.disabled) input.focus();
    },
    destroy() {
      destroyed = true;
      chart.destroy();
    }
  };
}

/**
 * On a full decision that came from a quick run: a closed panel that, opened, fetches the run once
 * and shows its chart read-only, with a link back to it. A failed fetch offers a retry.
 */
export function mountFromQuick(runId: string, get: (id: string) => Promise<PsSession>): { el: HTMLDetailsElement; destroy(): void } {
  const panel = el('details', 'ps-ltn-from dm-qk-from') as HTMLDetailsElement;
  const summary = el('summary', 'ps-ltn-from__summary', 'From a quick decision: the tests tried first');
  const body = el('div', 'ps-ltn-from__body');
  panel.append(summary, body);
  let chart: QuickView | null = null;
  let loading = false;
  let destroyed = false;

  async function load(): Promise<void> {
    if (chart || loading || destroyed) return;
    loading = true;
    const focused = body.contains(document.activeElement);
    body.replaceChildren(el('p', 'ps-ltn-from__status', 'Loading…'));
    try {
      const run = await get(runId);
      if (destroyed) return;
      const view = createQuickView(document);
      if (run.quick) view.update(run.quick);
      chart = view;
      const link = el('a', 'ps-ltn-from__link', 'Open the quick decision') as HTMLAnchorElement;
      link.href = sessionHref(runId);
      body.replaceChildren(view.el, link);
    } catch {
      if (destroyed) return;
      const retry = el('button', 'ps-ltn-from__retry', 'Try again') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', () => void load());
      const failed = el('div', 'ps-ltn-from__failed');
      failed.setAttribute('role', 'alert');
      failed.append(el('p', 'ps-ltn-from__status', 'Could not load the quick decision.'), retry);
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
