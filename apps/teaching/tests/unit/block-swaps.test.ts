import { afterEach, describe, expect, it, vi } from 'vitest';
import { kitLabel, pickKitOption } from './kit-filter';
import { holdDelete } from './helpers/hub-list';
import { createBlock } from '@/blocks/create-block';
import {
  createCalloutEditor,
  createConceptMapEditor,
  createGalleryEditor,
  createImageEditor,
  createMindMapEditor,
  createQuoteEditor
} from '@/blocks/editors';
import { createSpacerEditor } from '@/blocks/layout-editors';
import { createDividerEditor } from '@/blocks/classroom-tools/editors';
import { BlockSchema, type Block } from '@/schemas/block';

afterEach(() => document.body.replaceChildren());

/** A page holding `block`, so a swap lands in `page` the way the lesson page does it. */
function pageWith(block: Block) {
  const page = { blocks: [block] as Block[] };
  const context = { getLessonBlocks: () => page.blocks, setLessonBlocks: (next: Block[]) => (page.blocks = next) };
  return { page, context };
}
const as = <T extends Block['block_type']>(block: Block, type: T) => {
  if (block.block_type !== type) throw new Error(`expected ${type}`);
  return block as Extract<Block, { block_type: T }>;
};
const mount = (el: HTMLElement) => {
  document.body.append(el);
  return el;
};

describe('Callout and Quote', () => {
  it('swaps a callout to a quote: body becomes the quote, title the attribution', () => {
    const callout = as(createBlock('callout', 'b1'), 'callout');
    callout.content = { style: 'information', title: 'Ada', body: 'Be curious.' };
    const { page, context } = pageWith(callout);
    const editor = mount(createCalloutEditor(callout, vi.fn(), () => callout, context));
    pickKitOption(editor.querySelector('.block-editor__callout-style'), 'quote');
    const next = BlockSchema.parse(page.blocks[0]);
    expect(next.block_type).toBe('quote');
    expect(as(next, 'quote').content).toEqual({ quote: 'Be curious.', attribution: 'Ada' });
    expect(next.id).toBe('b1');
  });

  it('swaps a quote to a callout style and keeps source out of the callout', () => {
    const quote = as(createBlock('quote', 'q1'), 'quote');
    quote.content = { quote: 'Be curious.', attribution: 'Ada', source: 'Letters' };
    const { page, context } = pageWith(quote);
    const editor = mount(createQuoteEditor(quote, vi.fn(), () => quote, context));
    expect(kitLabel(editor.querySelector('.block-editor__callout-style'))).toBe('Quote');
    pickKitOption(editor.querySelector('.block-editor__callout-style'), 'important');
    const next = BlockSchema.parse(page.blocks[0]);
    expect(as(next, 'callout').content).toEqual({ style: 'important', title: 'Ada', body: 'Be curious.' });
  });

  it('offers Teacher only on a block that already is a teacher callout', () => {
    const optionValues = (editor: HTMLElement) => {
      (editor.querySelector('.block-editor__callout-style') as HTMLButtonElement).click();
      const values = [...document.querySelectorAll<HTMLElement>('.hub-menu [data-hub-option]')].map((o) => o.dataset.hubOption);
      document.body.replaceChildren();
      return values;
    };
    const plain = as(createBlock('callout', 'c1'), 'callout');
    expect(optionValues(mount(createCalloutEditor(plain, vi.fn())))).not.toContain('teacher');
    const teacher = as(createBlock('callout', 'c2'), 'callout');
    teacher.content = { style: 'teacher', body: 'x' };
    expect(optionValues(mount(createCalloutEditor(teacher, vi.fn())))).toContain('teacher');
    const quote = as(createBlock('quote', 'q2'), 'quote');
    const values = optionValues(mount(createQuoteEditor(quote, vi.fn())));
    expect(values[0]).toBe('quote');
    expect(values).not.toContain('teacher');
  });
});

describe('Image and Gallery', () => {
  it('Add another image makes a grid gallery with this image and a blank slot', () => {
    const image = as(createBlock('image', 'i1'), 'image');
    image.variant = 'large';
    image.content = { url: 'https://example.com/a.png', alt_text: 'A', caption: 'Cap' };
    const { page, context } = pageWith(image);
    const editor = mount(createImageEditor(image, vi.fn(), () => image, context));
    (editor.querySelector('.block-editor__image-add-another') as HTMLButtonElement).click();
    const next = as(BlockSchema.parse(page.blocks[0]), 'gallery');
    expect(next.variant).toBe('large');
    expect(next.content.layout).toBe('grid');
    expect(next.content.items).toHaveLength(2);
    expect(next.content.items[0]).toMatchObject({ url: 'https://example.com/a.png', alt_text: 'A', caption: 'Cap' });
    expect(next.content.items[1]).toMatchObject({ url: '', alt_text: '' });
  });

  it('removing down to one image turns the gallery back into an image', () => {
    const gallery = as(createBlock('gallery', 'g1'), 'gallery');
    gallery.content = {
      layout: 'grid',
      items: [
        { id: 'a', url: 'https://example.com/a.png', alt_text: 'A' },
        { id: 'b', url: 'https://example.com/b.png', alt_text: 'B', caption: 'Bee' }
      ]
    };
    const { page, context } = pageWith(gallery);
    const editor = mount(createGalleryEditor(gallery, vi.fn(), () => gallery, context));
    // Delete the first image; the one left becomes the image block.
    holdDelete(editor.querySelectorAll('.hub-list__row .hub-list__more')[0]!);
    const next = as(BlockSchema.parse(page.blocks[0]), 'image');
    expect(next.id).toBe('g1');
    expect(next.content).toEqual({ url: 'https://example.com/b.png', alt_text: 'B', caption: 'Bee' });
  });
});

describe('Divider and Space', () => {
  it('Space on a divider makes a medium spacer', () => {
    const divider = as(createBlock('divider', 'd1'), 'divider');
    const { page, context } = pageWith(divider);
    const editor = mount(createDividerEditor(divider, vi.fn(), () => divider, context));
    pickKitOption(editor.querySelector('.block-editor__divider-kind'), 'space');
    expect(as(BlockSchema.parse(page.blocks[0]), 'spacer').content).toEqual({ size: 'medium' });
  });

  it('Line on a spacer makes a divider with tools on', () => {
    const spacer = as(createBlock('spacer', 's1'), 'spacer');
    const { page, context } = pageWith(spacer);
    const editor = mount(createSpacerEditor(spacer, vi.fn(), () => spacer, context));
    pickKitOption(editor.querySelector('.block-editor__spacer-kind'), 'line');
    expect(as(BlockSchema.parse(page.blocks[0]), 'divider').content).toEqual({ tools: true, timer_stack: [] });
  });
});

describe('Tree and Network', () => {
  const content = {
    title: 'Water',
    nodes: [
      { id: 'n1', label: 'Water', parent_id: null },
      { id: 'n2', label: 'Rain', parent_id: 'n1' }
    ],
    edges: []
  };

  it('Tree to Network keeps nodes and turns parent links into edges', () => {
    const map = as(createBlock('mind_map', 'm1'), 'mind_map');
    map.content = content;
    const { page, context } = pageWith(map);
    const editor = mount(createMindMapEditor(map, vi.fn(), () => map, context));
    pickKitOption(editor.querySelector('.block-editor__graph-shape'), 'network');
    const next = as(BlockSchema.parse(page.blocks[0]), 'concept_map');
    expect(next.content.nodes).toEqual(content.nodes);
    expect(next.content.edges).toEqual([{ id: 'n1_n2', from: 'n1', to: 'n2' }]);
  });

  it('Network to Tree keeps content and still draws as a tree', () => {
    const map = as(createBlock('concept_map', 'm2'), 'concept_map');
    map.content = {
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
      edges: [{ id: 'e1', from: 'a', to: 'b', label: 'leads to' }, { id: 'e2', from: 'c', to: 'b' }]
    };
    const { page, context } = pageWith(map);
    const editor = mount(createConceptMapEditor(map, vi.fn(), () => map, context));
    pickKitOption(editor.querySelector('.block-editor__graph-shape'), 'tree');
    const next = as(BlockSchema.parse(page.blocks[0]), 'mind_map');
    expect(next.content).toEqual(map.content);
    // The mind-map editor opens on it without throwing, with the Tree pill selected.
    const reopened = mount(createMindMapEditor(next, vi.fn(), () => next, context));
    expect(kitLabel(reopened.querySelector('.block-editor__graph-shape'))).toBe('Tree');
  });
});
