import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAnnotationBlock } from '@/blocks/render';
import { threadFocusFixture } from '../../fixtures/annotation-thread-focus';

describe('annotation thread focus (3b)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockViewport(width: number): void {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      const narrow = width <= 720;
      const matches =
        query.includes('max-width: 720px') ? narrow : query.includes('min-width') ? !narrow : false;
      return {
        matches,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false
      } as MediaQueryList;
    });
  }

  it('fades lines outside the thread and numbers each place on focus', () => {
    mockViewport(1440);
    const fixture = structuredClone(threadFocusFixture);
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    const chip = el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]');
    expect(chip).toBeTruthy();
    chip!.click();

    expect(el.querySelector('.block-annotation__show-all')).toBeTruthy();
    // The whole text stays; no fold bars.
    expect(el.querySelector('.block-annotation__fold')).toBeNull();
    expect(el.querySelector('[data-line-id="line_1"]')!.classList.contains('is-thread-faded')).toBe(false);
    expect(el.querySelector('[data-line-id="line_2"]')!.classList.contains('is-thread-faded')).toBe(true);
    expect(el.querySelectorAll('.block-annotation__pip').length).toBe(5);

    el.querySelector<HTMLButtonElement>('.block-annotation__show-all')!.click();
    expect(el.querySelector('.is-thread-faded')).toBeNull();

    el.remove();
  });

  it('explains threads and says what the followed thread is', () => {
    mockViewport(1440);
    const fixture = structuredClone(threadFocusFixture);
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    const intro = el.querySelector<HTMLElement>('.block-annotation__threads-intro')!;
    expect(intro.hidden).toBe(false);
    expect(intro.textContent).toContain('follow one idea through several places');
    const chip = el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]')!;
    expect(chip.textContent).toContain('5 places');

    chip.click();
    const card = el.querySelector<HTMLElement>('.block-annotation__focus-bar')!;
    expect(card.hidden).toBe(false);
    expect(card.textContent).toContain('Following a thread');
    expect(card.textContent).toContain('5 places');
    expect(card.textContent).toContain('Exhaustion motif');
    expect(el.querySelector('.block-annotation__thread-menu')).toBeNull();
    expect(el.textContent).not.toContain('line of context');
    expect(el.querySelector<HTMLElement>('.block-annotation__threads-intro')!.hidden).toBe(true);

    el.remove();
  });

  it('shows the teacher thread title on the button and the card', () => {
    mockViewport(1440);
    const fixture = structuredClone(threadFocusFixture);
    const motif = fixture.content.annotations.find((a) => a.id === 'ann_motif')!;
    motif.thread = { ...(motif.thread ?? { order: 'text' }), title: 'Broken bodies' };
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    const chip = el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]')!;
    expect(chip.textContent).toContain('Broken bodies');
    // Not styled as a layer toggle.
    expect(chip.classList.contains('block-annotation__chip')).toBe(false);
    expect(chip.querySelector('.block-annotation__thread-glyph')).toBeTruthy();
    chip.click();
    const title = el.querySelector<HTMLElement>('.block-annotation__focus-title')!;
    expect(title.hidden).toBe(false);
    expect(title.textContent).toBe('Broken bodies');

    el.remove();
  });

  it('highlights only the linked words when thread places are words', () => {
    mockViewport(1440);
    const fixture = structuredClone(threadFocusFixture);
    const motif = fixture.content.annotations.find((a) => a.id === 'ann_motif')!;
    motif.anchor = {
      id: 'stop_1',
      granularity: 'word',
      stanza: 'stanza_1',
      line: 'line_1',
      start: 5,
      end: 11,
      quote: { exact: 'double', prefix: 'Bent ', suffix: ', like' }
    };
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);
    el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]')!.click();

    const row = el.querySelector<HTMLElement>('[data-line-id="line_1"]')!;
    expect(row.classList.contains('is-thread-partial')).toBe(true);
    const words = [...row.querySelectorAll<HTMLElement>('.block-annotation__thread-word')];
    expect(words.map((w) => w.textContent).join('')).toBe('double');
    expect(words[0]!.dataset.stop).toBe('1');
    el.remove();
  });

  it('stays on the thread across a layer tick (V7)', () => {
    mockViewport(1440);
    const fixture = structuredClone(threadFocusFixture);
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]')!.click();
    const structure = [...el.querySelectorAll<HTMLButtonElement>('.block-annotation__chip')].find(
      (chip) => (chip.textContent || '').includes('Structure')
    )!;
    structure.click();

    expect(el.querySelector('.block-annotation__show-all')).toBeTruthy();
    expect(el.querySelector('[data-line-id="line_2"]')!.classList.contains('is-thread-faded')).toBe(true);

    el.remove();
  });

  it('step-through shows stop captions and keyboard steps the thread', () => {
    mockViewport(1440);
    const fixture = structuredClone(threadFocusFixture);
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]')!.click();
    el.querySelector<HTMLButtonElement>('.block-annotation__step-btn[data-step="next"]')!.click();
    expect(el.textContent).toContain('Place 1 of 5');
    expect(el.textContent).toContain('Opening posture');

    const block = el.querySelector<HTMLElement>('.block-annotation')!;
    block.focus();
    block.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );
    expect(block.dataset.stepIndex).toBe('1');
    expect(el.textContent).toContain('Place 2 of 5');
    expect(el.textContent).toContain('Turning away from light');

    block.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    expect(el.querySelector('.block-annotation__show-all')).toBeNull();

    el.remove();
  });

  it('shows every place note under its line without stepping', () => {
    mockViewport(1440);
    const fixture = structuredClone(threadFocusFixture);
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]')!.click();
    const notes = [...el.querySelectorAll<HTMLElement>('.block-annotation__stop-note')];
    expect(notes.map((n) => n.dataset.stop)).toEqual(['1', '2', '3', '4', '5']);
    // Each note follows its own line, not the card at the top.
    expect(notes[0]!.previousElementSibling?.getAttribute('data-line-id')).toBe('line_1');
    expect(el.querySelector('.block-annotation__focus-bar')!.textContent).not.toContain('Opening posture');
    expect(el.querySelector('.block-annotation__stop-note.is-current')).toBeNull();

    el.remove();
  });

  it('steps from the place note itself and scrolls only when the place is off screen', () => {
    mockViewport(1440);
    const scrollBy = vi.fn();
    vi.spyOn(window, 'scrollBy').mockImplementation(scrollBy);
    const fixture = structuredClone(threadFocusFixture);
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]')!.click();
    el.querySelector<HTMLButtonElement>('.block-annotation__step-btn[data-step="next"]')!.click();
    const current = () => el.querySelector<HTMLElement>('.block-annotation__stop-note.is-current')!;
    expect(current().dataset.stop).toBe('1');
    expect(current().textContent).toContain('Place 1 of 5');

    // Place on screen: the page stays still.
    let top = 300;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ top, bottom: top + 40, left: 0, right: 0, width: 0, height: 40, x: 0, y: top }) as DOMRect
    );
    scrollBy.mockClear();
    current().querySelector<HTMLButtonElement>('[data-step="next"]')!.click();
    expect(current().dataset.stop).toBe('2');
    expect(current().querySelector<HTMLButtonElement>('[data-step="previous"]')!.disabled).toBe(false);
    expect(scrollBy).not.toHaveBeenCalled();

    // Place below the fold: scroll just enough to show the line and its note.
    top = window.innerHeight + 100;
    current().querySelector<HTMLButtonElement>('[data-step="next"]')!.click();
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0]![0].top).toBe(156);

    el.remove();
  });

  it('uses pips instead of arcs at 390', () => {
    mockViewport(390);
    const fixture = structuredClone(threadFocusFixture);
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    expect(el.querySelector('.block-annotation__thread-pick')).toBeTruthy();
    expect(el.querySelector('.block-annotation__arcs')).toBeNull();
    expect(el.querySelectorAll('.block-annotation__pip').length).toBe(5);

    el.remove();
  });

  it('print lists thread footnotes without folds', () => {
    const el = renderAnnotationBlock(threadFocusFixture, 'print');
    expect(el.querySelector('.block-annotation__arcs')).toBeNull();
    expect(el.querySelector('.block-annotation__fold')).toBeNull();
    expect(el.textContent).toContain('Thread: lines');
    expect(el.textContent).toContain('Exhaustion motif');
  });
});
