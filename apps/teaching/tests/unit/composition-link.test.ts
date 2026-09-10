import { describe, it, expect } from 'vitest';
import {
  createLinkedSectionStub,
  isLinkedSection,
  isCompositionUsable
} from '@/blocks/composition-link';
import type { CompositionTemplate } from '@/schemas/composition';
import { createBlock } from '@/blocks/create-block';

describe('composition-link', () => {
  it('createLinkedSectionStub builds empty linked section', () => {
    const stub = createLinkedSectionStub({
      id: 'block_linked_1',
      sourceCompositionId: 'composition_1',
      titleHint: 'Reading pack'
    });
    expect(isLinkedSection(stub)).toBe(true);
    expect(stub.content.blocks).toEqual([]);
    expect(stub.content.link).toEqual({
      mode: 'linked',
      source_composition_id: 'composition_1'
    });
    expect(stub.content.title).toBe('Reading pack');
  });

  it('isCompositionUsable requires active status', () => {
    const root = createBlock('section', 'block_root');
    if (root.block_type !== 'section') throw new Error('expected section');
    const base = {
      id: 'composition_1',
      type: 'composition_template' as const,
      title: 'T',
      slug: 't',
      root,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1 as const
    };
    expect(isCompositionUsable({ ...base, status: 'active' })).toBe(true);
    expect(isCompositionUsable({ ...base, status: 'archived' })).toBe(false);
    expect(isCompositionUsable({ ...base, status: 'trashed' })).toBe(false);
    expect(isCompositionUsable(null)).toBe(false);
  });
});
