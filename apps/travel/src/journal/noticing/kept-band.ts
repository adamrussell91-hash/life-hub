import { renderNoticeFace, type FillNoticePhoto } from '@/journal/noticing/cards';
import type { NoticeCard } from '@/journal/noticing/model';
import { button, el } from '@/journal/story/dom';

export interface KeptBandOptions {
  card: NoticeCard;
  fillPhoto: FillNoticePhoto;
  /** Omitted where the journal cannot be saved to. */
  onRemove?: (card: NoticeCard) => void;
}

/** A noticing kept in the story, beside the day or moment it is about. */
export function renderKeptBand(options: KeptBandOptions): HTMLElement {
  const band = el('aside', `story-noticed story-noticed--${options.card.source}`);
  band.setAttribute('data-noticed', options.card.key);
  band.setAttribute('aria-label', 'Noticed');
  band.append(renderNoticeFace(options.card, options.fillPhoto, 'h3'));
  if (options.onRemove) {
    const remove = button('story-noticed__remove', 'Remove');
    remove.setAttribute('aria-label', `Remove from the story: ${options.card.headline}`);
    remove.addEventListener('click', () => options.onRemove?.(options.card));
    band.append(remove);
  }
  return band;
}
