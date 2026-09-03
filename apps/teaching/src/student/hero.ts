import type { Cover } from '@/schemas';
import { coverAltText, resolveCoverUrl } from '@/schemas';

export interface StudentHeroOptions {
  title: string;
  eyebrow?: string;
  lead?: string;
  entityId: string;
  cover?: Cover;
  extraClass?: string;
  titleClass?: string;
  eyebrowClass?: string;
  leadClass?: string;
  meta?: HTMLElement;
  media?: 'always' | 'cover' | 'never';
}

function hueFromEntityId(id: string): number {
  return [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
}

export function renderStudentHero(options: StudentHeroOptions): HTMLElement {
  const hero = document.createElement('header');
  hero.className = ['student-hero', options.extraClass].filter(Boolean).join(' ');

  const url = resolveCoverUrl(options.cover);
  const mediaMode = options.media ?? 'always';
  const showMedia =
    mediaMode === 'always' || (mediaMode === 'cover' && Boolean(url));
  if (showMedia) {
    const media = document.createElement('div');
    media.className = 'student-hero__media';
    if (url) {
      const img = document.createElement('img');
      img.className = 'student-hero__image';
      img.src = url;
      img.alt = coverAltText(options.cover, options.title);
      media.append(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'student-hero__fallback';
      const hue = hueFromEntityId(options.entityId);
      fallback.setAttribute(
        'style',
        `background:linear-gradient(135deg, hsl(${hue} 38% 32%) 0%, hsl(${(hue + 42) % 360} 42% 18%) 100%)`
      );
      media.append(fallback);
    }
    hero.append(media);
  }

  const copy = document.createElement('div');
  copy.className = 'student-hero__copy';

  if (options.eyebrow) {
    const eyebrow = document.createElement('p');
    eyebrow.className = ['student-hero__eyebrow', options.eyebrowClass]
      .filter(Boolean)
      .join(' ');
    eyebrow.textContent = options.eyebrow;
    copy.append(eyebrow);
  }

  const title = document.createElement('h1');
  title.className = ['student-hero__title', options.titleClass].filter(Boolean).join(' ');
  title.textContent = options.title;
  copy.append(title);

  if (options.lead) {
    const lead = document.createElement('p');
    lead.className = ['student-hero__lead', options.leadClass].filter(Boolean).join(' ');
    lead.textContent = options.lead;
    copy.append(lead);
  }

  if (options.meta) copy.append(options.meta);
  hero.append(copy);
  return hero;
}
