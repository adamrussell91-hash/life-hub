/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { mountMarkdownTiptap } from './markdown-tiptap';

describe('mountMarkdownTiptap', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('round-trips markdown through the editor as a string body', () => {
    const handle = mountMarkdownTiptap({
      markdown: 'Hello **world**\n\n- one\n- two'
    });
    document.body.append(handle.host);

    expect(handle.editor.getText()).toContain('Hello');
    expect(handle.editor.getText()).toContain('world');

    handle.setMarkdown('Linked note stays markdown.');
    const out = handle.getMarkdown();
    expect(out).toContain('Linked note');
    expect(out).not.toContain('<p>');

    handle.destroy();
  });
});
