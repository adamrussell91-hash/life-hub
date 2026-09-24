import { afterEach, describe, expect, it } from 'vitest';
import { mountRichTextTiptap } from '@/blocks/rich-text-tiptap';

describe('mountRichTextTiptap', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('publishes sanitised html on edit', () => {
    const seen: string[] = [];
    const handle = mountRichTextTiptap({
      html: '<p>Hello <strong>world</strong></p>',
      onHtml: (html) => seen.push(html)
    });
    document.body.append(handle.host);
    expect(handle.surface.textContent).toContain('Hello');
    handle.setHtml('<p>Updated</p><script>alert(1)</script>');
    expect(seen.at(-1)).toContain('<p>Updated</p>');
    expect(seen.at(-1)).not.toContain('script');
    handle.destroy();
  });

  it('keeps spaces when the browser sends an input event', () => {
    const handle = mountRichTextTiptap({
      html: '<p></p>',
      onHtml: () => undefined
    });
    document.body.append(handle.host);
    handle.editor.commands.insertContent('a  b');
    expect(handle.surface.textContent).toBe('a  b');
    handle.surface.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' })
    );
    expect(handle.surface.textContent).toBe('a  b');
    handle.destroy();
  });

  it('still accepts a programmatic DOM edit', () => {
    const seen: string[] = [];
    const handle = mountRichTextTiptap({
      html: '<p>Start</p>',
      onHtml: (html) => seen.push(html)
    });
    document.body.append(handle.host);
    handle.surface.innerHTML = '<p>Updated</p><script>alert(1)</script>';
    handle.surface.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen.at(-1)).toContain('<p>Updated</p>');
    expect(seen.at(-1)).not.toContain('script');
    handle.destroy();
  });
});
