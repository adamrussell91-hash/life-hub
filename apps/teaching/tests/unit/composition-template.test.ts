import { describe, it, expect } from 'vitest';
import { CompositionTemplateSchema } from '@/schemas/composition';
import { createBlock } from '@/blocks/create-block';
import { insertCompositionRoot } from '@/blocks/composition-insert';
import { compositionKey } from '@/storage/keys';

describe('CompositionTemplateSchema', () => {
  it('accepts a composition with a section root', () => {
    const root = createBlock('section', 'block_sec_1');
    const parsed = CompositionTemplateSchema.safeParse({
      id: 'composition_1',
      type: 'composition_template',
      title: 'Reading pack',
      slug: 'reading-pack',
      status: 'active',
      root,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty title', () => {
    const root = createBlock('section', 'block_sec_1');
    const parsed = CompositionTemplateSchema.safeParse({
      id: 'composition_1',
      type: 'composition_template',
      title: '',
      slug: 'x',
      status: 'active',
      root,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a non-section root', () => {
    const root = createBlock('rich_text', 'block_rt_1');
    const parsed = CompositionTemplateSchema.safeParse({
      id: 'composition_1',
      type: 'composition_template',
      title: 'Nope',
      slug: 'nope',
      status: 'active',
      root,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(parsed.success).toBe(false);
  });
});

describe('compositionKey', () => {
  it('builds templates/compositions keys', () => {
    expect(compositionKey('composition_1')).toBe('templates/compositions/composition_1');
  });
});

describe('insertCompositionRoot', () => {
  it('returns a new section id independent of template root', () => {
    const root = createBlock('section', 'block_template_root');
    if (root.block_type !== 'section') throw new Error('expected section');
    root.content.title = 'Saved section';
    let n = 0;
    const inserted = insertCompositionRoot(root, () => {
      n += 1;
      return `block_lesson_${n}`;
    });
    expect(inserted.block_type).toBe('section');
    expect(inserted.id).toBe('block_lesson_1');
    expect(inserted.id).not.toBe(root.id);
    expect(inserted.content.title).toBe('Saved section');
  });
});
