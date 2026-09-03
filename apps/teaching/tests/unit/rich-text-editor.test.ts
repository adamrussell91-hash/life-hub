import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRichTextEditor } from '@/blocks/editors';
import type { Block } from '@/schemas/block';

const baseBlock = {
  id: 'block_1',
  type: 'block' as const,
  variant: 'plain',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};

function richTextBlock(html: string): Extract<Block, { block_type: 'rich_text' }> {
  return {
    ...baseBlock,
    block_type: 'rich_text',
    content: { html }
  } as Extract<Block, { block_type: 'rich_text' }>;
}

function mount(html: string): {
  editor: HTMLElement;
  surface: HTMLElement;
  onChange: ReturnType<typeof vi.fn>;
} {
  const block = richTextBlock(html);
  const onChange = vi.fn();
  const editor = createRichTextEditor(block, onChange);
  document.body.append(editor);
  const surface = editor.querySelector<HTMLElement>('.block-editor__rich');
  if (!surface) throw new Error('rich text surface not found');
  return { editor, surface, onChange };
}

function selectAllIn(surface: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(surface);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function toolbarButton(editor: HTMLElement, label: string): HTMLButtonElement {
  const button = [...editor.querySelectorAll('button')].find((btn) => btn.textContent === label);
  if (!button) throw new Error(`toolbar button ${label} not found`);
  return button;
}

describe('createRichTextEditor', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('shows formatted text rather than markup', () => {
    const { surface } = mount('<p>Facts about <strong>Shakespeare</strong></p>');

    expect(surface.isContentEditable || surface.getAttribute('contenteditable')).toBeTruthy();
    expect(surface.querySelector('strong')?.textContent).toBe('Shakespeare');
    expect(surface.textContent).toContain('Facts about Shakespeare');
    expect(surface.textContent).not.toContain('<strong>');
    expect(surface.textContent).not.toContain('</p>');
  });

  it('reports edits as sanitised html', () => {
    const { surface, onChange } = mount('<p>Start</p>');

    surface.innerHTML = '<p>Updated</p><script>alert(1)</script>';
    surface.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const html = onChange.mock.calls[0]?.[0]?.content.html as string;
    expect(html).toContain('<p>Updated</p>');
    expect(html).not.toContain('script');
  });

  it('bolds the selection instead of typing tags into the text', () => {
    const { editor, surface, onChange } = mount('<p>Shakespeare</p>');

    selectAllIn(surface);
    toolbarButton(editor, 'Bold').click();

    expect(surface.querySelector('strong')?.textContent).toContain('Shakespeare');
    expect(surface.textContent).not.toContain('<strong>');
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.lastCall?.[0]?.content.html).toContain('<strong>');
  });

  it('turns the selection into a real list', () => {
    const { editor, surface, onChange } = mount('<p>One</p><p>Two</p>');

    selectAllIn(surface);
    toolbarButton(editor, 'Bullet list').click();

    expect(surface.querySelectorAll('ul li').length).toBe(2);
    expect(onChange.mock.lastCall?.[0]?.content.html).toContain('<ul>');
  });

  it('still allows editing the html directly', () => {
    const { editor, onChange } = mount('<p>Start</p>');

    const source = editor.querySelector<HTMLTextAreaElement>('.block-editor__html')!;
    expect(source.hidden).toBe(true);

    toolbarButton(editor, 'HTML').click();
    expect(source.hidden).toBe(false);

    source.value = '<p>Typed by hand</p>';
    source.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange.mock.lastCall?.[0]?.content.html).toBe('<p>Typed by hand</p>');
  });
});
