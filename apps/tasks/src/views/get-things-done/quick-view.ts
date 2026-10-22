// apps/tasks/src/views/get-things-done/quick-view.ts
// The Quick start page (the route chart with the target and dart, the coach, the check card,
// It came back and Go deeper) and the "Began as a Quick start" panel a full session shows when
// it came from one. Shaped like Decision Maker's quick-view.ts. The page owns no network calls:
// view.ts passes handlers that go through the session sync.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { taskOf } from '../../../../../packages/get-things-done/quick.mjs';
import { checkPointText, createStartView, type StartView } from '../../../../../packages/get-things-done/render/quick';
import type { GtStartState, GtStartWay, PsAction, PsSession } from '../../../../../packages/problem-solver/types';
import { mountCoachPanel, type CoachPanel } from '../problem-solver/coach-panel';
import { isBusy } from '../problem-solver/api';
import { GT_LOOK } from './decor';

const sessionHref = (id: string): string => `#/gear-shifter?id=${encodeURIComponent(id)}`;

export type StartPageHandlers = {
  /** A way to start, picked on the chart. */
  onPick(node: string, way: GtStartWay): void;
  onSay(text: string): void;
  /** Coach panel actions: retry, escalate (Go deeper) and dismiss_suggestion. */
  onAction(action: PsAction): void;
  /** "It came back"; resolves once the new round is posted (or failed). */
  onAgain(): Promise<void>;
  /** The check card: make the task (resolves once it is linked) or set it aside. */
  onCheck(create: boolean): Promise<void>;
};

export type StartPage = {
  el: HTMLElement;
  coach: CoachPanel;
  update(session: PsSession): void;
  /** A short failure note above the composer, replaced by the next one. */
  flash(err: unknown): void;
  /** Let the chart's two ways be pressed again after a pick that did not go through. */
  releasePick(): void;
  /** Hold Go deeper while its post is out ("Opening a full session…"). */
  setEscalating(pending: boolean): void;
  focusComposer(): void;
  destroy(): void;
};

/** The check card: the check-back date, offered as a task until it is made or set aside. */
function checkCard(onCheck: StartPageHandlers['onCheck']): { el: HTMLElement; update(state: GtStartState | null | undefined, task: string): void } {
  const card = el('div', 'gt-qs-check confirm-card');
  card.hidden = true;
  const line = el('p', 'gt-qs-check__line');
  const status = el('p', 'gt-qs-check__status');
  status.setAttribute('role', 'status');
  const create = el('button', 'btn btn--primary', 'Create check task') as HTMLButtonElement;
  create.type = 'button';
  const later = el('button', 'btn btn--ghost', 'Not now') as HTMLButtonElement;
  later.type = 'button';
  const row = el('div', 'gt-qs-check__actions');
  row.append(create, later);
  card.append(el('p', 'gt-qs-check__title', 'A dated check-back'), line, row, status);
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
    update(state, task) {
      const check = state?.check;
      card.hidden = !check || Boolean(check.taskId) || check.dismissed;
      if (check) line.textContent = `Check back on "${task}" on ${checkPointText(check.due)}.`;
    }
  };
}

export function mountStartPage(session: PsSession, handlers: StartPageHandlers): StartPage {
  const page = el('div', 'ps-page ps-session ps-scope gt-scope gt-page gt-qs-page');
  const back = el('a', 'ps-back', '← Your work') as HTMLAnchorElement;
  back.href = '#/gear-shifter';
  const title = el('h2', 'ps-session__title', session.title);
  const kicker = el('p', 'gt-qs-page__kicker', 'Quick start: one small action, how it starts, and when to check back');

  const chart = createStartView(document, { onPick: (node, way) => handlers.onPick(node, way) });
  const chartRow = el('section', 'gt-qs-page__chart');
  chartRow.append(chart.el);

  const check = checkCard((make) => handlers.onCheck(make));

  // How the run goes on: It came back once it is done; Go deeper while it has not gone deeper.
  const actions = el('div', 'gt-qs-page__actions');
  const doneLine = el('p', 'gt-qs-page__done-line', 'That one is moving');
  const again = el('button', 'btn btn--ghost gt-qs-page__again', 'It came back') as HTMLButtonElement;
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
  const deeper = el('button', 'btn btn--ghost gt-qs-page__deeper', 'Go deeper') as HTMLButtonElement;
  deeper.type = 'button';
  deeper.addEventListener('click', () => {
    if (!deeper.disabled) handlers.onAction('escalate');
  });
  const pending = el('p', 'gt-qs-page__pending', 'Opening a full session…');
  pending.setAttribute('role', 'status');
  pending.hidden = true;
  actions.append(doneLine, again, deeper, pending);

  const sent = el('div', 'gt-qs-page__sent');
  sent.setAttribute('role', 'status');
  sent.hidden = true;
  const sentLink = el('a', 'gt-qs-page__sent-link', 'Open the full session') as HTMLAnchorElement;
  sent.append(el('p', 'gt-qs-page__sent-line', 'This went on to a full session.'), sentLink);

  const coach = mountCoachPanel({ onSay: (text) => handlers.onSay(text), onAction: (action) => handlers.onAction(action) }, { look: GT_LOOK });
  const board = el('div', 'gt-qs-page__board');
  board.append(check.el, actions, sent, coach.el);
  const body = el('div', 'gt-qs-page__body');
  body.append(chartRow, board);
  page.append(back, title, kicker, body);

  let destroyed = false;
  let busy = isBusy(session);
  let escalating = false;
  const pickButtons = () => [...chart.el.querySelectorAll<HTMLButtonElement>('.gt-qs__pick')];

  /** While the coach is thinking, the chart's two ways wait with it; they come back once it has answered. */
  let lockedForCoach = false;
  function lockPicks(): void {
    if (busy) {
      lockedForCoach = true;
      for (const button of pickButtons()) button.setAttribute('aria-disabled', 'true');
    } else if (lockedForCoach) {
      lockedForCoach = false;
      for (const button of pickButtons()) button.removeAttribute('aria-disabled');
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
      const state = next.start;
      busy = isBusy(next);
      if (state) chart.update(state);
      lockPicks();
      check.update(state, state ? taskOf(state) || next.title : next.title);
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
    releasePick() {
      if (busy) return;
      for (const button of pickButtons()) button.removeAttribute('aria-disabled');
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
 * On a full session that came from a Quick start: a closed panel that, opened, fetches the run
 * once and shows its chart read-only, with a link back to it. A failed fetch offers a retry.
 */
export function mountFromStart(runId: string, get: (id: string) => Promise<PsSession>): { el: HTMLDetailsElement; destroy(): void } {
  const panel = el('details', 'ps-ltn-from gt-qs-from') as HTMLDetailsElement;
  const summary = el('summary', 'ps-ltn-from__summary', 'Began as a Quick start: the first action tried');
  const body = el('div', 'ps-ltn-from__body');
  panel.append(summary, body);
  let chart: StartView | null = null;
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
      const view = createStartView(document);
      if (run.start) view.update(run.start);
      chart = view;
      const link = el('a', 'ps-ltn-from__link', 'Open the Quick start') as HTMLAnchorElement;
      link.href = sessionHref(runId);
      body.replaceChildren(view.el, link);
    } catch {
      if (destroyed) return;
      const retry = el('button', 'ps-ltn-from__retry', 'Try again') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', () => void load());
      const failed = el('div', 'ps-ltn-from__failed');
      failed.setAttribute('role', 'alert');
      failed.append(el('p', 'ps-ltn-from__status', 'Could not load the Quick start.'), retry);
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
