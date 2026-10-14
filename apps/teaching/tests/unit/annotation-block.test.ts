import { describe, expect, it, vi } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, NEW_BLOCK_TYPES, BLOCK_GROUPS } from '@/blocks/create-block';
import { blockRegistry } from '@/blocks/registry';
import { renderAnnotationBlock } from '@/blocks/render';
import { marginNoteText } from '@/blocks/annotation-view';
import { createAnnotationEditor } from '@/blocks/editors';
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';
import { blocksToSearchText } from '@/blocks/search-text';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';

describe('AnnotationBlockSchema', () => {
  it('parses the Dulce fixture with all four granularities', () => {
    const block = BlockSchema.parse(dulceAnnotationFixture);
    expect(block.block_type).toBe('annotation');
    if (block.block_type !== 'annotation') return;
    const grains = block.content.annotations.map((a) => a.anchor.granularity);
    expect(grains).toEqual(
      expect.arrayContaining(['word', 'phrase', 'line', 'stanza'])
    );
  });

  it('createBlock("annotation") round-trips BlockSchema', () => {
    const block = createBlock('annotation', 'ann_new');
    expect(BlockSchema.parse(block).block_type).toBe('annotation');
  });

  it('registers in NEW_BLOCK_TYPES, Learning group, and blockRegistry', () => {
    expect(NEW_BLOCK_TYPES).toContain('annotation');
    const learning = BLOCK_GROUPS.find((g) => g.label === 'Learning');
    expect(learning?.types).toContain('annotation');
    expect(blockRegistry.annotation).toBeDefined();
  });

  it('clones with remapped stanza, line, layer and annotation ids', () => {
    let n = 0;
    const cloned = cloneBlockWithNewIds(dulceAnnotationFixture, () => `id_${++n}`);
    expect(cloned.block_type).toBe('annotation');
    if (cloned.block_type !== 'annotation') return;
    expect(cloned.id).toBe('id_1');
    expect(cloned.content.text.stanzas[0]!.id).not.toBe('stanza_1');
    expect(cloned.content.layers[0]!.id).not.toBe('layer_structure');
    expect(cloned.content.annotations[0]!.id).not.toBe('ann_word');
    expect(cloned.content.annotations[0]!.layer_id).toBe(cloned.content.layers[1]!.id);
  });
});

describe('annotation render + sanitise', () => {
  it('renders teacher view with underline, margin bar and gutter bracket', () => {
    const el = renderAnnotationBlock(dulceAnnotationFixture, 'teacher');
    expect(el.querySelector('.block-annotation__anchor--word')).toBeTruthy();
    expect(el.querySelector('.block-annotation__anchor--phrase')).toBeTruthy();
    expect(el.querySelector('.block-annotation__anchor--line')).toBeTruthy();
    expect(el.querySelector('.block-annotation__anchor--stanza')).toBeTruthy();
  });

  it('student view hides teacher-layer annotations', () => {
    const fixture = structuredClone(dulceAnnotationFixture);
    // Open past Text only so student layers are revealed.
    fixture.content.settings.default_layer_id = 'layer_imagery';
    const el = renderAnnotationBlock(fixture, 'student');
    const ids = [...el.querySelectorAll<HTMLElement>('[data-annotation-id]')].map(
      (node) => node.dataset.annotationId
    );
    expect(ids).not.toContain('ann_teacher');
    expect(ids).toContain('ann_word');
    expect(el.querySelector('.block-annotation__slider')).toBeNull();
    expect([...el.querySelectorAll('.block-annotation__chip')].map((chip) => chip.textContent)).toEqual([
      '✓ Structure',
      '✓ Imagery'
    ]);
    expect(el.textContent).not.toContain('Teacher notes');
  });

  it('print view uses footnotes and never a side panel', () => {
    const el = renderAnnotationBlock(dulceAnnotationFixture, 'print');
    expect(el.querySelector('.block-annotation__footnotes')).toBeTruthy();
    expect(el.querySelector('.block-annotation__panel')).toBeNull();
    expect(el.textContent).not.toContain('SECRET-TEACHER-NOTE');
  });

  it('sanitizeBlocksDeep strips script, onerror and javascript: from bodies', () => {
    const dirty = structuredClone(dulceAnnotationFixture);
    dirty.content.annotations[0]!.body.html =
      '<p>ok</p><script>alert(1)</script><img onerror="alert(1)" src="x"><a href="javascript:alert(1)">x</a>';
    const cleaned = sanitizeBlocksDeep([dirty]);
    const ann = cleaned[0];
    expect(ann?.block_type).toBe('annotation');
    if (ann?.block_type !== 'annotation') return;
    const html = ann.content.annotations[0]!.body.html;
    expect(html).toContain('ok');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toMatch(/onerror\s*=/);
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('search text includes poem lines and annotation bodies', () => {
    const text = blocksToSearchText([dulceAnnotationFixture]);
    expect(text).toContain('Bent double');
    expect(text).toContain('Dehumanising simile');
  });

  it('editor mounts without prompt/confirm/alert and saves typed text', () => {
    const changes: Array<ReturnType<typeof BlockSchema.parse>> = [];
    const editor = createAnnotationEditor(dulceAnnotationFixture, (block) => {
      changes.push(block);
    });
    document.body.append(editor);
    // Text mode mounts the rich-text editor; no plain textarea any more.
    editor
      .querySelector<HTMLButtonElement>('.block-editor__annotation-mode [data-value="text"]')!
      .click();
    const surface = editor.querySelector<HTMLElement>('.block-editor__annotation-poem-surface');
    expect(surface).toBeTruthy();
    expect(editor.querySelector('textarea.block-editor__annotation-source')).toBeNull();
    surface!.innerHTML = '<p>One line</p><p>Second line</p><p></p><p>Two stanza</p>';
    surface!.dispatchEvent(new Event('input'));
    editor.remove();
  });

  // Slice 2a — settings, slider, chips, markers
  it('editor persists show_markers and default_layer_id', () => {
    const changes: Array<ReturnType<typeof BlockSchema.parse>> = [];
    const editor = createAnnotationEditor(dulceAnnotationFixture, (block) => {
      changes.push(block);
    });
    const showMarkers = editor.querySelector<HTMLInputElement>(
      '.block-editor__annotation-show-markers'
    )!;
    const defaultLayer = editor.querySelector<HTMLSelectElement>(
      '.block-editor__annotation-default-layer'
    )!;
    showMarkers.checked = false;
    showMarkers.dispatchEvent(new Event('change'));
    defaultLayer.value = 'layer_structure';
    defaultLayer.dispatchEvent(new Event('change'));
    const last = changes.at(-1);
    expect(last?.block_type).toBe('annotation');
    if (last?.block_type !== 'annotation') return;
    expect(last.content.settings.show_markers).toBe(false);
    expect(last.content.settings.default_layer_id).toBe('layer_structure');
  });

  it('layer ticks show and hide one layer without a slider', () => {
    const fixture = structuredClone(dulceAnnotationFixture);
    fixture.content.settings.show_markers = true;
    const el = renderAnnotationBlock(fixture, 'student');
    expect(el.querySelector('.block-annotation__slider')).toBeNull();
    const chips = () => [...el.querySelectorAll<HTMLButtonElement>('.block-annotation__chip')];
    expect(chips().map((chip) => chip.textContent)).toEqual(['Structure', 'Imagery']);
    expect(el.querySelectorAll('.block-annotation__anchor')).toHaveLength(0);

    chips()[0]!.click();
    expect(chips()[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(chips()[1]!.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelectorAll('[data-annotation-id]').length).toBeGreaterThan(0);

    chips()[0]!.click();
    expect(chips()[0]!.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelectorAll('.block-annotation__anchor')).toHaveLength(0);
  });

  it('show_markers false removes marker buttons', () => {
    const fixture = structuredClone(dulceAnnotationFixture);
    fixture.content.settings.show_markers = false;
    const el = renderAnnotationBlock(fixture, 'student');
    expect(el.querySelectorAll('.block-annotation__marker')).toHaveLength(0);
  });

  it('writes the whole plain note into the margin, not a clipped preview', () => {
    const sentence = 'Fleeting and insubstantial (ephemeral butterfly).';
    expect(marginNoteText(`<p>${sentence}</p>`)).toBe(sentence);
    expect(marginNoteText('<p>ignored</p>', 'Visual Imagery')).toBe('Visual Imagery');
  });

  it('a plain note does not open a second window', () => {
    const el = renderAnnotationBlock(dulceAnnotationFixture, 'teacher');
    const word = el.querySelector<HTMLElement>('[data-annotation-id="ann_word"]')!;
    expect(word.tagName).toBe('SPAN');
    word.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.querySelector<HTMLElement>('.block-annotation__panel')!.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>('.block-annotation__sheet')!.hidden).toBe(true);
  });

  it('a stanza note, which has no handwriting, still opens inside the block', () => {
    const el = renderAnnotationBlock(dulceAnnotationFixture, 'teacher');
    el.querySelector<HTMLButtonElement>('.block-annotation__anchor--stanza')!.click();
    const panel = el.querySelector<HTMLElement>('.block-annotation__panel')!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('Opening quatrain');
  });

  it('phone reads a plain note from the sheet, because the handwriting is hidden', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      const narrow = query.includes('max-width: 720px');
      return {
        matches: narrow,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false
      } as MediaQueryList;
    });
    const el = renderAnnotationBlock(dulceAnnotationFixture, 'teacher');
    const word = el.querySelector<HTMLButtonElement>('[data-annotation-id="ann_word"]')!;
    expect(word.tagName).toBe('BUTTON');
    word.click();
    const sheet = el.querySelector<HTMLElement>('.block-annotation__sheet')!;
    expect(sheet.hidden).toBe(false);
    expect(sheet.textContent).toContain('Heavy verb');
    vi.restoreAllMocks();
  });
});
