import { describe, expect, it } from 'vitest';
import { cloneBlockWithNewIds, createBlock } from '@/blocks/create-block';
import { hasDrawing, toScene } from '@/blocks/excalidraw-board';
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

  it('reads an Excalidraw scene and keeps only the background from app state', () => {
    const scene = toScene({
      format: 'excalidraw',
      version: 1,
      elements: [{ id: 'a', type: 'rectangle' }],
      appState: { viewBackgroundColor: '#fffbe6', zoom: { value: 3 } },
      files: {}
    });
    expect(scene.elements).toHaveLength(1);
    expect(scene.appState).toEqual({ viewBackgroundColor: '#fffbe6' });
    expect(hasDrawing(scene)).toBe(true);
  });

  it('treats old BlockSuite snapshots and missing data as an empty board', () => {
    expect(toScene({ type: 'page', blocks: {} }).elements).toEqual([]);
    expect(toScene(null).elements).toEqual([]);
    expect(toScene([1, 2]).elements).toEqual([]);
  });

  it('does not count deleted shapes as a drawing', () => {
    const scene = toScene({
      format: 'excalidraw',
      elements: [{ id: 'a', isDeleted: true }],
      appState: {},
      files: {}
    });
    expect(hasDrawing(scene)).toBe(false);
  });
});
