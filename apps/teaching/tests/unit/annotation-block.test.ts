import { describe, expect, it } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, NEW_BLOCK_TYPES, BLOCK_GROUPS } from '@/blocks/create-block';
import { blockRegistry } from '@/blocks/registry';
import { renderAnnotationBlock } from '@/blocks/render';
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
    const el = renderAnnotationBlock(dulceAnnotationFixture, 'student');
    const ids = [...el.querySelectorAll<HTMLElement>('[data-annotation-id]')].map(
      (node) => node.dataset.annotationId
    );
    expect(ids).not.toContain('ann_teacher');
    expect(ids).toContain('ann_word');
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

  it('editor mounts without prompt/confirm/alert', () => {
    const changes: unknown[] = [];
    const editor = createAnnotationEditor(dulceAnnotationFixture, (block) => {
      changes.push(block);
    });
    expect(editor.querySelector('.block-editor__annotation-source')).toBeTruthy();
    const source = editor.querySelector<HTMLTextAreaElement>(
      '.block-editor__annotation-source'
    )!;
    source.value = 'One line\n\nTwo stanza';
    source.dispatchEvent(new Event('input'));
    expect(changes.length).toBeGreaterThan(0);
  });
});
