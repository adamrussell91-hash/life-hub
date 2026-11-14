import type { JournalMedia } from '@/journal/types';
import { configureJournalImage } from '@/journal/media-loading';
import { ICONS, button, el, icon } from '@/journal/story/dom';

export interface CoverOptions {
  title: string;
  dates: string;
  eyebrow: string;
  /** Short facts shown on one line, e.g. "4 days", "2 cities". */
  stats: string[];
  photo?: { tripId: string; media: JournalMedia };
  /** City accent colour for a journal with no photos yet. */
  accent?: string;
  backHref: string;
  onSearch: () => void;
  onOptions: () => void;
}

/** The top of the journal: a photo with the trip's name over it. */
export function renderCover(options: CoverOptions): HTMLElement {
  const cover = el('header', 'story-cover');
  cover.setAttribute('data-story-cover', '');

  if (options.photo) {
    const img = el('img', 'story-cover__photo');
    configureJournalImage(img, { ...options.photo, layout: 'single', eager: true });
    cover.append(img);
  } else {
    cover.classList.add('story-cover--plain');
    if (options.accent) cover.style.setProperty('--story-cover-accent', options.accent);
  }

  const top = el('div', 'story-cover__top');
  const back = el('a', 'story-chip');
  back.href = options.backHref;
  back.append(icon(ICONS.back), document.createTextNode('Trip'));
  const tools = el('div', 'story-cover__tools');
  const search = button('story-chip story-chip--icon');
  search.setAttribute('aria-label', 'Search journal');
  search.append(icon(ICONS.search));
  search.addEventListener('click', options.onSearch);
  const more = button('story-chip story-chip--icon');
  more.setAttribute('aria-label', 'Journal options');
  more.setAttribute('data-story-options', '');
  more.append(icon(ICONS.more));
  more.addEventListener('click', options.onOptions);
  tools.append(search, more);
  top.append(back, tools);

  const body = el('div', 'story-cover__body');
  body.append(el('p', 'story-eyebrow', options.eyebrow));
  body.append(el('h1', 'story-cover__title', options.title));
  if (options.dates) body.append(el('p', 'story-cover__dates num', options.dates));
  const stats = options.stats.filter(Boolean);
  if (stats.length) body.append(el('p', 'story-cover__stats num', stats.join(' · ')));

  cover.append(top, body);
  return cover;
}
