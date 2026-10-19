// apps/tasks/src/views/problem-solver/task-cards.ts
// Confirm cards: nothing becomes a real task until the person presses Create on its card.
// Cards are keyed by proposal id and kept between updates, so typed edits survive polling.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import type { PsProposedTask, PsSession } from '../../../../../packages/problem-solver/types';
import type { TaskEdits } from './task-bridge';

export type TaskCardHandlers = {
  create(proposal: PsProposedTask, edits: TaskEdits): Promise<void>;
  dismiss(proposal: PsProposedTask): Promise<void>;
  createReview(edits: { title: string; due: string }): Promise<void>;
  dismissReview(): Promise<void>;
};
export type TaskCards = { el: HTMLElement; update(session: PsSession): void };

const WAITING = 'Waiting for the coach…';

/** Today as YYYY-MM-DD in local time, the floor for a review date. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function button(label: string, act: string, kind: string): HTMLButtonElement {
  const b = el('button', `btn ${kind}`, label) as HTMLButtonElement;
  b.type = 'button';
  b.dataset.act = act;
  return b;
}

function field(label: string, input: HTMLInputElement): HTMLLabelElement {
  const wrap = el('label', 'ps-taskcard__field') as HTMLLabelElement;
  wrap.append(el('span', 'ps-taskcard__label', label), input);
  return wrap;
}

function input(name: string, type: string, value: string): HTMLInputElement {
  const item = el('input', 'ps-taskcard__input') as HTMLInputElement;
  item.type = type;
  item.name = name;
  item.value = value;
  return item;
}

/**
 * One card: the form, its two buttons, a hint while the coach is busy and an error line.
 * `run` handles the in-flight state (both buttons disabled, the clicked one relabelled) and
 * shows a failure without losing the card.
 */
type Card = { el: HTMLElement; refresh(busy: boolean): void };

function makeCard(
  className: string,
  meta: string,
  fields: HTMLElement[],
  primary: HTMLButtonElement,
  secondary: HTMLButtonElement,
  onPrimary: () => Promise<void>,
  onSecondary: () => Promise<void>,
  extra: HTMLElement | null = null
): Card {
  const card = el('article', `${className} confirm-card`);
  const hint = el('p', 'ps-taskcard__hint');
  const error = el('p', 'ps-taskcard__error');
  error.setAttribute('role', 'alert');
  const row = el('div', 'ps-taskcard__actions');
  row.append(primary, secondary);
  const body = el('div', 'ps-taskcard__fields');
  body.append(...fields);
  card.append(el('p', 'ps-taskcard__meta', meta), body);
  if (extra) card.append(extra);
  card.append(row, hint, error);

  const labels = new Map([[primary, primary.textContent ?? ''], [secondary, secondary.textContent ?? '']]);
  let pending: HTMLButtonElement | null = null;
  let busy = false;

  const paint = () => {
    for (const [b, label] of labels) {
      b.disabled = busy || pending !== null;
      b.textContent = b === pending ? (b === primary ? 'Creating…' : 'Setting aside…') : label;
    }
    hint.textContent = busy ? WAITING : '';
    hint.hidden = !busy;
  };

  const run = (which: HTMLButtonElement, work: () => Promise<void>) => async () => {
    if (pending || busy) return;
    pending = which;
    error.textContent = '';
    paint();
    try {
      await work();
    } catch (err) {
      error.textContent = errorMessage(err);
    } finally {
      pending = null;
      paint();
    }
  };
  primary.addEventListener('click', run(primary, onPrimary));
  secondary.addEventListener('click', run(secondary, onSecondary));

  return {
    el: card,
    refresh(next) {
      busy = next;
      paint();
    }
  };
}

export function mountTaskCards(handlers: TaskCardHandlers): TaskCards {
  const root = el('section', 'ps-taskcards');
  root.setAttribute('aria-label', 'Proposed tasks');
  root.hidden = true;
  const cards = new Map<string, Card>();
  /** The latest copy of each proposal, so a click sends what the server holds now. */
  const latest = new Map<string, PsProposedTask>();
  let review: Card | null = null;
  /** The review proposal's date, used when the date field is cleared. */
  let reviewFallback = '';

  function taskCard(proposal: PsProposedTask): Card {
    const title = input('title', 'text', proposal.title);
    title.maxLength = 120;
    const due = input('due', 'date', proposal.due ?? '');
    const card = makeCard(
      'ps-taskcard',
      'Make this a task?',
      [field('Title', title), field('Due', due)],
      button('Create task', 'create', 'btn--primary'),
      button('Not this one', 'dismiss', 'btn--ghost'),
      () => handlers.create(latest.get(proposal.id) ?? proposal, { title: title.value.trim() || proposal.title, due: due.value || null }),
      () => handlers.dismiss(latest.get(proposal.id) ?? proposal)
    );
    card.el.dataset.proposal = proposal.id;
    return card;
  }

  function reviewCard(session: PsSession): Card {
    const proposal = session.reviewProposal!;
    reviewFallback = proposal.due;
    const titleInput = input('title', 'text', proposal.title);
    titleInput.maxLength = 120;
    const dueInput = input('due', 'date', proposal.due);
    dueInput.min = today();
    return makeCard(
      'ps-reviewcard',
      'Set a date to look back?',
      [field('Title', titleInput), field('Review on', dueInput)],
      button('Create review task', 'create-review', 'btn--primary'),
      button('Not now', 'dismiss-review', 'btn--ghost'),
      () => handlers.createReview({ title: titleInput.value.trim() || proposal.title, due: dueInput.value || reviewFallback }),
      () => handlers.dismissReview(),
      proposal.reason ? el('p', 'ps-taskcard__reason', proposal.reason) : null
    );
  }

  return {
    el: root,
    update(session) {
      const busy = session.runner.status === 'queued' || session.runner.status === 'running';
      const open = (session.proposedTasks ?? []).filter((p) => p.status === 'proposed');
      const ids = new Set(open.map((p) => p.id));
      for (const [id, card] of cards) {
        if (ids.has(id)) continue;
        card.el.remove();
        cards.delete(id);
        latest.delete(id);
      }
      for (const proposal of open) {
        latest.set(proposal.id, proposal);
        let card = cards.get(proposal.id);
        if (!card) {
          card = taskCard(proposal);
          cards.set(proposal.id, card);
        }
        card.refresh(busy);
      }

      const showReview = session.reviewProposal?.status === 'proposed' && !session.reviewTaskId;
      if (showReview && !review) review = reviewCard(session);
      if (!showReview && review) {
        review.el.remove();
        review = null;
      }
      if (review) {
        reviewFallback = session.reviewProposal!.due;
        review.refresh(busy);
      }

      // The coach's order, the review card last. Only out-of-place cards move, so a field
      // being typed in keeps its focus.
      const order = [...open.map((p) => cards.get(p.id)!.el), ...(review ? [review.el] : [])];
      let cursor = root.firstElementChild;
      for (const node of order) {
        if (node === cursor) cursor = cursor.nextElementSibling;
        else root.insertBefore(node, cursor);
      }
      root.hidden = cards.size === 0 && !review;
    }
  };
}
