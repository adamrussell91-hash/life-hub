import { describe, it, expect } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, COLUMN_CHILD_TYPES, TAB_CHILD_TYPES } from '@/blocks/create-block';
import { createGalleryEditor, renderGalleryBlock } from '@/blocks/registry';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'large' as const,
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

function item(id: string, overrides: Partial<{ url: string; alt_text: string; caption: string }> = {}) {
  return {
    id,
    url: overrides.url ?? '',
    alt_text: overrides.alt_text ?? '',
    ...(overrides.caption !== undefined ? { caption: overrides.caption } : {})
  };
}

describe('GalleryBlockSchema', () => {
  it('parses gallery with grid layout and items', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'gallery',
      content: {
        layout: 'grid',
        items: [
          item('i1', {
            url: 'https://example.com/a.png',
            alt_text: 'A',
            caption: 'Caption A'
          }),
          item('i2', { url: 'https://example.com/b.png', alt_text: 'B' })
        ]
      }
    });
    expect(block.block_type).toBe('gallery');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    expect(block.content.layout).toBe('grid');
    expect(block.content.items).toHaveLength(2);
  });

  it('rejects fewer than 2 items', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'gallery',
        content: { layout: 'grid', items: [item('i1')] }
      })
    ).toThrow();
  });

  it('rejects more than 12 items', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'gallery',
        content: {
          layout: 'carousel',
          items: Array.from({ length: 13 }, (_, i) => item(`i${i}`))
        }
      })
    ).toThrow();
  });

  it('rejects comparison with not exactly 2 items', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'gallery',
        content: {
          layout: 'comparison',
          items: [item('i1'), item('i2'), item('i3')]
        }
      })
    ).toThrow();
  });

  it('allows gallery inside columns, section, and tabs', () => {
    const gallery = {
      ...baseBlock,
      id: 'g1',
      block_type: 'gallery' as const,
      content: { layout: 'grid' as const, items: [item('a'), item('b')] }
    };

    const columns = BlockSchema.parse({
      ...baseBlock,
      id: 'cols',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          { width: 6, blocks: [gallery] },
          { width: 6, blocks: [] }
        ]
      }
    });
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    expect(columns.content.columns[0]!.blocks[0]!.block_type).toBe('gallery');

    const section = BlockSchema.parse({
      ...baseBlock,
      id: 'sec',
      block_type: 'section',
      content: { title: 'Media', blocks: [gallery] }
    });
    if (section.block_type !== 'section') throw new Error('expected section');
    expect(section.content.blocks[0]!.block_type).toBe('gallery');

    const tabs = BlockSchema.parse({
      ...baseBlock,
      id: 'tabs',
      block_type: 'tabs',
      content: {
        tabs: [
          { id: 't1', label: 'One', blocks: [gallery] },
          { id: 't2', label: 'Two', blocks: [] }
        ]
      }
    });
    if (tabs.block_type !== 'tabs') throw new Error('expected tabs');
    expect(tabs.content.tabs[0]!.blocks[0]!.block_type).toBe('gallery');
  });
});

describe('createBlock gallery', () => {
  it('creates 3 empty items with grid layout', () => {
    const block = createBlock('gallery', 'g1');
    expect(block.block_type).toBe('gallery');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    expect(block.content.layout).toBe('grid');
    expect(block.content.items).toHaveLength(3);
    expect(block.content.items.map((i) => i.id)).toEqual(['g1_i1', 'g1_i2', 'g1_i3']);
    expect(block.variant).toBe('large');
  });

  it('COLUMN_CHILD_TYPES and TAB_CHILD_TYPES include gallery', () => {
    expect(COLUMN_CHILD_TYPES.includes('gallery')).toBe(true);
    expect(TAB_CHILD_TYPES.includes('gallery')).toBe(true);
  });

  it('clone regenerates item ids', () => {
    const block = createBlock('gallery', 'g1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    block.content.items[0]!.alt_text = 'A';
    let n = 0;
    const cloned = cloneBlockWithNewIds(block, () => `id_${++n}`);
    expect(cloned.id).toBe('id_1');
    if (cloned.block_type !== 'gallery') throw new Error('expected gallery');
    expect(cloned.content.items.map((i) => i.id)).toEqual(['id_2', 'id_3', 'id_4']);
    expect(cloned.content.items[0]!.alt_text).toBe('A');
  });
});

describe('createGalleryEditor', () => {
  it('renders layout select and item fields; add disabled at 12', () => {
    const block = createBlock('gallery', 'g1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    const changes: unknown[] = [];
    const el = createGalleryEditor(block, (next) => changes.push(next));

    const layout = el.querySelector('.block-editor__gallery-layout') as HTMLSelectElement;
    expect(layout.value).toBe('grid');

    const rows = el.querySelectorAll('.block-editor__gallery-item');
    expect(rows.length).toBe(3);

    const add = el.querySelector('.block-editor__gallery-add') as HTMLButtonElement;
    expect(add.disabled).toBe(false);

    // Fill to 12 via repeated add
    for (let i = 0; i < 9; i++) add.click();
    expect(el.querySelectorAll('.block-editor__gallery-item').length).toBe(12);
    expect(add.disabled).toBe(true);
  });

  it('switching to comparison keeps first 2 items', () => {
    const block = createBlock('gallery', 'g1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    let latest = block;
    const el = createGalleryEditor(block, (next) => {
      latest = next;
    });

    const layout = el.querySelector('.block-editor__gallery-layout') as HTMLSelectElement;
    layout.value = 'comparison';
    layout.dispatchEvent(new Event('change'));

    expect(latest.content.layout).toBe('comparison');
    expect(latest.content.items).toHaveLength(2);
    expect(latest.content.items.map((i) => i.id)).toEqual(['g1_i1', 'g1_i2']);
    expect(el.querySelector('.block-editor__gallery-add')).toBeNull();
  });

  it('remove disabled at 2 for grid', () => {
    const block = createBlock('gallery', 'g1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    let latest = block;
    const el = createGalleryEditor(block, (next) => {
      latest = next;
    });

    const removes = () =>
      el.querySelectorAll('.block-editor__gallery-remove') as NodeListOf<HTMLButtonElement>;

    removes()[0]!.click();
    expect(latest.content.items).toHaveLength(2);
    expect([...removes()].every((b) => b.disabled)).toBe(true);
  });
});

function sampleGallery(
  layout: 'grid' | 'carousel' | 'comparison',
  count = 2
): Extract<Block, { block_type: 'gallery' }> {
  return {
    ...baseBlock,
    id: 'g1',
    block_type: 'gallery',
    content: {
      layout,
      items: Array.from({ length: count }, (_, i) =>
        item(`i${i + 1}`, {
          url: `https://example.com/${i + 1}.png`,
          alt_text: `Image ${i + 1}`,
          caption: `Cap ${i + 1}`
        })
      )
    }
  };
}

describe('renderGalleryBlock', () => {
  it('renders grid figures', () => {
    const el = renderGalleryBlock(sampleGallery('grid', 3), 'student');
    expect(el.querySelector('.block-gallery--grid')).toBeTruthy();
    expect(el.querySelectorAll('.block-gallery__item').length).toBe(3);
    expect(el.querySelectorAll('img').length).toBe(3);
  });

  it('carousel next advances the active slide', () => {
    const el = renderGalleryBlock(sampleGallery('carousel', 3), 'student');
    const status = el.querySelector('.block-gallery__status') as HTMLElement;
    expect(status.textContent).toMatch(/1\s*\/\s*3/);
    (el.querySelector('.block-gallery__next') as HTMLButtonElement).click();
    expect(status.textContent).toMatch(/2\s*\/\s*3/);
  });

  it('comparison renders two items', () => {
    const el = renderGalleryBlock(sampleGallery('comparison', 2), 'student');
    expect(el.querySelector('.block-gallery--comparison')).toBeTruthy();
    expect(el.querySelectorAll('.block-gallery__item').length).toBe(2);
  });

  it('opens and closes lightbox', () => {
    const el = renderGalleryBlock(sampleGallery('grid', 2), 'student');
    const imgBtn = el.querySelector('.block-gallery__open') as HTMLButtonElement;
    imgBtn.click();
    const dialog = document.body.querySelector('.block-gallery-lightbox') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('role')).toBe('dialog');
    (dialog.querySelector('.block-gallery-lightbox__close') as HTMLButtonElement).click();
    expect(document.body.querySelector('.block-gallery-lightbox')).toBeNull();
  });

  it('Escape closes lightbox', () => {
    const el = renderGalleryBlock(sampleGallery('grid', 2), 'student');
    (el.querySelector('.block-gallery__open') as HTMLButtonElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.querySelector('.block-gallery-lightbox')).toBeNull();
  });

  it('replacing lightbox cleans up the previous escape handler', () => {
    const el = renderGalleryBlock(sampleGallery('grid', 2), 'student');
    const buttons = el.querySelectorAll('.block-gallery__open') as NodeListOf<HTMLButtonElement>;

    buttons[0]!.click();
    expect(document.body.querySelectorAll('.block-gallery-lightbox')).toHaveLength(1);

    buttons[1]!.click();
    expect(document.body.querySelectorAll('.block-gallery-lightbox')).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.querySelector('.block-gallery-lightbox')).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.querySelector('.block-gallery-lightbox')).toBeNull();
  });

  it('closing lightbox restores focus to the open button', () => {
    const el = renderGalleryBlock(sampleGallery('grid', 2), 'student');
    document.body.append(el);
    const imgBtn = el.querySelector('.block-gallery__open') as HTMLButtonElement;
    imgBtn.focus();
    imgBtn.click();

    const dialog = document.body.querySelector('.block-gallery-lightbox') as HTMLElement;
    (dialog.querySelector('.block-gallery-lightbox__close') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(imgBtn);
    el.remove();
  });

  it('Escape restores focus to the open button', () => {
    const el = renderGalleryBlock(sampleGallery('grid', 2), 'student');
    document.body.append(el);
    const imgBtn = el.querySelector('.block-gallery__open') as HTMLButtonElement;
    imgBtn.focus();
    imgBtn.click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.querySelector('.block-gallery-lightbox')).toBeNull();
    expect(document.activeElement).toBe(imgBtn);
    el.remove();
  });
});
