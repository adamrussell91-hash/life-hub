// apps/tasks/src/views/problem-solver/task-cards.ts
// Confirm cards: nothing becomes a real task until the person presses Create on its card.
// Cards are keyed by proposal id and kept between updates, so typed edits survive polling.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { taskPageHash } from '@/domain/cards';
import type { PsProposedTask, PsSession } from '../../../../../packages/problem-solver/types';
import { TaskNotLinkedError, type TaskEdits } from './task-bridge';

export type TaskCardHandlers = {
  create(proposal: PsProposedTask, edits: TaskEdits): Promise<void>;
  dismiss(proposal: PsProposedTask): Promise<void>;
  createReview(edits: { title: string; due: string }): Promise<void>;
  dismissReview(): Promise<void>;
};
export type TaskCardOptions = {
  /** Where focus goes when a card removes itself and no card is left (the composer). */
  fallbackFocus?: () => HTMLElement | null;
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

/** An error's text; a task created but not linked also links to the task. */
function errorContent(err: unknown): Node[] {
  if (!(err instanceof TaskNotLinkedError)) return [document.createTextNode(errorMessage(err))];
  const link = el('a', 'ps-taskcard__link', 'Open the task') as HTMLAnchorElement;
  link.href = taskPageHash(err.taskId);
  return [document.createTextNode(`${err.message} `), link];
}

/**
 * One card: the form, its two buttons, a hint while the coach is busy and an error line.
 * `run` handles the in-flight state (both buttons disabled, the clicked one relabelled) and
 * shows a failure without losing the card.
 */
type Card = { el: HTMLElement; refresh(busy: boolean): void };
type CardParts = {
  className: string;
  meta: string;
  fields: HTMLElement[];
  primary: HTMLButtonElement;
  secondary: HTMLButtonElement;
  onPrimary: () => Promise<void>;
  onSecondary: () => Promise<void>;
  extra?: HTMLElement | null;
  /** The card failed after it left the page. */
  onLostError(err: unknown): void;
  /** The card's own action removed it. */
  onGone(): void;
};

function makeCard(parts: CardParts): Card {
  const { primary, secondary } = parts;
  const card = el('article', `${parts.className} confirm-card`);
  const hint = el('p', 'ps-taskcard__hint');
  hint.setAttribute('aria-live', 'polite');
  const error = el('p', 'ps-taskcard__error');
  error.setAttribute('role', 'alert');
  const row = el('div', 'ps-taskcard__actions');
  row.append(primary, secondary);
  const body = el('div', 'ps-taskcard__fields');
  body.append(...parts.fields);
  card.append(el('p', 'ps-taskcard__meta', parts.meta), body);
  if (parts.extra) card.append(parts.extra);
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
  };

  const run = (which: HTMLButtonElement, work: () => Promise<void>) => async () => {
    if (pending || busy) return;
    pending = which;
    error.replaceChildren();
    paint();
    let failed = false;
    try {
      await work();
    } catch (err) {
      failed = true;
      if (card.parentNode) error.replaceChildren(...errorContent(err));
      else parts.onLostError(err);
    } finally {
      pending = null;
      paint();
    }
    // Removed from the section by the update its own action caused.
    if (!failed && !card.parentNode) parts.onGone();
  };
  primary.addEventListener('click', run(primary, parts.onPrimary));
  secondary.addEventListener('click', run(secondary, parts.onSecondary));

  return {
    el: card,
    refresh(next) {
      busy = next;
      paint();
    }
  };
}

export function mountTaskCards(handlers: TaskCardHandlers, options: TaskCardOptions = {}): TaskCards {
  const root = el('section', 'ps-taskcards');
  root.setAttribute('aria-label', 'Proposed tasks');
  root.hidden = true;
  const notices = el('div', 'ps-taskcards__notices');
  root.append(notices);
  const cards = new Map<string, Card>();
  /** The latest copy of each proposal, so a click sends what the server holds now. */
  const latest = new Map<string, PsProposedTask>();
  /** Card order on the last update, to find the card after one that removed itself. */
  let lastOrder: string[] = [];
  let review: (Card & { sync(proposal: NonNullable<PsSession['reviewProposal']>): void }) | null = null;

  const syncHidden = () => {
    root.hidden = cards.size === 0 && !review && notices.childElementCount === 0;
  };

  /** A failure that arrived after its card had gone: a short notice in its place. */
  function notice(err: unknown): void {
    const item = el('p', 'ps-taskcards__notice');
    item.setAttribute('role', 'alert');
    const close = button('OK', 'close-notice', 'btn--ghost');
    close.addEventListener('click', () => {
      item.remove();
      syncHidden();
      options.fallbackFocus?.()?.focus();
    });
    item.append(...errorContent(err), close);
    notices.append(item);
    syncHidden();
  }

  /** Focus the first field of the card that followed `id`, else the one before, else the fallback. */
  function focusAfter(id: string): void {
    const index = lastOrder.indexOf(id);
    const candidates = [...lastOrder.slice(index + 1), ...lastOrder.slice(0, Math.max(index, 0)).reverse()];
    const next = candidates.map((key) => (key === 'review' ? review?.el : cards.get(key)?.el)).find((node) => node?.parentNode === root);
    const target = next?.querySelector<HTMLElement>('input') ?? options.fallbackFocus?.() ?? null;
    target?.focus();
  }

  function taskCard(proposal: PsProposedTask): Card {
    const title = input('title', 'text', proposal.title);
    title.maxLength = 120;
    const due = input('due', 'date', proposal.due ?? '');
    const card = makeCard({
      className: 'ps-taskcard',
      meta: 'Make this a task?',
      fields: [field('Title', title), field('Due', due)],
      primary: button('Create task', 'create', 'btn--primary'),
      secondary: button('Not this one', 'dismiss', 'btn--ghost'),
      onPrimary: () => handlers.create(latest.get(proposal.id) ?? proposal, { title: title.value.trim() || proposal.title, due: due.value || null }),
      onSecondary: () => handlers.dismiss(latest.get(proposal.id) ?? proposal),
      onLostError: notice,
      onGone: () => focusAfter(proposal.id)
    });
    card.el.dataset.proposal = proposal.id;
    return card;
  }

  function reviewCard(first: NonNullable<PsSession['reviewProposal']>) {
    let proposal = first;
    const title = input('title', 'text', proposal.title);
    title.maxLength = 120;
    const due = input('due', 'date', proposal.due);
    due.min = today();
    const reason = el('p', 'ps-taskcard__reason', proposal.reason);
    reason.hidden = !proposal.reason;
    /** Fields the person changed keep their value when the proposal changes. */
    const edited = new Set<HTMLInputElement>();
    for (const item of [title, due]) item.addEventListener('input', () => edited.add(item));
    const card = makeCard({
      className: 'ps-reviewcard',
      meta: 'Set a date to look back?',
      fields: [field('Title', title), field('Review on', due)],
      primary: button('Create review task', 'create-review', 'btn--primary'),
      secondary: button('Not now', 'dismiss-review', 'btn--ghost'),
      onPrimary: async () => {
        const date = due.value || proposal.due;
        if (date < today()) throw new Error('Pick a review date of today or later.');
        await handlers.createReview({ title: title.value.trim() || proposal.title, due: date });
      },
      onSecondary: () => handlers.dismissReview(),
      extra: reason,
      onLostError: notice,
      onGone: () => focusAfter('review')
    });
    return {
      ...card,
      sync(next: NonNullable<PsSession['reviewProposal']>) {
        if (next.title === proposal.title && next.due === proposal.due && next.reason === proposal.reason) return;
        proposal = next;
        if (!edited.has(title)) title.value = next.title;
        if (!edited.has(due)) due.value = next.due;
        reason.textContent = next.reason;
        reason.hidden = !next.reason;
      }
    };
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
      if (showReview && !review) review = reviewCard(session.reviewProposal!);
      if (!showReview && review) {
        review.el.remove();
        review = null;
      }
      if (review) {
        review.sync(session.reviewProposal!);
        review.refresh(busy);
      }

      // The coach's order, the review card last, notices at the end. Only out-of-place nodes
      // move, so a field being typed in keeps its focus.
      const order = [...open.map((p) => cards.get(p.id)!.el), ...(review ? [review.el] : []), notices];
      let cursor = root.firstElementChild;
      for (const node of order) {
        if (node === cursor) cursor = cursor.nextElementSibling;
        else root.insertBefore(node, cursor);
      }
      lastOrder = [...open.map((p) => p.id), ...(review ? ['review'] : [])];
      syncHidden();
    }
  };
}
