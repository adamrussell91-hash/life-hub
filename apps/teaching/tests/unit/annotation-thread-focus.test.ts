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

  it('shows a thread chip and folds non-stop lines on focus', () => {
    mockViewport(1440);
    const fixture = structuredClone(threadFocusFixture);
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    const chip = el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]');
    expect(chip).toBeTruthy();
    chip!.click();

    expect(el.querySelector('.block-annotation__show-all')).toBeTruthy();
    const folds = [...el.querySelectorAll<HTMLButtonElement>('.block-annotation__fold')];
    expect(folds.length).toBeGreaterThan(0);
    expect(folds.every((btn) => (btn.getAttribute('aria-label') || '').includes('hidden lines'))).toBe(
      true
    );
    expect(el.querySelector('[data-line-id="line_1"]')).toBeTruthy();
    expect(el.querySelector('[data-line-id="line_2"]')).toBeNull();
    // No unexplained arc drawing; numbered pips mark each place instead.
    expect(el.querySelector('.block-annotation__arcs')).toBeNull();
    expect(el.querySelectorAll('.block-annotation__pip').length).toBe(5);

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

  it('keeps expanded folds across a layer tick (V7)', () => {
    mockViewport(1440);
    const fixture = structuredClone(threadFocusFixture);
    const el = renderAnnotationBlock(fixture, 'student');
    document.body.append(el);

    el.querySelector<HTMLButtonElement>('[data-thread-id="ann_motif"]')!.click();
    const fold = el.querySelector<HTMLButtonElement>('.block-annotation__fold')!;
    const foldId = fold.dataset.foldId!;
    fold.click();
    expect(
      el.querySelector(`[data-fold-id="${foldId}"]`)?.getAttribute('aria-expanded')
    ).toBe('true');

    const structure = [...el.querySelectorAll<HTMLButtonElement>('.block-annotation__chip')].find(
      (chip) => (chip.textContent || '').includes('Structure')
    )!;
    structure.click();

    expect(
      el.querySelector(`[data-fold-id="${foldId}"]`)?.getAttribute('aria-expanded')
    ).toBe('true');
    expect(el.querySelector('.block-annotation__show-all')).toBeTruthy();

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

  it('print lists thread footnotes without arcs or folds', () => {
    const el = renderAnnotationBlock(threadFocusFixture, 'print');
    expect(el.querySelector('.block-annotation__arcs')).toBeNull();
    expect(el.querySelector('.block-annotation__fold')).toBeNull();
    expect(el.textContent).toContain('Thread: lines');
    expect(el.textContent).toContain('Exhaustion motif');
  });
});
