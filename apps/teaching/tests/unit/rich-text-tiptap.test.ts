import { beforeEach, describe, expect, it } from 'vitest';
import { mountRichTextTiptap } from '@/blocks/rich-text-tiptap';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';

describe('mountRichTextTiptap', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('round-trips stored html through load → edit → getHtml', () => {
    const stored = '<p>Hello <strong>world</strong></p><ul><li>one</li><li><em>two</em></li></ul>';
    const handle = mountRichTextTiptap({ html: stored, onHtml: () => undefined });
    document.body.append(handle.host);

    const loaded = sanitizeRichTextHtml(handle.getHtml());
    expect(loaded).toContain('<strong>world</strong>');
    expect(loaded).toContain('<li>');
    expect(loaded).not.toContain('<script');

    handle.editor.commands.focus('end');
    handle.editor.commands.insertContent('<p>appended</p>');
    const afterEdit = sanitizeRichTextHtml(handle.getHtml());
    expect(afterEdit).toContain('appended');
    expect(afterEdit).toContain('<strong>world</strong>');

    handle.destroy();
  });

  it('strips disallowed tags when publishing updates', () => {
    const published: string[] = [];
    const handle = mountRichTextTiptap({
      html: '<p>Start</p>',
      onHtml: (html) => published.push(html)
    });
    document.body.append(handle.host);

    handle.surface.innerHTML = '<p>Safe</p><script>alert(1)</script>';
    handle.surface.dispatchEvent(new Event('input', { bubbles: true }));

    expect(published.at(-1)).toContain('<p>Safe</p>');
    expect(published.at(-1)).not.toContain('script');
    handle.destroy();
  });
});
