import { describe, expect, it } from 'vitest';
import { pairSlides, slideAltText, slideSceneBlocks } from '@/lecture/slide-import/scenes';
import type { PptxSlide } from '@/lecture/slide-import/pptx';

const slide = (number: number, over: Partial<PptxSlide> = {}): PptxSlide => ({
  number,
  title: `Title ${number}`,
  text: [],
  notes: '',
  hidden: false,
  ...over
});

describe('pairSlides', () => {
  const deck = [slide(1), slide(2, { hidden: true }), slide(3)];

  it('pairs shown slides with pages when the PDF left hidden slides out', () => {
    const result = pairSlides(deck, 2);
    expect(result.ok && result.pairs.map((p) => [p.slide.number, p.page])).toEqual([[1, 1], [3, 2]]);
  });

  it('skips the hidden slide’s page when the PDF kept it', () => {
    const result = pairSlides(deck, 3);
    expect(result.ok && result.pairs.map((p) => [p.slide.number, p.page])).toEqual([[1, 1], [3, 3]]);
  });

  it('stops on any other page count', () => {
    expect(pairSlides(deck, 5)).toEqual({
      ok: false,
      message: 'The PDF has 5 pages but the deck has 2 slides (plus 1 hidden). Export the PDF again from this same deck.'
    });
  });
});

describe('slideSceneBlocks', () => {
  let n = 0;
  const newId = () => `b${++n}`;

  it('makes a heading with the notes as script, then the slide picture', () => {
    const [heading, image] = slideSceneBlocks(slide(4, { text: ['Author', 'Reader'], notes: 'Start here.' }), '/m/4.jpg', newId);
    expect(heading).toMatchObject({ block_type: 'heading', variant: 'section', content: { text: 'Title 4', script: 'Start here.' } });
    expect(image).toMatchObject({ block_type: 'image', variant: 'large', content: { url: '/m/4.jpg', alt_text: 'Slide 4: Title 4. Author. Reader' } });
    expect(heading!.id).not.toBe(image!.id);
  });

  it('names an untitled slide by number and leaves out an empty script', () => {
    const [heading] = slideSceneBlocks(slide(7, { title: '' }), '/m/7.jpg', newId);
    expect(heading!.content).toEqual({ text: 'Slide 7' });
    expect(slideAltText(slide(7, { title: '' }))).toBe('Slide 7');
  });
});
