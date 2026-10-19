import { BlockSchema, type Block } from '@/schemas/block';
import { knowledgeHubPageUrl } from '@/alchemy/connections';
import { knowledgeHubOrigin } from '@/alchemy/client';
import { findAlchemyBlock, type AlchemyEntity } from './block-revision';
import { applyPatchToEntity, PatchError, editableFields } from '../../../../packages/alchemy/patches.js';
import { offerTimedUndo } from '../../design-kit/js/hub-feedback.js';
import { patchText, recordDecision, type AgentJob, type AgentProposal } from './agent-client';

export type ProposalCardsOptions = {
  getEntity: () => AlchemyEntity;
  /** Puts a changed lesson or unit on the page and saves it. */
  apply: (next: AlchemyEntity) => Promise<void>;
  onError: (message: string) => void;
};

const validateBlock = (block: unknown) => { const parsed = BlockSchema.safeParse(block); return parsed.success ? parsed.data : null; };
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** The field's text on the live page; null when the block or field is gone. */
function liveField(entity: AlchemyEntity, p: AgentProposal): string | null {
  const block = findAlchemyBlock((entity.blocks ?? []) as Block[], p.blockId);
  return block ? new Map(editableFields(block)).get(p.path) ?? null : null;
}

/**
 * Ann's suggestions as cards to accept or dismiss. Each accept applies one
 * exact patch to the live page, then re-reads the page to check it landed.
 * A patch whose words are no longer on the page is marked stale, not forced.
 */
export function createProposalCards(options: ProposalCardsOptions) {
  const list = el('div', 'alchemy-agent__results');
  const local = new Map<string, 'accepted' | 'dismissed' | 'stale'>();
  let job: AgentJob | null = null;
  let applying = false;

  const decision = (p: AgentProposal) => local.get(p.id) ?? job?.decisions?.[p.id];

  function paint() {
    list.replaceChildren();
    const proposals = job?.status === 'done' ? job.result?.proposals ?? [] : [];
    const pending = proposals.filter(p => !decision(p));
    if (pending.length > 1) {
      const all = el('button', 'btn btn--ghost alchemy-agent__accept-all', `Accept all ${pending.length}`);
      all.type = 'button'; all.disabled = applying;
      all.addEventListener('click', () => void acceptAll());
      list.append(all);
    }
    for (const p of proposals) list.append(card(p));
  }

  function card(p: AgentProposal): HTMLElement {
    const state = decision(p);
    const article = el('article', 'alchemy-agent-card' + (state ? ` alchemy-agent-card--${state}` : ''));
    article.dataset.proposal = p.id;
    article.append(el('p', 'alchemy-agent-card__block', p.blockLabel));
    const diff = el('div', 'alchemy-agent-card__diff');
    diff.append(el('del', '', patchText(p.oldStr)), el('ins', '', patchText(p.newStr)));
    article.append(diff, el('p', 'alchemy-agent-card__why', p.why));
    if (p.source) {
      const link = el('a', 'alchemy-agent-card__source', p.source.title);
      link.href = knowledgeHubPageUrl(knowledgeHubOrigin(), p.source.noteId);
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      article.append(el('blockquote', 'alchemy-agent-card__quote', p.source.quote), link);
    } else article.append(el('p', 'alchemy-agent-card__own', 'Ann’s own idea: not from your notes'));
    const actions = el('div', 'alchemy-agent-card__actions');
    if (!state) {
      const accept = el('button', 'btn btn--primary', 'Accept'); accept.type = 'button'; accept.disabled = applying;
      const dismiss = el('button', 'btn btn--ghost', 'Dismiss'); dismiss.type = 'button'; dismiss.disabled = applying;
      accept.addEventListener('click', () => void acceptOne(p));
      dismiss.addEventListener('click', () => { local.set(p.id, 'dismissed'); if (job) void recordDecision(job.job, p.id, 'dismissed').catch(() => {}); paint(); });
      actions.append(accept, dismiss);
    } else actions.append(el('p', 'alchemy-agent-card__state', state === 'accepted' ? 'Applied' : state === 'dismissed' ? 'Dismissed' : 'The page has changed here, so this no longer fits. Ask Ann again.'));
    article.append(actions);
    return article;
  }

  /** Applies one suggestion; false when it no longer fits the live page. */
  async function applyOne(p: AgentProposal): Promise<boolean> {
    let next: AlchemyEntity;
    try { next = applyPatchToEntity(options.getEntity() as never, { blockId: p.blockId, path: p.path, oldStr: p.oldStr, newStr: p.newStr }, validateBlock as never); }
    catch (e) { if (e instanceof PatchError) { local.set(p.id, 'stale'); return false; } throw e; }
    await options.apply(next);
    if (!liveField(options.getEntity(), p)?.includes(p.newStr)) throw new Error('The change did not land on the page. Check it and try again.');
    local.set(p.id, 'accepted');
    if (job) void recordDecision(job.job, p.id, 'accepted').catch(() => {});
    return true;
  }

  function offerUndo(applied: AgentProposal[]) {
    offerTimedUndo({
      message: applied.length === 1 ? 'Ann’s suggestion applied.' : `${applied.length} suggestions applied.`,
      onUndo: () => {
        void (async () => {
          let entity = options.getEntity();
          for (const p of [...applied].reverse()) {
            try { entity = applyPatchToEntity(entity as never, { blockId: p.blockId, path: p.path, oldStr: p.newStr, newStr: p.oldStr }, validateBlock as never); }
            catch { /* Newer teacher edits take precedence. */ }
          }
          await options.apply(entity);
          for (const p of applied) local.delete(p.id);
          paint();
        })().catch(() => options.onError('Undo could not be saved. Check the page.'));
      }
    });
  }

  async function run(proposals: AgentProposal[]) {
    if (applying) return;
    applying = true; options.onError(''); paint();
    const applied: AgentProposal[] = [];
    try { for (const p of proposals) if (await applyOne(p)) applied.push(p); }
    catch (e) { options.onError(e instanceof Error ? e.message : 'A change could not be saved.'); }
    finally { applying = false; paint(); if (applied.length) offerUndo(applied); }
  }
  const acceptOne = (p: AgentProposal) => run([p]);
  const acceptAll = () => run((job?.result?.proposals ?? []).filter(p => !decision(p)));

  return {
    element: list,
    show(next: AgentJob | null) { if (next?.job !== job?.job) local.clear(); job = next; paint(); }
  };
}
