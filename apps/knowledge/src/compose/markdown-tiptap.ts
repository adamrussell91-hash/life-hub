/**
 * Knowledge compose body: TipTap with Markdown in/out.
 * Page.body stays a Markdown string; reader still uses renderMarkdown.
 * connected[] is orthogonal and must be preserved by the compose save path.
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';

export type MarkdownTiptapHandle = {
  host: HTMLElement;
  editor: Editor;
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  destroy: () => void;
};

export function mountMarkdownTiptap(options: {
  markdown: string;
  onMarkdown?: (markdown: string) => void;
  ariaLabel?: string;
}): MarkdownTiptapHandle {
  const host = document.createElement('div');
  host.className = 'compose__tiptap';

  const editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        horizontalRule: true
      }),
      Markdown
    ],
    content: options.markdown || '',
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'compose__tiptap-surface',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': options.ariaLabel ?? 'Body (markdown)'
      }
    },
    onUpdate: ({ editor: next }) => {
      options.onMarkdown?.(next.getMarkdown());
    }
  });

  return {
    host,
    editor,
    getMarkdown: () => editor.getMarkdown(),
    setMarkdown: (markdown) => {
      editor.commands.setContent(markdown || '', { contentType: 'markdown' });
    },
    destroy: () => editor.destroy()
  };
}
