import { configureJournalImage } from '@/journal/media-loading';
import type { TripPhoto } from '@/journal/photo-viewer';
import { button, el } from '@/journal/story/dom';

export interface PhotosViewOptions {
  tripId: string;
  photos: TripPhoto[];
  /** Heading for the group a photo belongs to, e.g. "Day 1 · Lisbon". Photos with the same heading sit together. */
  groupOf: (photo: TripPhoto) => { label: string; detail: string };
}

/** Every photo of the trip in a grid, grouped by day. Each is a button carrying its place in the trip-wide list. */
export function renderPhotosView(options: PhotosViewOptions): HTMLElement {
  const root = el('div', 'story-grid');
  root.setAttribute('data-story-photos-view', '');
  if (options.photos.length === 0) {
    root.append(el('p', 'story-empty', 'No photos yet. Add some with the round button.'));
    return root;
  }

  let lastLabel: string | null = null;
  let cells: HTMLElement | null = null;
  options.photos.forEach((photo, index) => {
    const group = options.groupOf(photo);
    if (group.label !== lastLabel || !cells) {
      lastLabel = group.label;
      const heading = el('h3', 'story-grid__label');
      heading.append(document.createTextNode(group.label));
      if (group.detail) heading.append(el('span', 'num', group.detail));
      cells = el('div', 'story-grid__cells');
      root.append(heading, cells);
    }
    const btn = button('story-photo story-grid__cell');
    btn.setAttribute('data-photo-index', String(index));
    btn.setAttribute('aria-label', `Open photo${photo.moment.place?.name ? `: ${photo.moment.place.name}` : ''}`);
    const img = el('img');
    configureJournalImage(img, { tripId: options.tripId, media: photo.media, layout: 'pair', eager: false });
    btn.append(img);
    cells.append(btn);
  });
  return root;
}
