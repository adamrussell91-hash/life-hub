/**
 * The two drawn marks on the back of a postcard: a perforated stamp showing the leg's
 * city scene, and a round ink postmark in the leg's colour. They are pictures: the same
 * facts are always written out as ordinary text wherever a card is shown at full size.
 */
import { renderScene } from '@/scenes';
import { escapeHtml } from '@/lib/html';
import type { PostcardFacts } from '@/postcard/model';

let nextPostmarkId = 1;

/** The scene the city header uses, cropped to its centre by the stamp's own box. */
export function stampHtml(facts: PostcardFacts): string {
  const country = facts.country
    ? `<span class="postcard-stamp__country">${escapeHtml(facts.country)}</span>`
    : '';
  return (
    `<span class="postcard-stamp" aria-hidden="true"><span class="postcard-stamp__in">` +
    `<span class="postcard-stamp__art">${renderScene(facts.scene, facts.accent, facts.cityName)}</span>` +
    `<span class="postcard-stamp__day">Day ${facts.dayNumber}</span>${country}` +
    `</span></span>`
  );
}

/** City around the top of the ring, country around the bottom, date and time in the middle. */
export function postmarkSvg(facts: PostcardFacts): string {
  const id = `postmark-${nextPostmarkId++}`;
  const waves = [34, 47, 60, 73, 86]
    .map((y) => `<path d="M112 ${y}q11.500-9 23 0t23 0t23 0t23 0"/>`)
    .join('');
  const ring = (text: string, path: string, size: number, spacing: number): string =>
    text
      ? `<text font-size="${size}" letter-spacing="${spacing}"><textPath href="#${id}-${path}" startOffset="50%" text-anchor="middle">${escapeHtml(text.toUpperCase())}</textPath></text>`
      : '';
  return (
    `<svg class="postcard-postmark" viewBox="0 0 210 120" aria-hidden="true" focusable="false">` +
    `<defs><path id="${id}-top" d="M24 60A36 36 0 0 1 96 60"/><path id="${id}-bottom" d="M16 60A44 44 0 0 0 104 60"/></defs>` +
    `<g fill="none" stroke="currentColor" stroke-linecap="round">` +
    `<circle cx="60" cy="60" r="50" stroke-width="2.600"/><circle cx="60" cy="60" r="30" stroke-width="1.500"/>` +
    `<g stroke-width="2.200">${waves}</g></g>` +
    ring(facts.cityName, 'top', 9.5, 1.4) +
    ring(facts.country, 'bottom', 8, 1.8) +
    `<text x="60" y="55" text-anchor="middle" font-size="11.500">${escapeHtml(facts.postmarkDate)}</text>` +
    `<text x="60" y="67" text-anchor="middle" font-size="9">${escapeHtml(facts.postmarkYear)}</text>` +
    `<text x="60" y="79" text-anchor="middle" font-size="8.500">${escapeHtml(facts.localTime)}</text>` +
    `</svg>`
  );
}
