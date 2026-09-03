import { describe, it, expect, vi, afterEach } from 'vitest';
import { Window } from 'happy-dom';
import { estimatePageCount, A4 } from '@/print/a4';
import { openPrintLesson } from '@/print/open-print';
import { renderPrintLesson } from '@/print/render-print-lesson';
import { mountA4Preview } from '@/teacher/a4-preview';
import { renderBlock } from '@/blocks/render';
import { createBlock } from '@/blocks/create-block';
import type { Lesson } from '@/schemas/lesson';

function minimalLesson(overrides: Partial<Lesson> = {}): Lesson {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'lesson_print_1',
    type: 'lesson',
    title: 'Forces worksheet',
    slug: 'forces_worksheet',
    status: 'active',
    unit_id: 'unit_1',
    sequence: 1,
    blocks: [],
    created_at: now,
    updated_at: now,
    schema_version: 1,
    ...overrides
  };
}

describe('A4 constants', () => {
  it('exposes portrait dimensions and margins', () => {
    expect(A4.widthMm).toBe(210);
    expect(A4.heightMm).toBe(297);
    expect(A4.marginMm).toBe(15);
  });

  it('estimates page count from content height', () => {
    const printable = A4.heightMm - A4.marginMm * 2;
    expect(estimatePageCount(printable)).toBe(1);
    expect(estimatePageCount(printable + 1)).toBe(2);
    expect(estimatePageCount(0)).toBe(1);
  });
});

describe('renderPrintLesson', () => {
  it('builds a print document with title and student-visible blocks', () => {
    const visible = createBlock('heading', 'block_visible');
    if (visible.block_type === 'heading') visible.content.text = 'Learning intention';
    const hidden = createBlock('callout', 'block_hidden');
    hidden.visibility = 'teacher_only';

    const root = renderPrintLesson(
      minimalLesson({ blocks: [visible, hidden] })
    );

    expect(root.classList.contains('print-document')).toBe(true);
    expect(root.querySelector('.print-document__title')?.textContent).toBe(
      'Forces worksheet'
    );
    expect(root.querySelectorAll('[data-block-id]').length).toBe(1);
    expect(root.querySelector(`[data-block-id="${hidden.id}"]`)).toBeNull();
  });

  it('omits nested teacher_only blocks inside section', () => {
    const section = createBlock('section', 'sec_print');
    if (section.block_type !== 'section') throw new Error('expected section');
    const visible = createBlock('heading', 'block_nested_visible');
    if (visible.block_type === 'heading') visible.content.text = 'Student content';
    const hidden = createBlock('callout', 'block_nested_hidden');
    hidden.visibility = 'teacher_only';
    section.content.blocks = [visible, hidden] as typeof section.content.blocks;

    const root = renderPrintLesson(minimalLesson({ blocks: [section] }));

    expect(root.querySelector(`[data-block-id="${visible.id}"]`)).not.toBeNull();
    expect(root.querySelector(`[data-block-id="${hidden.id}"]`)).toBeNull();
  });
});

describe('print mode blocks', () => {
  it('draws response_space lines for short_answer questions', () => {
    const block = createBlock('question_set', 'qs_print_1');
    if (block.block_type !== 'question_set') throw new Error('expected question_set');
    block.content.questions = [
      {
        id: 'q1',
        prompt: 'Explain gravity',
        kind: 'short_answer',
        response_space: 'short'
      },
      {
        id: 'q2',
        prompt: 'Pick one',
        kind: 'multiple_choice',
        options: ['A', 'B']
      }
    ];

    const el = renderBlock(block, 'print');
    const lines = el.querySelectorAll('.block-question-set__response-lines .block-question-set__line');
    expect(lines.length).toBeGreaterThan(0);
    const items = el.querySelectorAll('.block-question-set__question');
    expect(items[0]?.querySelector('.block-question-set__response-lines')).toBeTruthy();
    expect(items[1]?.querySelector('.block-question-set__response-lines')).toBeNull();
  });

  it('defaults missing response_space to medium line count', () => {
    const block = createBlock('question_set', 'qs_print_2');
    if (block.block_type !== 'question_set') throw new Error('expected question_set');
    block.content.questions = [
      { id: 'q1', prompt: 'Legacy', kind: 'short_answer' }
    ];
    const medium = renderBlock(
      {
        ...block,
        content: {
          questions: [
            { id: 'q1', prompt: 'Legacy', kind: 'short_answer', response_space: 'medium' }
          ]
        }
      },
      'print'
    );
    const legacy = renderBlock(block, 'print');
    expect(
      legacy.querySelectorAll('.block-question-set__line').length
    ).toBe(medium.querySelectorAll('.block-question-set__line').length);
  });

  it('renders short response_space as exactly 2 lines', () => {
    const block = createBlock('question_set', 'qs_print_3');
    if (block.block_type !== 'question_set') throw new Error('expected question_set');
    block.content.questions = [
      { id: 'q1', prompt: 'Brief', kind: 'short_answer', response_space: 'short' }
    ];
    const el = renderBlock(block, 'print');
    expect(el.querySelectorAll('.block-question-set__line').length).toBe(2);
  });

  it('renders video as static title + url without iframe', () => {
    const block = createBlock('video', 'video_print_1');
    if (block.block_type !== 'video') throw new Error('expected video');
    block.content.title = 'Demo';
    const el = renderBlock(block, 'print');
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('.block-print-fallback')).toBeTruthy();
  });

  it('expands accordion items in print mode', () => {
    const block = createBlock('accordion', 'acc_print_1');
    if (block.block_type !== 'accordion') throw new Error('expected accordion');
    const el = renderBlock(block, 'print');
    for (const details of el.querySelectorAll('details')) {
      expect(details.open).toBe(true);
    }
  });

  it('renders tabs as sequential sections in print mode', () => {
    const block = createBlock('tabs', 'tabs_print_1');
    if (block.block_type !== 'tabs') throw new Error('expected tabs');
    const el = renderBlock(block, 'print');
    expect(el.querySelector('.block-tabs__tablist')).toBeNull();
    expect(el.querySelectorAll('.block-tabs__print-panel').length).toBeGreaterThanOrEqual(2);
  });

  it('stacks columns vertically in print mode', () => {
    const block = createBlock('columns', 'cols_print_1');
    if (block.block_type !== 'columns') throw new Error('expected columns');
    const el = renderBlock(block, 'print');
    expect(el.querySelector('.block-columns')?.classList.contains('block-columns--print-stack')).toBe(
      true
    );
  });

  it('renders flashcards as static print summary without controls', () => {
    const block = createBlock('flashcards', 'fc_print_1');
    if (block.block_type !== 'flashcards') throw new Error('expected flashcards');
    block.content.cards = [
      { id: 'c1', front: 'Term', back: 'Definition' },
      { id: 'c2', front: 'Force', back: 'A push or pull' }
    ];

    const el = renderBlock(block, 'print');

    expect(el.querySelector('.block-flashcards__print')).not.toBeNull();
    expect(el.querySelector('.block-flashcards__controls')).toBeNull();
    expect(el.querySelector('.block-flashcards__card')).toBeNull();
    expect(el.querySelector('button')).toBeNull();
  });

  it('renders gallery as static grid without carousel or lightbox controls', () => {
    const block = createBlock('gallery', 'gal_print_1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    block.content.layout = 'carousel';
    block.content.items = [
      {
        id: 'i1',
        url: 'https://example.com/a.jpg',
        alt_text: 'Photo A',
        caption: 'First'
      },
      {
        id: 'i2',
        url: 'https://example.com/b.jpg',
        alt_text: 'Photo B'
      }
    ];

    const el = renderBlock(block, 'print');

    expect(el.querySelector('.block-gallery--print')).not.toBeNull();
    expect(el.querySelector('.block-gallery__controls')).toBeNull();
    expect(el.querySelector('.block-gallery__prev')).toBeNull();
    expect(el.querySelector('.block-gallery__next')).toBeNull();
    expect(el.querySelector('.block-gallery__open')).toBeNull();
    expect(el.querySelectorAll('.block-gallery__item img').length).toBe(2);
  });
});

describe('mountA4Preview', () => {
  it('update renders a print document in the preview panel', () => {
    const host = document.createElement('div');
    const preview = mountA4Preview(host);

    preview.update(minimalLesson());

    expect(host.classList.contains('a4-preview')).toBe(true);
    expect(host.querySelector('.print-document')).not.toBeNull();
    expect(host.querySelector('.a4-preview__pages')?.textContent).toMatch(/page/);

    preview.dispose();
  });
});

describe('openPrintLesson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('shows an in-page print document even when pop-ups are unavailable', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    openPrintLesson(minimalLesson());

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Print');
    expect(dialog?.querySelector('.print-document')).not.toBeNull();
    expect(dialog?.querySelector('.print-document__title')?.textContent).toBe(
      'Forces worksheet'
    );
    expect(openSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('closes the print preview without leaving the editor', () => {
    openPrintLesson(minimalLesson());
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('[data-print-modal-action="close"]')?.click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('.print-document')).toBeNull();
  });

  it('prints from the preview without noopener so the document handle is usable', async () => {
    const printWindow = new Window();
    const printSpy = vi.fn();
    (printWindow as unknown as { print: typeof printSpy }).print = printSpy;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as WindowProxy);

    openPrintLesson(minimalLesson());
    document.querySelector<HTMLButtonElement>('[data-print-modal-action="print"]')?.click();

    await vi.waitUntil(() => printSpy.mock.calls.length > 0);

    expect(openSpy).toHaveBeenCalled();
    const features = String(openSpy.mock.calls[0]?.[2] ?? '');
    expect(features).not.toMatch(/noopener/);
    expect(printWindow.document.querySelector('.print-document')).not.toBeNull();
    expect(printWindow.document.title).toBe('Forces worksheet');
    const styleText = printWindow.document.querySelector('style')?.textContent ?? '';
    expect(styleText).toContain('@page');
    expect(styleText).toContain('.block-flashcards__print');
    expect(styleText).toContain('.block-gallery__controls');
    expect(printSpy).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('alerts when the preview Print action cannot open a print tab', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'open').mockReturnValue(null);

    openPrintLesson(minimalLesson());
    document.querySelector<HTMLButtonElement>('[data-print-modal-action="print"]')?.click();

    expect(alertSpy).toHaveBeenCalledWith('Allow pop-ups to print this lesson.');
    expect(document.querySelector('.print-document')).not.toBeNull();
  });
});
