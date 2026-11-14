import { el } from '@/journal/story/dom';

export interface ChapterOpenerOptions {
  /** 1 for the first city. */
  number: number;
  name: string;
  /** "3 – 5 March", or empty when the leg has no dates. */
  dateRange: string;
  /** "2 days · 6 moments". */
  counts: string;
  /** Bundled pattern for this city, when there is one and patterns are on. */
  patternHref?: string | null;
  /** The city's soft accent colour, used when there is no pattern. */
  accentSoft?: string;
}

/** The start of a city: a band of its pattern or colour, then its name. */
export function renderChapterOpener(options: ChapterOpenerOptions): HTMLElement {
  const opener = el('header', 'story-chapter');

  const art = el('div', 'story-chapter__art');
  art.setAttribute('aria-hidden', 'true');
  if (options.patternHref) {
    art.classList.add('story-chapter__art--pattern');
    art.style.setProperty('--story-pattern-url', `url("${options.patternHref}")`);
  } else if (options.accentSoft) {
    art.style.setProperty('--story-chapter-accent', options.accentSoft);
  }

  const eyebrow = [`Chapter ${options.number}`, options.dateRange].filter(Boolean).join(' · ');
  const title = el('h2', 'story-chapter__title', options.name);
  opener.append(art, el('p', 'story-eyebrow story-chapter__eyebrow num', eyebrow), title);
  if (options.counts) opener.append(el('p', 'story-chapter__counts num', options.counts));
  return opener;
}
