// apps/teaching/src/lecture/slide-import/scenes.ts
import type { Block } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import type { PptxSlide } from './pptx';

/** One slide that will become a scene, with its page in the PDF export (1-based). */
export type SlidePair = { slide: PptxSlide; page: number };

export type Pairing = { ok: true; pairs: SlidePair[] } | { ok: false; message: string };

/**
 * Matches slides to PDF pages. PowerPoint leaves hidden slides out of a PDF
 * by default, but "Include hidden slides" puts them back, so either count
 * works. Anything else means the PDF is from another version of the deck.
 */
export function pairSlides(slides: readonly PptxSlide[], pageCount: number): Pairing {
  const shown = slides.filter((slide) => !slide.hidden);
  if (pageCount === shown.length) return { ok: true, pairs: shown.map((slide, i) => ({ slide, page: i + 1 })) };
  if (pageCount === slides.length) {
    return { ok: true, pairs: slides.flatMap((slide, i) => (slide.hidden ? [] : [{ slide, page: i + 1 }])) };
  }
  const hidden = slides.length - shown.length;
  const deck = `${shown.length} slide${shown.length === 1 ? '' : 's'}${hidden ? ` (plus ${hidden} hidden)` : ''}`;
  return {
    ok: false,
    message: `The PDF has ${pageCount} page${pageCount === 1 ? '' : 's'} but the deck has ${deck}. Export the PDF again from this same deck.`
  };
}

export function sceneTitle(slide: PptxSlide): string {
  return slide.title || `Slide ${slide.number}`;
}

/** What a screen reader says for the slide picture: its title and words. */
export function slideAltText(slide: PptxSlide): string {
  const words = [slide.title, ...slide.text].filter(Boolean).join('. ');
  const alt = words ? `Slide ${slide.number}: ${words}` : `Slide ${slide.number}`;
  return alt.length > 1000 ? `${alt.slice(0, 999)}…` : alt;
}

/** A heading that starts the scene, carrying the notes as its script, then the slide picture. */
export function slideSceneBlocks(slide: PptxSlide, imageUrl: string, newId: () => string): Block[] {
  const heading = createBlock('heading', newId());
  const image = createBlock('image', newId());
  return [
    { ...heading, content: { text: sceneTitle(slide), ...(slide.notes ? { script: slide.notes.slice(0, 8000) } : {}) } } as Block,
    { ...image, content: { url: imageUrl, alt_text: slideAltText(slide) } } as Block
  ];
}
