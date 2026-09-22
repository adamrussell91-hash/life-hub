import { describe, expect, it } from 'vitest';
import { cloneBlockWithNewIds, createBlock } from '@/blocks/create-block';
import { BlockSchema } from '@/schemas/block';

describe('whiteboard block', () => {
  it('creates a valid whiteboard with its own document id', () => {
    const block = createBlock('whiteboard', 'wb1');
    expect(BlockSchema.parse(block)).toMatchObject({
      block_type: 'whiteboard',
      content: {
        document_id: 'whiteboard_wb1',
        height_px: 640
      }
    });
  });

  it('duplicates into a new document and keeps the source only as a seed', () => {
    const source = createBlock('whiteboard', 'wb1');
    let n = 0;
    const clone = cloneBlockWithNewIds(source, () => `copy_${++n}`);

    expect(clone).toMatchObject({
      id: 'copy_1',
      block_type: 'whiteboard',
      content: {
        document_id: 'whiteboard_copy_1',
        seed_document_id: 'whiteboard_wb1'
      }
    });
    expect(clone.content).not.toHaveProperty('published_snapshot');
  });
});
