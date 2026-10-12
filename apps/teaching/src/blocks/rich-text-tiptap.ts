/**
 * Tiptap engine for Teaching `rich_text` blocks.
 * Persists sanitised HTML only — specialised lesson blocks stay outside ProseMirror.
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';

export type RichTextTiptapHandle = {
  /** Outer host appended to the block editor fields. */
  host: HTMLElement;
  /** ProseMirror contenteditable surface (has `.block-editor__rich`). */
  surface: HTMLElement;
  editor: Editor;
  getHtml: () => string;
  setHtml: (html: string, emit?: boolean) => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  destroy: () => void;
};

function runWithSelection(editor: Editor, apply: (chain: ReturnType<Editor['chain']>) => unknown): void {
  const { empty } = editor.state.selection;
  const chain = editor.chain().focus();
  // happy-dom / programmatic DOM selections may not map into PM; select all when empty
  // so toolbar actions still affect the visible prose (matches teacher expectation for
  // "format this block" when nothing is selected).
  if (empty) chain.selectAll();
  apply(chain);
  chain.run();
}

export function mountRichTextTiptap(options: {
  html: string;
  onHtml: (html: string) => void;
}): RichTextTiptapHandle {
  const host = document.createElement('div');
  host.className = 'block-editor__rich-host';

  let quiet = false;

  const publish = (html: string) => {
    options.onHtml(sanitizeRichTextHtml(html));
  };

  const editor = new Editor({
    element: host,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false
      })
    ],
    content: sanitizeRichTextHtml(options.html) || '<p></p>',
    parseOptions: { preserveWhitespace: 'full' },
    editorProps: {
      attributes: {
        class: 'block-editor__rich block-editor__rich-prose',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Rich text'
      }
    },
    onUpdate: ({ editor: next }) => {
      if (quiet) return;
      publish(next.getHTML());
    }
  });

  const surface = editor.view.dom as HTMLElement;

  // Native typing belongs to ProseMirror's DOM observer. Replacing the whole
  // document on each InputEvent resets the caret and discards trailing spaces.
  // Keep the generic Event bridge for programmatic DOM updates only.
  surface.addEventListener('input', (event) => {
    if (quiet || (typeof InputEvent !== 'undefined' && event instanceof InputEvent)) return;
    const html = sanitizeRichTextHtml(surface.innerHTML);
    quiet = true;
    editor.commands.setContent(html || '<p></p>', {
      emitUpdate: false,
      parseOptions: { preserveWhitespace: 'full' }
    });
    quiet = false;
    publish(html);
  });

  return {
    host,
    surface,
    editor,
    getHtml: () => sanitizeRichTextHtml(editor.getHTML()),
    setHtml: (html, emit = true) => {
      const clean = sanitizeRichTextHtml(html) || '<p></p>';
      quiet = true;
      editor.commands.setContent(clean, {
        emitUpdate: false,
        parseOptions: { preserveWhitespace: 'full' }
      });
      quiet = false;
      if (emit) publish(clean);
    },
    toggleBold: () => {
      runWithSelection(editor, (chain) => chain.toggleBold());
    },
    toggleItalic: () => {
      runWithSelection(editor, (chain) => chain.toggleItalic());
    },
    toggleBulletList: () => {
      runWithSelection(editor, (chain) => chain.toggleBulletList());
    },
    toggleOrderedList: () => {
      runWithSelection(editor, (chain) => chain.toggleOrderedList());
    },
    destroy: () => editor.destroy()
  };
}
