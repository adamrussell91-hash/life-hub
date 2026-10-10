import { describe, expect, it } from 'vitest';
import { COLUMN_CHILD_TYPES, createBlock } from '@/blocks/create-block';
import { createNestedBlocksEditor } from '@/blocks/nested-blocks-editor';

describe('nested block list', () => {
  it('renders drop slots, a drag grip, and a menu for nested blocks', () => {
    const a = createBlock('heading', 'a');
    const b = createBlock('heading', 'b');
    const el = createNestedBlocksEditor({
      blocks: [a, b],
      allowedTypes: COLUMN_CHILD_TYPES,
      idFactory: () => 'id',
      onChange: () => {}
    });
    document.body.append(el);
    expect(el.querySelectorAll('.hub-list__gap').length).toBe(3);
    expect(el.querySelector('.hub-list__grip')).toBeTruthy();
    expect(el.querySelectorAll('.hub-list__row .hub-list__more')).toHaveLength(2);
    expect(el.querySelector('.hub-list__label .block-type-label')?.textContent).toBe('Heading');
    el.remove();
  });
});
