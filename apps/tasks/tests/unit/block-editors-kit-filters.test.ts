import { describe, expect, it } from 'vitest';
import {
  COLUMN_CHILD_TYPES,
  createBlock
} from '@/blocks/create-block';
import {
  createHeadingEditor,
  createVisibilitySelect
} from '@/blocks/editors';
import { createNestedBlocksEditor } from '@/blocks/nested-blocks-editor';
import { createSpacerEditor } from '@/blocks/layout-editors';
import type { Block } from '@/schemas/block';

function heading() {
  return createBlock('heading', 'h1') as Extract<Block, { block_type: 'heading' }>;
}

describe('block editors use kit filters', () => {
  it('creates visibility as a hub-filter button', () => {
    const el = createVisibilitySelect(heading(), () => undefined);
    expect(el.tagName).toBe('BUTTON');
    expect(el.classList.contains('hub-filter')).toBe(true);
    expect(el.classList.contains('block-editor__visibility')).toBe(true);
    expect(el.querySelector('select')).toBeNull();
  });

  it('heading editor has no native select and changes level via the kit menu', () => {
    let latest = heading();
    const editor = createHeadingEditor(latest, (next) => {
      latest = next;
    });
    expect(editor.querySelector('select')).toBeNull();
    const level = editor.querySelector<HTMLButtonElement>('.block-editor__heading-variant')!;
    expect(level.classList.contains('hub-filter')).toBe(true);
    level.click();
    document.querySelector<HTMLButtonElement>('[data-hub-option="page"]')!.click();
    expect(latest.variant).toBe('page');
  });

  it('nested and spacer editors have no native selects', () => {
    const nested = createNestedBlocksEditor({
      blocks: [heading()],
      allowedTypes: COLUMN_CHILD_TYPES,
      idFactory: () => 'n',
      onChange: () => undefined,
      columnMove: {
        columnCount: 2,
        columnIndex: 0,
        onMoveToColumn: () => undefined
      }
    });
    expect(nested.querySelector('select')).toBeNull();
    expect(nested.querySelector('.block-editor__nested-move-column')?.tagName).toBe('BUTTON');
    expect(nested.querySelector('.block-editor__add-nested-type')?.tagName).toBe('BUTTON');

    const spacer = createSpacerEditor(
      createBlock('spacer', 's1') as Extract<Block, { block_type: 'spacer' }>,
      () => undefined
    );
    expect(spacer.querySelector('select')).toBeNull();
    expect(spacer.querySelector('.block-editor__spacer-size')?.tagName).toBe('BUTTON');
  });
});
