import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import { buildAnchor } from '@/blocks/annotation-anchor';
import {
  lineRuns,
  renderFormattedLine,
  sanitizeAnnotationLineHtml
} from '@/blocks/annotation-line-format';
import {
  annotationTextFromHtml,
  annotationTextToHtml
} from '@/blocks/annotation-text';
import { renderElementCard } from '@/blocks/annotation-view';
import { createBlock } from '@/blocks/create-block';
import { createAnnotationEditor } from '@/blocks/editors';
import { loadLiteraryElements } from '@/blocks/literary-elements';
import { renderAnnotationBlock } from '@/blocks/render';
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';
import { BlockSchema, type Block } from '@/schemas/block';

type AnnotationBlock = Extract<Block, { block_type: 'annotation' }>;

const stamp = '2026-10-14T00:00:00.000Z';

function butterflies(): AnnotationBlock {
  const block = createBlock('annotation', 'block_butterflies') as AnnotationBlock;
  block.content.title = 'A Remedy for Butterflies';
  block.content.text = annotationTextFromHtml(
    '<p>The <em>wings</em> come first,</p>' +
      '<p data-indent="2">then the <strong>hush</strong>.</p>' +
      '<p></p>' +
      '<p style="text-align: center">Breathe.</p>'
  );
  return block;
}

function mountEditor(start: AnnotationBlock) {
  let latest: AnnotationBlock = start;
  const changes: AnnotationBlock[] = [];
  const el = createAnnotationEditor(
    start,
    (next) => {
      latest = next as AnnotationBlock;
      changes.push(latest);
    },
    () => latest
  );
  document.body.append(el);
  return { el, changes, latest: () => latest };
}

function poemEditorOf(root: HTMLElement): Editor {
  const surface = root.querySelector<HTMLElement>('.block-editor__annotation-poem-surface');
  expect(surface).toBeTruthy();
  // Tiptap hangs the editor instance off its contenteditable.
  return (surface as HTMLElement & { editor: Editor }).editor;
}

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe('poem text model', () => {
  it('Enter makes a new line and an empty line makes a stanza break', () => {
    const text = annotationTextFromHtml(
      '<p>Line one</p><p>Line two</p><p></p><p>Line three</p>'
    );
    expect(text.stanzas).toHaveLength(2);
    expect(text.stanzas[0]!.lines.map((l) => l.text)).toEqual(['Line one', 'Line two']);
    expect(text.stanzas[1]!.lines.map((l) => l.text)).toEqual(['Line three']);
  });

  it('splits <br> lines and keeps marks across the split', () => {
    const text = annotationTextFromHtml('<p><em>soft<br>wings</em> rise</p>');
    const lines = text.stanzas[0]!.lines;
    expect(lines.map((l) => l.text)).toEqual(['soft', 'wings rise']);
    expect(lines[0]!.html).toBe('<em>soft</em>');
    expect(lines[1]!.html).toBe('<em>wings</em> rise');
  });

  it('keeps bold, italic, underline, alignment and indent through a round trip', () => {
    const text = butterflies().content.text;
    const [first, second] = text.stanzas[0]!.lines;
    expect(first!.text).toBe('The wings come first,');
    expect(first!.html).toBe('The <em>wings</em> come first,');
    expect(second!.indent).toBe(2);
    expect(second!.html).toContain('<strong>hush</strong>');
    expect(text.stanzas[1]!.lines[0]!.align).toBe('center');

    const again = annotationTextFromHtml(annotationTextToHtml(text));
    expect(again).toEqual(text);
    expect(BlockSchema.parse({ ...butterflies(), content: { ...butterflies().content, text } }))
      .toBeTruthy();
  });

  it('prose: each paragraph is one stanza', () => {
    const text = annotationTextFromHtml('<p>First para.</p><p>Second <u>para</u>.</p>', 'prose');
    expect(text.kind).toBe('prose');
    expect(text.stanzas).toHaveLength(2);
    expect(text.stanzas[1]!.lines[0]!.html).toBe('Second <u>para</u>.');
  });

  it('anchors index plain text even when the line is formatted', () => {
    const text = butterflies().content.text;
    const line = text.stanzas[0]!.lines[0]!;
    const start = line.text.indexOf('wings');
    const anchor = buildAnchor(text, {
      stanzaId: text.stanzas[0]!.id,
      lineId: line.id,
      start,
      end: start + 5
    });
    expect(anchor?.quote.exact).toBe('wings');
  });
});

describe('formatted line rendering', () => {
  it('ignores stale html that no longer spells the line text', () => {
    expect(lineRuns({ text: 'new words', html: '<em>old</em>' })).toEqual([{ text: 'new words' }]);
  });

  it('wraps a span that crosses a formatting boundary without losing marks', () => {
    const frag = renderFormattedLine({ text: 'The wings come', html: 'The <em>wings</em> come' }, [
      {
        start: 4,
        end: 14,
        wrap: () => {
          const b = document.createElement('button');
          b.className = 'hit';
          return b;
        }
      }
    ]);
    const host = document.createElement('p');
    host.append(frag);
    expect(host.textContent).toBe('The wings come');
    const hit = host.querySelector('.hit')!;
    expect(hit.textContent).toBe('wings come');
    expect(hit.querySelector('em')?.textContent).toBe('wings');
  });

  it('sanitises line html down to strong / em / u', () => {
    expect(
      sanitizeAnnotationLineHtml('<em onclick="x()">a</em><script>bad()</script><a href="javascript:x">b</a>')
    ).toBe('<em>a</em>b');
    const block = butterflies();
    block.content.text.stanzas[0]!.lines[0]!.html = 'The <img src=x onerror=alert(1)><em>wings</em> come first,';
    const [clean] = sanitizeBlocksDeep([block]) as AnnotationBlock[];
    expect(clean!.content.text.stanzas[0]!.lines[0]!.html).toBe('The <em>wings</em> come first,');
  });
});

describe('annotation editor: text and annotate', () => {
  it('Enter in the text editor saves a new line (not stripped)', () => {
    const start = createBlock('annotation', 'block_new') as AnnotationBlock;
    const { el, latest } = mountEditor(start);
    // Empty block opens on the Text tab with the rich editor.
    const editor = poemEditorOf(el);
    editor.commands.insertContent('Line one');
    editor.commands.splitBlock();
    editor.commands.insertContent('Line two');
    expect(latest().content.text.stanzas[0]!.lines.map((l) => l.text)).toEqual([
      'Line one',
      'Line two'
    ]);
    editor.commands.splitBlock();
    editor.commands.splitBlock();
    editor.commands.insertContent('Stanza two');
    expect(latest().content.text.stanzas).toHaveLength(2);
  });

  it('the toolbar offers bold, italic, underline, alignment and indent', () => {
    const { el } = mountEditor(createBlock('annotation', 'block_tb') as AnnotationBlock);
    const labels = [
      ...el.querySelectorAll<HTMLButtonElement>('.block-editor__annotation-poem-btn')
    ].map((b) => b.getAttribute('aria-label'));
    for (const want of ['Bold', 'Italic', 'Underline', 'Align left', 'Align centre', 'Align right']) {
      expect(labels).toContain(want);
    }
    expect(labels.some((l) => l?.startsWith('Indent'))).toBe(true);
  });

  it('+ Add note in the notes list never drops a placeholder note on the title', () => {
    const { el, latest } = mountEditor(butterflies());
    const add = el.querySelector<HTMLButtonElement>(
      '.block-editor__annotation-ann-list .hub-list__add'
    );
    expect(add).toBeTruthy();
    add!.click();
    add!.click();
    add!.click();
    expect(latest().content.annotations).toHaveLength(0);
    expect(el.querySelector('.block-editor__annotation-place')?.textContent).toMatch(/Highlight words/);
  });

  it('highlighting words offers Add note, and only that click creates the note', () => {
    const { el, latest } = mountEditor(butterflies());
    const lineEl = el.querySelector<HTMLElement>('.block-editor__annotation-line-text')!;
    // Formatted line: "The " + <em>wings</em> + " come first,"
    const em = lineEl.querySelector('em')!;
    const range = document.createRange();
    range.setStart(em.firstChild!, 0);
    range.setEnd(em.firstChild!, 5);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    lineEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    const addNote = el.querySelector<HTMLButtonElement>('.block-editor__annotation-add-note')!;
    expect(addNote.hidden).toBe(false);
    expect(latest().content.annotations).toHaveLength(0);
    addNote.click();
    const notes = latest().content.annotations;
    expect(notes).toHaveLength(1);
    expect(notes[0]!.anchor.quote.exact).toBe('wings');
    expect(el.querySelector('.block-editor__annotation-note-quote')?.textContent).toBe('wings');
    // The note now shows as a highlight on the text.
    expect(el.querySelector('.block-editor__annotation-hl')?.textContent).toBe('wings');
  });

  it('shows the tagged technique as a Periodic Table card, not its id', async () => {
    const block = butterflies();
    const line = block.content.text.stanzas[0]!.lines[0]!;
    const anchor = buildAnchor(block.content.text, {
      stanzaId: block.content.text.stanzas[0]!.id,
      lineId: line.id,
      start: 4,
      end: 9
    })!;
    block.content.layers = [{ id: 'layer_notes', name: 'Notes', kind: 'free', colour: 'wave' }];
    block.content.annotations = [
      {
        id: 'ann_1',
        layer_id: 'layer_notes',
        anchor,
        technique: { id: 'visual-imagery', table_version: 'test' },
        body: { html: '<p>Fragile</p>', attachments: [] },
        created_at: stamp,
        updated_at: stamp
      }
    ];
    const { el } = mountEditor(block);
    el.querySelector<HTMLButtonElement>('.block-editor__annotation-open')!.click();
    await loadLiteraryElements();
    await Promise.resolve();
    const card = el.querySelector<HTMLElement>('.block-editor__annotation-technique-card .block-annotation__element');
    expect(card).toBeTruthy();
    expect(card!.querySelector('.block-annotation__element-symbol')?.textContent).toBe('Vi');
    expect(card!.querySelector('.block-annotation__element-name')?.textContent).toBe('Visual Imagery');
    expect(el.querySelector('.block-editor__annotation-technique-btn')?.textContent).not.toMatch(/visual-imagery/);
  });
});

describe('annotation view', () => {
  function withOneLayerOfNotes(): AnnotationBlock {
    const block = butterflies();
    block.content.layers = [{ id: 'layer_notes', name: 'Notes', kind: 'free', colour: 'wave', symbol: 'N' }];
    const text = block.content.text;
    const line = text.stanzas[0]!.lines[0]!;
    block.content.annotations = ['The', 'wings', 'first'].map((word, i) => {
      const start = line.text.indexOf(word);
      return {
        id: `ann_${i}`,
        layer_id: 'layer_notes',
        anchor: buildAnchor(text, {
          stanzaId: text.stanzas[0]!.id,
          lineId: line.id,
          start,
          end: start + word.length
        })!,
        body: { html: `<p>Note ${i}</p>`, attachments: [] },
        created_at: stamp,
        updated_at: stamp
      };
    });
    return block;
  }

  it('one layer: a tick shows and hides the notes', () => {
    const el = renderAnnotationBlock(withOneLayerOfNotes(), 'teacher');
    const chip = () => el.querySelector<HTMLButtonElement>('.block-annotation__chip')!;
    expect(chip().textContent).toBe('✓ Notes');
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.block-annotation__slider')).toBeNull();
    expect(el.querySelectorAll('.block-annotation__anchor')).toHaveLength(3);

    chip().click();
    expect(chip().textContent).toBe('Notes');
    expect(chip().getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelectorAll('.block-annotation__anchor')).toHaveLength(0);
    const markers = [...el.querySelectorAll('.block-annotation__marker')];
    expect(markers.every((m) => m.textContent === '')).toBe(true);
  });

  it('renders formatting, indent and alignment for students', () => {
    const el = renderAnnotationBlock(withOneLayerOfNotes(), 'student');
    const lines = [...el.querySelectorAll<HTMLElement>('.block-annotation__line-text')];
    expect(lines[0]!.querySelector('em')?.textContent).toBe('wings');
    expect(lines[1]!.dataset.indent).toBe('2');
    expect(lines[2]!.style.textAlign).toBe('center');
  });

  it('the technique card has the Periodic Table sections', async () => {
    const table = await loadLiteraryElements();
    const tech = table.techniques.find((t) => t.id === 'visual-imagery')!;
    const card = renderElementCard(tech, table);
    expect(card.style.getPropertyValue('--c')).toBeTruthy();
    expect([...card.querySelectorAll('h4')].map((h) => h.textContent)).toEqual([
      'Definition',
      'Effect',
      'Example'
    ]);
    expect(card.querySelector('.block-annotation__element-chip--family')?.textContent).toBe('Descriptive');
    expect(card.querySelector('.block-annotation__element-chip:not(.block-annotation__element-chip--family)')?.textContent).toBe('Imagery');
  });

  it('the block fills the column (no fixed max-width, L1)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
    const rule = css.slice(css.indexOf('.block-annotation {'), css.indexOf('}', css.indexOf('.block-annotation {')));
    expect(rule).not.toMatch(/max-width/);
  });
});
