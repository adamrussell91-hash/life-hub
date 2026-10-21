import { createAlchemyButton } from './block-button';
import type { AlchemyEntity } from './block-revision';
import type { ReviewStore } from './review-state';
export { createAlchemyButton } from './block-button';

/**
 * The quiet beaker on each top-level block. Pressing it opens Ann's ask box
 * under that block (drawn by the in-place cards), never a modal.
 */
export function mountBlockAssistant(options: { host: HTMLElement; store: ReviewStore; getEntity: () => AlchemyEntity }) {
  const { host, store } = options;
  host.dataset.alchemyAssistant = 'true';
  function paint() {
    // One quiet button per top-level row, never one per nested block.
    host.querySelectorAll<HTMLElement>('.lesson-page__block[data-block-id]').forEach(row => {
      if (row.querySelector(':scope > .alchemy-block-button')) return;
      const id = row.dataset.blockId!;
      if ((options.getEntity().blocks ?? []).some(b => b.id === id)) row.append(createAlchemyButton(id));
    });
  }
  const onOpen = (event: Event) => store.openAsk((event as CustomEvent<{ blockId: string }>).detail.blockId);
  host.addEventListener('alchemy-open', onOpen);
  const observer = new MutationObserver(paint);
  observer.observe(host, { childList: true, subtree: true });
  paint();
  return {
    open: (blockId: string) => store.openAsk(blockId),
    changed: paint,
    dispose() { observer.disconnect(); host.removeEventListener('alchemy-open', onOpen); delete host.dataset.alchemyAssistant; }
  };
}
