import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPptx } from '@/lecture/slide-import/pptx';

// Made with python-pptx: a title slide, a bullet slide, a hidden slide and a
// blank slide with one text box. fixtures/slide-import/deck.pdf is its export.
const deck = new Uint8Array(readFileSync(resolve(__dirname, '../../fixtures/slide-import/deck.pptx')));

describe('readPptx', () => {
  it('reads slides in deck order with titles, text and notes', () => {
    const slides = readPptx(deck);
    expect(slides.map((s) => [s.number, s.title, s.hidden])).toEqual([
      [1, 'Reading for context', false],
      [2, 'Three kinds of context', false],
      [3, 'Old draft slide', true],
      [4, '', false]
    ]);
    expect(slides[0].text).toEqual(['Year 11 English']);
    expect(slides[0].notes).toBe('Welcome back. Today we look at how a reader brings context to a text.');
    expect(slides[1].text).toEqual(['Author', 'Reader', 'Text']);
    expect(slides[1].notes).toBe('Start with the author.\n\nThen ask what the reader brings.');
    expect(slides[3].text).toEqual(['Write one sentence in your book.']);
    expect(slides[3].notes).toBe('');
  });

  it('says plainly when the file is not a deck', () => {
    expect(() => readPptx(new TextEncoder().encode('not a zip'))).toThrow('isn’t a PowerPoint');
  });
});
