import { describe, it, expect, vi } from 'vitest';
import { CALLOUT_STYLE_CLASS, renderBlock } from '@/blocks/render';
import {
  createBlockEditor,
  createCalloutEditor,
  createHeadingEditor,
  createRichTextEditor
} from '@/blocks/editors';
import { blockRegistry } from '@/blocks/registry';
import type { Block } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

describe('renderBlock', () => {
  it('renders rich_text with sanitised HTML only', () => {
    const block: Block = {
      ...baseBlock,
      block_type: 'rich_text',
      content: { html: '<p>Hi</p><script>alert(1)</script>' }
    };

    const el = renderBlock(block, 'student');
    const richText = el.querySelector('.block-rich-text');

    expect(richText?.innerHTML).toBe('<p>Hi</p>');
    expect(el.querySelector('script')).toBeNull();
  });

  it('maps heading variants to h1, h2, and h3', () => {
    const cases = [
      { variant: 'page', tag: 'H1' },
      { variant: 'section', tag: 'H2' },
      { variant: 'subsection', tag: 'H3' }
    ] as const;

    for (const { variant, tag } of cases) {
      const block: Block = {
        ...baseBlock,
        id: `heading_${variant}`,
        block_type: 'heading',
        variant,
        content: { text: `${variant} title` }
      };

      const el = renderBlock(block, 'student');
      const heading = el.querySelector('.block-heading');

      expect(heading?.tagName).toBe(tag);
      expect(heading?.textContent).toBe(`${variant} title`);
      expect(heading?.classList.contains(`block-heading--${variant}`)).toBe(true);
    }
  });

  it('maps callout styles to semantic token accent classes', () => {
    const block: Block = {
      ...baseBlock,
      block_type: 'callout',
      content: {
        style: 'extension',
        title: 'Extension',
        body: 'Go further.'
      }
    };

    const el = renderBlock(block, 'student');
    const callout = el.querySelector('.callout');

    expect(callout?.classList.contains('callout--sand')).toBe(true);
    expect(el.querySelector('.callout__title')?.textContent).toBe('Extension');
    expect(el.querySelector('.callout__body')?.textContent).toBe('Go further.');
  });

  it('uses High Sea accent sparingly for important and warning callouts', () => {
    for (const style of ['important', 'warning'] as const) {
      const block: Block = {
        ...baseBlock,
        id: `callout_${style}`,
        block_type: 'callout',
        content: { style, body: 'Note.' }
      };

      const el = renderBlock(block, 'student');
      expect(el.querySelector('.callout')?.classList.contains('callout--high-sea')).toBe(true);
    }
  });

  it('marks teacher_only blocks in teacher mode', () => {
    const block: Block = {
      ...baseBlock,
      block_type: 'rich_text',
      visibility: 'teacher_only',
      content: { html: '<p>Notes</p>' }
    };

    const teacherEl = renderBlock(block, 'teacher');
    const studentEl = renderBlock(block, 'student');

    expect(teacherEl.classList.contains('block--teacher-only')).toBe(true);
    expect(studentEl.classList.contains('block--teacher-only')).toBe(false);
  });

  it('renders image with alt and caption', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'image',
        variant: 'large',
        content: { url: 'https://example.com/a.png', alt_text: 'Alt', caption: 'Caption' }
      },
      'student'
    );
    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
    expect(img?.getAttribute('alt')).toBe('Alt');
    expect(el.textContent).toContain('Caption');
  });

  it('skips unsafe image URLs', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'image',
        variant: 'large',
        content: { url: 'javascript:alert(1)', alt_text: 'Unsafe', caption: 'Caption' }
      },
      'student'
    );
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.block-image__unavailable')?.textContent).toBe('Unsafe');
    expect(el.textContent).toContain('Caption');
  });

  it('renders youtube video iframe lazily', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'video',
        variant: 'large',
        content: { provider: 'youtube', external_id: 'dQw4w9WgXcQ' }
      },
      'student'
    );
    const iframe = el.querySelector('iframe');
    expect(iframe?.getAttribute('loading')).toBe('lazy');
    expect(iframe?.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('renders embed iframe plus open link', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'embed',
        variant: 'large',
        content: { url: 'https://example.com/page', title: 'Example' }
      },
      'student'
    );
    expect(el.querySelector('iframe')?.getAttribute('src')).toBe('https://example.com/page');
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/page');
    expect(link?.textContent).toContain('Example');
  });

  it('skips unsafe embed URLs', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'embed',
        variant: 'large',
        content: { url: 'javascript:alert(1)', title: 'Bad' }
      },
      'student'
    );
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('.block-embed__unavailable')?.textContent).toBe('Embed unavailable.');
  });

  it('shows a fallback when a video has no id', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'video',
        variant: 'large',
        content: { provider: 'youtube', external_id: '' }
      },
      'student'
    );
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('.block-video__unavailable')?.textContent).toBe('Video unavailable.');
  });

  it('replaces a broken image with unavailable copy', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'image',
        variant: 'large',
        content: { url: 'https://example.com/missing.png', alt_text: 'Harbour' }
      },
      'student'
    );
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    img!.dispatchEvent(new Event('error'));
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.block-image__unavailable')?.textContent).toBe('Harbour');
  });

  it('sanitises html blocks', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'html',
        content: { html: '<p>Hi</p><script>alert(1)</script>' }
      },
      'student'
    );
    expect(el.innerHTML).toContain('<p>Hi</p>');
    expect(el.innerHTML).not.toContain('script');
  });
});

describe('CALLOUT_STYLE_CLASS', () => {
  it('covers every callout style from the schema', () => {
    const styles = [
      'information',
      'important',
      'warning',
      'extension',
      'scaffold',
      'example',
      'remember',
      'teacher'
    ] as const;

    for (const style of styles) {
      expect(CALLOUT_STYLE_CLASS[style]).toMatch(/^callout--/);
    }
  });
});

describe('block editors', () => {
  it('createRichTextEditor calls back when the formatted text changes', () => {
    const block: Block = {
      ...baseBlock,
      block_type: 'rich_text',
      content: { html: '<p>Start</p>' }
    };
    const onChange = vi.fn();

    const editor = createRichTextEditor(block, onChange);
    const surface = editor.querySelector<HTMLElement>('.block-editor__rich')!;

    surface.innerHTML = '<p>Updated</p>';
    surface.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith({
      ...block,
      content: { html: '<p>Updated</p>' }
    });
  });

  it('createHeadingEditor calls back when text or variant changes', () => {
    const block: Block = {
      ...baseBlock,
      block_type: 'heading',
      variant: 'section',
      content: { text: 'Before' }
    };
    const onChange = vi.fn();

    const editor = createHeadingEditor(block, onChange);
    const textInput = editor.querySelector<HTMLInputElement>('.block-editor__heading-text')!;
    const variantSelect = editor.querySelector<HTMLSelectElement>('.block-editor__heading-variant')!;

    textInput.value = 'After';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...block,
      content: { text: 'After' }
    });

    variantSelect.value = 'subsection';
    variantSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...block,
      variant: 'subsection',
      content: { text: 'After' }
    });
  });

  it('createCalloutEditor calls back when fields change', () => {
    const block: Block = {
      ...baseBlock,
      block_type: 'callout',
      content: { style: 'information', title: 'Info', body: 'Body' }
    };
    const onChange = vi.fn();

    const editor = createCalloutEditor(block, onChange);
    const bodyInput = editor.querySelector<HTMLTextAreaElement>('.block-editor__callout-body')!;

    bodyInput.value = 'New body';
    bodyInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...block,
      content: { style: 'information', title: 'Info', body: 'New body' }
    });
  });

  it('includes a visibility select on every editor', () => {
    const onChange = vi.fn();
    const richText: Block = {
      ...baseBlock,
      block_type: 'rich_text',
      content: { html: '<p>x</p>' }
    };

    const editor = createBlockEditor(richText, onChange);
    const visibility = editor.querySelector<HTMLSelectElement>('.block-editor__visibility')!;

    visibility.value = 'teacher_only';
    visibility.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith({
      ...richText,
      visibility: 'teacher_only'
    });
  });
});

describe('blockRegistry', () => {
  it('maps every block_type to render and editor helpers', () => {
    expect(Object.keys(blockRegistry).sort()).toEqual([
      'accordion',
      'attachment',
      'audio',
      'callout',
      'chart',
      'cloze',
      'code',
      'collection',
      'columns',
      'concept_map',
      'definition',
      'diagram',
      'divider',
      'embed',
      'equation',
      'flashcards',
      'gallery',
      'heading',
      'html',
      'html_app',
      'image',
      'mind_map',
      'outcomes',
      'question_set',
      'quote',
      'rich_text',
      'section',
      'self_check',
      'spacer',
      'table',
      'tabs',
      'timeline',
      'video'
    ]);

    for (const key of Object.keys(blockRegistry) as Array<Block['block_type']>) {
      expect(typeof blockRegistry[key].render).toBe('function');
      expect(typeof blockRegistry[key].createEditor).toBe('function');
    }
  });
});
