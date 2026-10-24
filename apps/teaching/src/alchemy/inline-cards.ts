import type { Block } from '@/schemas/block';
import { knowledgeHubPageUrl } from '@/alchemy/connections';
import { knowledgeHubOrigin } from '@/alchemy/client';
import { offerTimedUndo } from '../../design-kit/js/hub-feedback.js';
import { childBlocks } from '../../../../packages/alchemy/patches.js';
import { findAlchemyBlock, type AlchemyEntity } from './block-revision';
import { el } from './dom';
import { changeInContext } from './change-context';
import { liveField, withProposal, withoutProposal, PatchError } from './apply-proposal';
import { followAgentJob, recordDecision, startAgentReview } from './agent-client';
import { researchTrail, lostTouch } from './ann-bar';
import type { Entry, ReviewStore } from './review-state';
import { ROW_REVEAL_EVENT } from '@/blocks/quiz-deck';

export type InlineCardsOptions = {
  host: HTMLElement;
  store: ReviewStore;
  kind: 'lesson' | 'unit';
  id: string;
  getEntity: () => AlchemyEntity;
  flush: () => Promise<void>;
  apply: (next: AlchemyEntity) => Promise<void>;
  start?: typeof startAgentReview;
  follow?: typeof followAgentJob;
  /** How long "Applied · Undo" stays on a card. */
  undoMs?: number;
};

const ROW = '.lesson-page__block[data-block-id]';
const STOP = ['click', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'keydown', 'keyup', 'input', 'dragstart'];

/**
 * Ann's suggestions where they apply: a card at the bottom of each block
 * row she wants to change, and the ask box for one block. The lesson page
 * rebuilds its rows on every change, so cards are re-attached after each
 * redraw from the review store; nothing here lives only in the DOM.
 */
export function mountInlineCards(options: InlineCardsOptions) {
  const { host, store } = options;
  const start = options.start ?? startAgentReview;
  const follow = options.follow ?? followAgentJob;
  const undoMs = options.undoMs ?? 8000;
  const lifecycle = new AbortController();
  let working = false, frame = 0, lastFocus: string | null = null, disposed = false;

  const rowBlock = (id: string) => (options.getEntity().blocks ?? []).find(b => b.id === id) as Block | undefined;
  /** The top-level row a suggestion shows under: its own block or the row that contains it. */
  function rowFor(entry: Entry): string | null {
    for (const b of options.getEntity().blocks ?? []) {
      if (b.id === entry.proposal.blockId || findAlchemyBlock(childBlocks(b as Block) as Block[], entry.proposal.blockId)) return b.id;
    }
    return null;
  }

  async function accept(entry: Entry): Promise<boolean> {
    let next: AlchemyEntity;
    try { next = withProposal(options.getEntity(), entry.proposal); }
    catch (e) { if (e instanceof PatchError) { store.decide(entry.key, 'stale'); return false; } throw e; }
    await options.apply(next);
    if (!liveField(options.getEntity(), entry.proposal)?.includes(entry.proposal.newStr)) throw new Error('The change did not land on the page. Check it and try again.');
    store.decide(entry.key, 'accepted');
    void recordDecision(entry.job, entry.proposal.id, 'accepted').catch(() => {});
    window.setTimeout(() => { if (!disposed) store.settle(entry.key); }, undoMs);
    return true;
  }

  async function run(list: Entry[]) {
    if (working) return;
    working = true; store.setError('');
    const applied: Entry[] = [];
    try { for (const entry of list) if (await accept(entry)) applied.push(entry); }
    catch (e) { store.setError(e instanceof Error ? e.message : 'A change could not be saved.'); }
    finally {
      working = false; schedule();
      if (applied.length) offerTimedUndo({ message: applied.length === 1 ? 'Ann’s suggestion applied.' : `${applied.length} suggestions applied.`, durationMs: undoMs, onUndo: () => void undo(applied) });
    }
  }

  async function undo(entries: Entry[]) {
    let entity = options.getEntity();
    for (const e of [...entries].reverse()) entity = withoutProposal(entity, e.proposal);
    try { await options.apply(entity); for (const e of entries) store.decide(e.key, null); }
    catch { store.setError('Undo could not be saved. Check the page.'); }
  }

  function dismiss(entry: Entry) {
    store.decide(entry.key, 'dismissed');
    void recordDecision(entry.job, entry.proposal.id, 'dismissed').catch(() => {});
  }

  async function ask() {
    const current = store.state.ask;
    if (!current || current.job?.status === 'working') return;
    store.setAskJob(null);
    try {
      await options.flush();
      const first = await start({ kind: options.kind, id: options.id, blockId: current.blockId, request: current.text.trim() || undefined });
      await follow(first, job => store.setAskJob(job, job.status === 'error' ? job.error?.message || 'Ann could not finish.' : ''), lifecycle.signal);
    } catch (e) {
      if (!lifecycle.signal.aborted) store.setAskJob(null, e instanceof Error && e.message && e.name !== 'AbortError' ? e.message : lostTouch(e));
    }
  }

  function button(label: string, cls: string, onClick: () => void, primary = false) {
    const b = el('button', 'btn ' + (primary ? 'btn--primary ' : 'btn--ghost ') + cls, label);
    b.type = 'button';
    b.disabled = working;
    b.addEventListener('click', onClick);
    return b;
  }

  function card(entry: Entry, rowId: string): HTMLElement {
    const p = entry.proposal;
    const decision = store.decision(entry);
    const field = liveField(options.getEntity(), p);
    const context = decision === 'accepted' ? null : field === null ? null : changeInContext(field, p.oldStr, p.newStr);
    const stale = decision === 'stale' || (!decision && !context);
    const article = el('article', 'ann-card' + (decision === 'accepted' ? ' ann-card--applied' : stale ? ' ann-card--stale' : ''));
    article.dataset.annKey = entry.key;
    article.tabIndex = -1;
    if (decision === 'accepted') {
      article.append(el('span', 'ann-card__state', 'Applied'), button('Undo', 'ann-card__undo', () => void undo([entry])));
      return article;
    }
    const head = el('p', 'ann-card__label', p.blockId === rowId ? 'Ann suggests' : `Ann suggests, in ${p.blockLabel}`);
    article.append(head);
    if (stale) {
      article.append(el('p', 'ann-card__why', 'The words this changes are no longer on the page, so it no longer fits.'), actions(button('Dismiss', '', () => dismiss(entry))));
      return article;
    }
    const change = el('p', 'ann-card__change');
    change.append((context!.trimmedStart ? '…' : '') + context!.before);
    if (context!.removed.trim()) change.append(el('del', '', context!.removed));
    if (context!.added.trim()) change.append(el('ins', '', context!.added));
    change.append(context!.after + (context!.trimmedEnd ? '…' : ''));
    article.append(change, el('p', 'ann-card__why', p.why));
    if (p.source) {
      const link = el('a', 'ann-card__source', p.source.title);
      link.href = knowledgeHubPageUrl(knowledgeHubOrigin(), p.source.noteId);
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      const quote = el('blockquote', 'ann-card__quote', p.source.quote);
      article.append(quote, link);
    } else article.append(el('p', 'ann-card__own', 'Ann’s own idea, not from your notes'));
    article.append(actions(button('Accept', 'ann-card__accept', () => void run([entry]), true), button('Dismiss', 'ann-card__dismiss', () => dismiss(entry))));
    return article;
  }

  const actions = (...buttons: HTMLElement[]) => { const row = el('div', 'ann-card__actions'); row.append(...buttons); return row; };

  function askBox(): HTMLElement {
    const current = store.state.ask!;
    const box = el('form', 'ann-ask');
    box.addEventListener('submit', e => { e.preventDefault(); void ask(); });
    const running = current.job?.status === 'working';
    if (running) {
      const { searches, notes } = researchTrail(current.job);
      box.append(el('p', 'ann-ask__live', current.job!.progress.at(-1)?.text ?? 'Starting'), el('p', 'ann-ask__muted', `${searches} ${searches === 1 ? 'search' : 'searches'} · ${notes} ${notes === 1 ? 'note' : 'notes'} read`));
      return box;
    }
    const input = el('input', 'ann-ask__input');
    input.type = 'text'; input.maxLength = 2000; input.value = current.text;
    input.placeholder = 'What should Ann do with this block?';
    input.setAttribute('aria-label', 'What should Ann do with this block?');
    input.addEventListener('input', () => store.setAskText(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') store.closeAsk(); });
    const send = el('button', 'btn btn--primary', 'Ask Ann'); send.type = 'submit';
    box.append(input, send, button('Cancel', '', () => store.closeAsk()));
    if (current.error) box.append(el('p', 'ann-ask__error', current.error));
    return box;
  }

  function signature(rowId: string, entries: Entry[]): string {
    const ask = store.state.ask?.blockId === rowId ? store.state.ask : null;
    return JSON.stringify([
      entries.map(e => [e.key, store.decision(e) ?? '', liveField(options.getEntity(), e.proposal)]),
      ask ? [ask.job?.status ?? '', ask.job?.progress.length ?? 0, ask.error] : null,
      working
    ]);
  }

  function sync() {
    frame = 0;
    if (disposed) return;
    const byRow = new Map<string, Entry[]>();
    for (const entry of store.visible()) {
      const row = rowFor(entry);
      if (row) byRow.set(row, [...(byRow.get(row) ?? []), entry]);
    }
    host.querySelectorAll<HTMLElement>(ROW).forEach(row => {
      const id = row.dataset.blockId!;
      if (!rowBlock(id)) return;
      const entries = byRow.get(id) ?? [];
      const asking = store.state.ask?.blockId === id;
      let box = ([...row.children] as HTMLElement[]).find(c => c.classList.contains('ann-inline'));
      const pending = entries.filter(e => !store.decision(e)).length;
      row.classList.toggle('ann-target', pending > 0);
      if (pending > 1) row.dataset.annCount = String(pending); else delete row.dataset.annCount;
      if (!entries.length && !asking) { box?.remove(); return; }
      const sig = signature(id, entries);
      if (box?.dataset.sig === sig) return;
      const hadFocus = box?.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement;
      if (!box) {
        box = el('div', 'ann-inline');
        for (const type of STOP) box.addEventListener(type, e => e.stopPropagation());
        row.append(box);
      }
      box.dataset.sig = sig;
      box.replaceChildren(...entries.map(e => card(e, id)), ...(asking ? [askBox()] : []));
      if (hadFocus || (asking && !store.state.ask?.job)) box.querySelector<HTMLInputElement>('.ann-ask__input')?.focus();
    });
    const focus = store.state.focus;
    if (focus && focus !== lastFocus) {
      const find = () => host.querySelector<HTMLElement>(`[data-ann-key="${CSS.escape(focus)}"]`);
      // A quiz deck shows one card at a time, so it turns to this one first (and may redraw).
      find()?.dispatchEvent(new CustomEvent(ROW_REVEAL_EVENT, { bubbles: true }));
      const target = find();
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.focus({ preventScroll: true });
        const row = target.closest<HTMLElement>(ROW);
        row?.classList.remove('ann-pulse'); void row?.offsetWidth; row?.classList.add('ann-pulse');
      }
    }
    lastFocus = focus;
  }

  function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(sync); }

  const observer = new MutationObserver(records => {
    // Our own card writes do not need another pass.
    if (records.every(r => r.target instanceof Element && r.target.closest('.ann-inline'))) return;
    schedule();
  });
  observer.observe(host, { childList: true, subtree: true });
  const unsubscribe = store.subscribe(schedule);
  schedule();

  return {
    acceptAll: () => run(store.pending()),
    sync,
    dispose() {
      disposed = true; lifecycle.abort(); observer.disconnect(); unsubscribe(); cancelAnimationFrame(frame);
      host.querySelectorAll('.ann-inline').forEach(n => n.remove());
      host.querySelectorAll(ROW).forEach(r => { r.classList.remove('ann-target', 'ann-pulse'); delete (r as HTMLElement).dataset.annCount; });
    }
  };
}
