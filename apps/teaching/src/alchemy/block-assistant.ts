import { createAlchemyButton } from './block-button';
import { agentBySlug } from '@/ai/agents';
import type { AlchemyEntity } from './block-revision';
import { createProposalCards, el } from './agent-cards';
import { paintAgentStatus, lostTouchMessage } from './agent-panel';
import { followAgentJob, startAgentReview, type AgentJob } from './agent-client';
export { createAlchemyButton } from './block-button';

type Options = {
  host: HTMLElement;
  kind: 'lesson' | 'unit';
  id: string;
  getEntity: () => AlchemyEntity;
  flush: () => Promise<void>;
  apply: (next: AlchemyEntity) => Promise<void>;
  /** Starts a review; tests replace it. */
  start?: typeof startAgentReview;
  follow?: typeof followAgentJob;
};

/**
 * The quiet beaker on each top-level block: it opens Ann for that block.
 * Ann runs the same review as the whole-lesson one, scoped to the block,
 * and only when the teacher asks.
 */
export function mountBlockAssistant(options: Options) {
  const { host } = options;
  host.dataset.alchemyAssistant = 'true';
  const start = options.start ?? startAgentReview;
  const follow = options.follow ?? followAgentJob;
  const lifecycle = new AbortController();
  let dialog: HTMLDialogElement | null = null;
  let disposed = false;

  function paint() {
    // One quiet button per top-level row, never one per nested block.
    host.querySelectorAll<HTMLElement>('.lesson-page__block[data-block-id]').forEach(row => {
      if (row.querySelector(':scope > .alchemy-block-button')) return;
      const id = row.dataset.blockId!;
      if ((options.getEntity().blocks ?? []).some(b => b.id === id)) row.append(createAlchemyButton(id));
    });
  }

  function close() { dialog?.remove(); dialog = null; }

  function open(blockId: string) {
    if (disposed) return;
    close();
    const ann = agentBySlug('ann')!;
    const review = document.createElement('dialog');
    dialog = review;
    review.className = 'alchemy-review';
    review.setAttribute('aria-label', 'Alchemy Lab with ' + ann.name);
    const heading = el('h2', '', 'Alchemy Lab · ' + ann.name);
    const body = el('div', 'alchemy-review__body');
    const status = el('div', 'alchemy-agent__status');
    status.setAttribute('aria-live', 'polite');
    const error = el('p', 'alchemy-review__error');
    error.setAttribute('role', 'alert');
    const showError = (message: string) => { error.textContent = message; };
    const cards = createProposalCards({ getEntity: options.getEntity, apply: options.apply, onError: showError });
    const hint = el('p', 'alchemy-agent__muted', 'Ann will read this block in its lesson, search your notes and suggest changes. Say what you want, or just ask.');
    body.append(hint, status, cards.element);
    const form = el('form', 'alchemy-review__composer');
    const input = el('textarea');
    input.placeholder = 'Make the questions harder, add a model answer, check the facts…';
    input.setAttribute('aria-label', 'What should Ann do with this block?');
    input.maxLength = 2000;
    const send = el('button', 'btn btn--primary', 'Ask Ann');
    send.type = 'submit';
    form.append(input, send);
    const actions = el('div', 'alchemy-review__actions');
    const hide = el('button', 'btn btn--ghost', 'Close');
    hide.type = 'button';
    actions.append(hide);
    review.append(heading, body, error, form, actions);
    document.body.append(review);
    if (review.showModal) review.showModal(); else review.setAttribute('open', '');
    input.focus();

    let working = false;
    const run = new AbortController();
    const show = (job: AgentJob) => { paintAgentStatus(status, job); cards.show(job); };
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (working) return;
      working = true; send.disabled = true; showError(''); hint.hidden = true;
      void (async () => {
        try {
          await options.flush();
          if (disposed || dialog !== review) return;
          const first = await start({ kind: options.kind, id: options.id, blockId, request: input.value.trim() || undefined });
          await follow(first, job => { if (dialog === review) show(job); }, AbortSignal.any([lifecycle.signal, run.signal]));
        } catch (e) {
          if (!run.signal.aborted && !lifecycle.signal.aborted) showError(e instanceof Error && e.message && e.name !== 'AbortError' ? e.message : lostTouchMessage(e));
        } finally { working = false; send.disabled = false; }
      })();
    });
    const shut = () => { run.abort(); close(); };
    hide.addEventListener('click', shut);
    review.addEventListener('cancel', shut);
  }

  function onOpen(event: Event) { open((event as CustomEvent<{ blockId: string }>).detail.blockId); }
  host.addEventListener('alchemy-open', onOpen);
  const observer = new MutationObserver(paint);
  observer.observe(host, { childList: true, subtree: true });
  paint();
  return {
    open,
    changed() { paint(); },
    dispose() {
      disposed = true; lifecycle.abort(); observer.disconnect(); close();
      host.removeEventListener('alchemy-open', onOpen);
      delete host.dataset.alchemyAssistant;
    }
  };
}
