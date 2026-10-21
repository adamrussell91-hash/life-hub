import type { AlchemyEntity } from './block-revision';
import { createReviewStore } from './review-state';
import { mountAnnBar } from './ann-bar';
import { mountInlineCards } from './inline-cards';
import { mountBlockAssistant } from './block-assistant';

export type AnnReviewOptions = {
  /** The element holding the page's block rows. */
  host: HTMLElement;
  /** Where Ann's bar goes; leave out for a page with block asks only. */
  barHost?: HTMLElement;
  kind: 'lesson' | 'unit';
  id: string;
  getEntity: () => AlchemyEntity;
  /** Saves the editor first, so Ann reads what the teacher sees. */
  flush: () => Promise<void>;
  /** Puts a changed page on screen and saves it. */
  apply: (next: AlchemyEntity) => Promise<void>;
};

/** Ann inside a lesson or unit page: her bar, her cards under the blocks they change, and the block ask. */
export function mountAnnReview(options: AnnReviewOptions) {
  const store = createReviewStore();
  const cards = mountInlineCards({ ...options, store });
  const bar = options.barHost ? mountAnnBar(options.barHost, { store, kind: options.kind, id: options.id, flush: options.flush, acceptAll: cards.acceptAll }) : null;
  const beaker = mountBlockAssistant({ host: options.host, store, getEntity: options.getEntity });
  return {
    store,
    focusBar: () => bar?.focus(),
    changed: () => { beaker.changed(); cards.sync(); },
    dispose() { beaker.dispose(); bar?.dispose(); cards.dispose(); }
  };
}
