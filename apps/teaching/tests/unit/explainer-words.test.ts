import { describe, it, expect } from 'vitest';
import { parseAnnotationSource } from '@/blocks/annotation-text';
import { anchorFromWords, anchorWords, tokenise, wordsOfAnchor } from '@/blocks/explainer/words';
import { createTextPane } from '@/blocks/explainer/text-pane';
import { stateAt } from '@/blocks/explainer/fold';
import { phrase, SAMPLE_TEXT } from '@/dev/explainer-sample';

const rect = (x: number, y: number, w: number, h: number) =>
  ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;

/** Lay the spans out as fixed-width words that wrap at `width`, the way a browser would. */
function layOut(root: HTMLElement, width: number): void {
  root.getBoundingClientRect = () => rect(0, 0, width, 600);
  let x = 0;
  let y = 0;
  for (const span of root.querySelectorAll<HTMLElement>('[data-w]')) {
    const w = 10 * (span.textContent?.length ?? 1);
    if (x + w > width) {
      x = 0;
      y += 30;
    }
    const r = rect(x + 20, y, w, 24);
    span.getBoundingClientRect = () => r;
    span.getClientRects = () => [r] as unknown as DOMRectList;
    x += w + 6;
  }
}

describe('explainer words', () => {
  const text = parseAnnotationSource(SAMPLE_TEXT, 'prose');
  const words = tokenise(text);

  it('splits the text into words with their line offsets', () => {
    expect(words[0]).toMatchObject({ i: 0, w: 'The', start: 0, end: 3 });
    expect(words.find((w) => w.w === 'again')).toBeTruthy();
    // Punctuation is not a word.
    expect(words.some((w) => /[.,]/.test(w.w))).toBe(false);
  });

  it('an anchor over words resolves back to the same words', () => {
    const [a, b] = phrase(words, 'harbour fills with light');
    const anchor = anchorFromWords(text, b, a, words)!;
    expect(anchorWords(anchor)).toBe('harbour fills with light');
    expect(wordsOfAnchor(text, anchor, words)).toEqual([a, b]);
  });

  it('a span that runs into the next paragraph stops at the end of the first', () => {
    const [a] = phrase(words, 'shore');
    const [, b] = phrase(words, 'My notes');
    const anchor = anchorFromWords(text, a, b, words)!;
    expect(anchorWords(anchor)).toBe('shore');
  });

  it('an anchor survives a typo fixed earlier in its line', () => {
    const [a, b] = phrase(words, 'repeated word again');
    const anchor = anchorFromWords(text, a, b, words)!;
    const fixed = parseAnnotationSource(SAMPLE_TEXT.replace('The writer', 'This writer'), 'prose');
    const range = wordsOfAnchor(fixed, anchor)!;
    expect(tokenise(fixed).slice(range[0], range[1] + 1).map((w) => w.w).join(' ')).toBe('repeated word again');
  });

  it('marks land on the same words at two widths', () => {
    const [a, b] = phrase(words, 'harbour fills with light and the repeated word again');
    const anchor = anchorFromWords(text, a, b, words)!;
    const state = stateAt(
      { recording: { status: 'published', clips: [], duration_s: 5, events: [{ id: 'm1', t: 1, kind: 'mark', style: 'underline', anchor }] } },
      5
    );
    const pane = createTextPane(text);
    document.body.append(pane.el);
    const covered = (width: number) => {
      layOut(pane.el, width);
      pane.paint(state);
      const paths = [...pane.el.querySelectorAll<SVGPathElement>('path[data-id="m1"]')];
      // Each underline runs under words a..b only.
      const ys = paths.map((p) => Number(/M[\d.]+ ([\d.]+)/.exec(p.getAttribute('d')!)![1]));
      return { lines: paths.length, ys, items: [a, b].map((w) => pane.itemOnWord(w)) };
    };
    const wide = covered(2000);
    const narrow = covered(300);
    expect(wide.lines).toBe(1);
    expect(narrow.lines).toBeGreaterThan(1);
    expect(wide.items).toEqual(['m1', 'm1']);
    expect(narrow.items).toEqual(['m1', 'm1']);
    expect(pane.itemOnWord(a - 1)).toBeNull();
    expect(pane.itemOnWord(b + 1)).toBeNull();
    pane.dispose();
    pane.el.remove();
  });
});
