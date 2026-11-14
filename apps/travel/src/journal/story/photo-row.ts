import type { JournalMedia } from '@/journal/types';
import { configureJournalImage } from '@/journal/media-loading';
import { button, el } from '@/journal/story/dom';

/** A single photo keeps its own shape, but never taller than 4:5 or wider than 3:2. */
export const MIN_RATIO = 4 / 5;
export const MAX_RATIO = 3 / 2;

export function clampedRatio(media: Pick<JournalMedia, 'width' | 'height'>): number {
  if (!media.width || !media.height || media.width <= 0 || media.height <= 0) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, media.width / media.height));
}

export interface PhotoRowOptions {
  tripId: string;
  photos: JournalMedia[];
  /** Position of each photo in the trip-wide list the viewer swipes through. */
  indexOf: (mediaId: string) => number;
  /** Load the first photo straight away (first moment on screen). */
  eager: boolean;
  /** Spoken name for the photos, usually the place. */
  label: string;
}

function photoButton(options: PhotoRowOptions, media: JournalMedia, position: number, ratio: number): HTMLButtonElement {
  const btn = button('story-photo');
  btn.setAttribute('data-photo-index', String(options.indexOf(media.id)));
  btn.setAttribute('data-media-id', media.id);
  const of = options.photos.length > 1 ? `, ${position + 1} of ${options.photos.length}` : '';
  btn.setAttribute('aria-label', `Open photo${options.label ? `: ${options.label}` : ''}${of}`);
  btn.style.aspectRatio = String(Math.round(ratio * 1000) / 1000);
  const img = el('img');
  configureJournalImage(img, {
    tripId: options.tripId,
    media,
    layout: 'single',
    eager: options.eager && position === 0,
  });
  btn.append(img);
  return btn;
}

/** One photo full width, or several in a row that swipes sideways with a count. */
export function renderPhotoRow(options: PhotoRowOptions): HTMLElement | null {
  const { photos } = options;
  if (photos.length === 0) return null;
  if (photos.length === 1) {
    const wrap = el('div', 'story-photos story-photos--one');
    wrap.append(photoButton(options, photos[0]!, 0, clampedRatio(photos[0]!)));
    return wrap;
  }

  // One shared shape per row, so the row does not jump height as it scrolls.
  const ratio = clampedRatio(photos[0]!);
  const wrap = el('div', 'story-photos story-photos--row');
  const track = el('div', 'story-photos__track');
  photos.forEach((media, i) => track.append(photoButton(options, media, i, ratio)));
  const count = el('span', 'story-photos__count num', `1 / ${photos.length}`);
  count.setAttribute('aria-hidden', 'true');
  track.addEventListener(
    'scroll',
    () => {
      const first = track.firstElementChild as HTMLElement | null;
      const step = first ? first.offsetWidth + 6 : 0;
      if (step <= 0) return;
      const at = Math.min(photos.length, Math.round(track.scrollLeft / step) + 1);
      count.textContent = `${at} / ${photos.length}`;
    },
    { passive: true },
  );
  wrap.append(track, count);
  return wrap;
}
