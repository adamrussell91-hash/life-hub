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
});
