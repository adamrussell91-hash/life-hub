import { describe, expect, it } from 'vitest';
import { COLUMN_CHILD_TYPES, createBlock } from '@/blocks/create-block';
import { createNestedBlocksEditor } from '@/blocks/nested-blocks-editor';

describe('nested pragmatic gaps', () => {
  it('renders reorder gaps and a drag grip for nested blocks', () => {
    const a = createBlock('heading', 'a');
    const b = createBlock('heading', 'b');
    const el = createNestedBlocksEditor({
      blocks: [a, b],
      allowedTypes: COLUMN_CHILD_TYPES,
      idFactory: () => 'id',
      onChange: () => {}
    });
    document.body.append(el);
    expect(el.querySelectorAll('.block-editor__nested-gap').length).toBe(3);
    expect(el.querySelector('.block-editor__nested-grip')).toBeTruthy();
    el.remove();
  });
});
