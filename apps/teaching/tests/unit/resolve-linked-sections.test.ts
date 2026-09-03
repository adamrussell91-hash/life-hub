import { describe, it, expect } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { createLinkedSectionStub } from '@/blocks/composition-link';
import {
  LinkedResolveError,
  resolveLinkedSectionsForPublish
} from '@/blocks/resolve-linked-sections';
import type { CompositionTemplate } from '@/schemas/composition';
import type { Block } from '@/schemas/block';

function makeComposition(
  id: string,
  title: string,
  status: CompositionTemplate['status'] = 'active'
): CompositionTemplate {
  const root = createBlock('section', `${id}_root`);
  if (root.block_type !== 'section') throw new Error('expected section');
  root.content.title = title;
  root.content.blocks.push(
    createBlock('rich_text', `${id}_rt`) as (typeof root.content.blocks)[number]
  );
  return {
    id,
    type: 'composition_template',
    title,
    slug: 'x',
    status,
    root,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1
  };
}

describe('resolveLinkedSectionsForPublish', () => {
  it('expands linked stubs to independent sections without link', () => {
    const comp = makeComposition('composition_1', 'Reading');
    const stub = createLinkedSectionStub({
      id: 'block_stub',
      sourceCompositionId: 'composition_1',
      titleHint: 'Hint'
    });
    let n = 0;
    const out = resolveLinkedSectionsForPublish(
      [stub],
      (id) => (id === 'composition_1' ? comp : null),
      () => `block_pub_${++n}`
    );
    expect(out).toHaveLength(1);
    const section = out[0]!;
    expect(section.block_type).toBe('section');
    if (section.block_type !== 'section') throw new Error('expected section');
    expect(section.content.link).toBeUndefined();
    expect(section.content.title).toBe('Reading');
    expect(section.content.blocks.length).toBe(1);
    expect(section.id).toBe('block_pub_1');
  });

  it('throws LinkedResolveError when source missing', () => {
    const stub = createLinkedSectionStub({
      id: 'block_stub',
      sourceCompositionId: 'composition_missing',
      titleHint: 'Hint'
    });
    expect(() =>
      resolveLinkedSectionsForPublish([stub], () => null, () => 'block_x')
    ).toThrow(LinkedResolveError);
  });

  it('throws LinkedResolveError when source is archived', () => {
    const comp = makeComposition('composition_1', 'Reading', 'archived');
    const stub = createLinkedSectionStub({
      id: 'block_stub',
      sourceCompositionId: 'composition_1',
      titleHint: 'Hint'
    });
    expect(() =>
      resolveLinkedSectionsForPublish(
        [stub],
        (id) => (id === 'composition_1' ? comp : null),
        () => 'block_x'
      )
    ).toThrow(LinkedResolveError);
  });

  it('passes through non-linked blocks unchanged (same reference ok)', () => {
    const plain = createBlock('heading', 'block_h');
    const out = resolveLinkedSectionsForPublish([plain], () => null, () => 'block_x');
    expect(out[0]).toBe(plain);
  });
});
