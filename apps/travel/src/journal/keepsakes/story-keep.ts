import { keepsakeLabel } from '@/journal/keepsakes/draw';
import type { Keepsake } from '@/journal/keepsakes/model';
import { button, el } from '@/journal/story/dom';

export interface StoryKeepOptions {
  keepsake: Keepsake;
  drawn: HTMLElement;
  /** "9:05 am · Largo da Graça", or the booking line. */
  meta: string;
  /** Degrees. Varies down the page so they do not all lean the same way. */
  tilt?: number;
  onOpen: (keepsake: Keepsake, from: HTMLElement) => void;
}

/** A keepsake where it was picked up: taped to the page, with what it is beside it. */
export function renderStoryKeep(options: StoryKeepOptions): HTMLElement {
  const { keepsake } = options;
  const row = el('div', `story-keep story-keep--${keepsake.type}`);
  row.id = `keep_${keepsake.id}`;
  row.setAttribute('data-keepsake-id', keepsake.id);

  const object = button(`story-keep__object story-keep__object--${keepsake.type}`);
  object.setAttribute('aria-label', `Open keepsake: ${keepsakeLabel(keepsake)}`);
  if (options.tilt !== undefined) object.style.setProperty('--keep-tilt', `${options.tilt}deg`);
  object.append(options.drawn);
  object.addEventListener('click', () => options.onOpen(keepsake, object));

  const text = el('p', 'story-keep__text num');
  text.append(el('b', undefined, keepsake.type === 'booking' ? keepsakeLabel(keepsake) : `Kept: ${keepsakeLabel(keepsake)}`));
  if (options.meta) text.append(options.meta);
  row.append(object, text);
  return row;
}
