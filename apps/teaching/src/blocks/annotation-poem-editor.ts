/**
 * Rich-text editor for the annotation block's poem / passage.
 * One paragraph = one line; an empty paragraph = a stanza break. Inline marks
 * are bold / italic / underline; each line can be aligned and indented.
 */
import { Editor, Extension } from '@tiptap/core';
import { Fragment, Slice, type Node as PmNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import {
  annotationTextFromHtml,
  annotationTextToHtml
} from '@/blocks/annotation-text';
import type { AnnotationTextModel } from '@/blocks/annotation-anchor';
import { MAX_LINE_INDENT } from '@/blocks/annotation-line-format';
import type { AnnotationLineAlign } from '@/schemas/block';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    poemLine: {
      setLineAlign: (align: AnnotationLineAlign) => ReturnType;
      shiftLineIndent: (delta: 1 | -1) => ReturnType;
    };
  }
}

const PoemLine = Extension.create({
  name: 'poemLine',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (el) => {
              const raw = (el as HTMLElement).style.textAlign;
              return raw === 'center' || raw === 'right' ? raw : null;
            },
            renderHTML: (attrs) =>
              attrs.textAlign ? { style: `text-align: ${attrs.textAlign}` } : {}
          },
          indent: {
            default: 0,
            parseHTML: (el) => {
              const raw = Number(el.getAttribute('data-indent'));
              return Number.isFinite(raw) && raw > 0 ? Math.min(MAX_LINE_INDENT, raw) : 0;
            },
            renderHTML: (attrs) =>
              attrs.indent > 0 ? { 'data-indent': String(attrs.indent) } : {}
          }
        }
      }
    ];
  },
  addCommands() {
    return {
      setLineAlign:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', {
            textAlign: align === 'left' ? null : align
          }),
      shiftLineIndent:
        (delta) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let changed = false;
          state.doc.nodesBetween(from, to, (node: PmNode, pos: number) => {
            if (node.type.name !== 'paragraph') return true;
            const current = Number(node.attrs.indent) || 0;
            const next = Math.max(0, Math.min(MAX_LINE_INDENT, current + delta));
            if (next !== current) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
              changed = true;
            }
            return false;
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        }
    };
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.shiftLineIndent(1),
      'Shift-Tab': () => this.editor.commands.shiftLineIndent(-1)
    };
  }
});

/** Pasted HTML where each stanza is one `<p>` with `<br>` lines: keep the stanza gaps. */
export function splitBrParagraphs(html: string): string {
  if (!/<br\b/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out: string[] = [];
  for (const node of Array.from(doc.body.childNodes)) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      ['p', 'div'].includes((node as Element).tagName.toLowerCase()) &&
      (node as Element).querySelector('br')
    ) {
      const el = node as Element;
      const parts = el.innerHTML.split(/<br\s*\/?>/i);
      for (const part of parts) out.push(`<p>${part}</p>`);
      out.push('<p></p>');
      continue;
    }
    out.push(node.nodeType === Node.ELEMENT_NODE ? (node as Element).outerHTML : node.textContent ?? '');
  }
  return out.join('');
}

const LINES = (rows: Array<[number, number]>) =>
  `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">${rows
    .map(([x1, x2], i) => `<line x1="${x1}" x2="${x2}" y1="${4 + i * 4}" y2="${4 + i * 4}" />`)
    .join('')}</svg>`;

/** Static toolbar glyphs (no user data). */
const ICONS: Record<string, string> = {
  alignLeft: LINES([[3, 17], [3, 12], [3, 17], [3, 10]]),
  alignCenter: LINES([[3, 17], [6, 14], [3, 17], [7, 13]]),
  alignRight: LINES([[3, 17], [8, 17], [3, 17], [10, 17]]),
  outdent:
    '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><line x1="9" x2="17" y1="4" y2="4"/><line x1="9" x2="17" y1="8" y2="8"/><line x1="9" x2="17" y1="12" y2="12"/><line x1="3" x2="17" y1="16" y2="16"/><polyline points="6,6 3,8 6,10"/></svg>',
  indent:
    '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><line x1="9" x2="17" y1="4" y2="4"/><line x1="9" x2="17" y1="8" y2="8"/><line x1="9" x2="17" y1="12" y2="12"/><line x1="3" x2="17" y1="16" y2="16"/><polyline points="3,6 6,8 3,10"/></svg>'
};

type ToolbarButton = {
  el: HTMLButtonElement;
  isActive: () => boolean;
};

export type AnnotationPoemEditorHandle = {
  el: HTMLElement;
  editor: Editor;
  /** Current text parsed from the editor. */
  getText: () => AnnotationTextModel;
  setKind: (kind: 'verse' | 'prose') => void;
  focus: () => void;
  destroy: () => void;
};

export function mountAnnotationPoemEditor(options: {
  text: AnnotationTextModel;
  onText: (text: AnnotationTextModel) => void;
}): AnnotationPoemEditorHandle {
  let kind: 'verse' | 'prose' = options.text.kind;

  const el = document.createElement('div');
  el.className = 'block-editor__annotation-poem';

  const toolbar = document.createElement('div');
  toolbar.className = 'block-editor__annotation-poem-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text formatting');

  const surfaceHost = document.createElement('div');
  surfaceHost.className = 'block-editor__annotation-poem-host';

  const editor = new Editor({
    element: surfaceHost,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        link: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false
      }),
      PoemLine
    ],
    content: annotationTextToHtml(options.text),
    parseOptions: { preserveWhitespace: 'full' },
    editorProps: {
      attributes: {
        class: 'block-editor__annotation-poem-surface',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Poem or passage text',
        spellcheck: 'false'
      },
      transformPastedHTML: (html) => splitBrParagraphs(html),
      // Default text paste collapses blank lines; keep them as stanza breaks.
      clipboardTextParser: (text, _context, _plain, view) => {
        const schema = view.state.schema;
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        const nodes = lines.map((line) =>
          schema.nodes.paragraph!.create(null, line ? schema.text(line) : null)
        );
        return new Slice(Fragment.fromArray(nodes), 1, 1);
      }
    },
    onUpdate: () => {
      options.onText(getText());
      syncToolbar();
    },
    onSelectionUpdate: () => syncToolbar()
  });

  function getText(): AnnotationTextModel {
    return annotationTextFromHtml(editor.getHTML(), kind);
  }

  function paragraphAttr(name: 'textAlign' | 'indent'): unknown {
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name === 'paragraph') return node.attrs[name];
    }
    return null;
  }

  const buttons: ToolbarButton[] = [];

  function addButton(
    label: string,
    title: string,
    run: () => void,
    isActive: () => boolean = () => false,
    className = ''
  ): void {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `block-editor__annotation-poem-btn ${className}`.trim();
    if (ICONS[label]) btn.innerHTML = ICONS[label]!;
    else btn.textContent = label;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('aria-pressed', 'false');
    // Keep the editor selection while clicking the toolbar.
    btn.addEventListener('mousedown', (event) => event.preventDefault());
    btn.addEventListener('click', () => {
      run();
      syncToolbar();
    });
    toolbar.append(btn);
    buttons.push({ el: btn, isActive });
  }

  function addDivider(): void {
    const sep = document.createElement('span');
    sep.className = 'block-editor__annotation-poem-sep';
    sep.setAttribute('aria-hidden', 'true');
    toolbar.append(sep);
  }

  addButton('B', 'Bold', () => editor.chain().focus().toggleBold().run(), () => editor.isActive('bold'), 'is-bold');
  addButton('I', 'Italic', () => editor.chain().focus().toggleItalic().run(), () => editor.isActive('italic'), 'is-italic');
  addButton('U', 'Underline', () => editor.chain().focus().toggleUnderline().run(), () => editor.isActive('underline'), 'is-underline');
  addDivider();
  addButton('alignLeft', 'Align left', () => editor.chain().focus().setLineAlign('left').run(), () => !paragraphAttr('textAlign'));
  addButton('alignCenter', 'Align centre', () => editor.chain().focus().setLineAlign('center').run(), () => paragraphAttr('textAlign') === 'center');
  addButton('alignRight', 'Align right', () => editor.chain().focus().setLineAlign('right').run(), () => paragraphAttr('textAlign') === 'right');
  addDivider();
  addButton('outdent', 'Outdent line (Shift+Tab)', () => editor.chain().focus().shiftLineIndent(-1).run());
  addButton('indent', 'Indent line (Tab)', () => editor.chain().focus().shiftLineIndent(1).run());
  addDivider();
  addButton('↶', 'Undo', () => editor.chain().focus().undo().run());
  addButton('↷', 'Redo', () => editor.chain().focus().redo().run());

  function syncToolbar(): void {
    for (const btn of buttons) {
      const active = btn.isActive();
      btn.el.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.el.classList.toggle('is-active', active);
    }
  }

  const help = document.createElement('p');
  help.className = 'block-editor__hint block-editor__annotation-poem-help';

  function paintHelp(): void {
    help.textContent =
      kind === 'prose'
        ? 'Enter starts a new paragraph. Select words to bold, italicise or underline them.'
        : 'Enter starts a new line. Leave an empty line for a stanza break. Tab indents a line.';
  }
  paintHelp();

  el.append(toolbar, surfaceHost, help);
  syncToolbar();

  return {
    el,
    editor,
    getText,
    setKind: (next) => {
      kind = next;
      paintHelp();
      options.onText(getText());
    },
    focus: () => {
      editor.commands.focus('end');
    },
    destroy: () => editor.destroy()
  };
}
