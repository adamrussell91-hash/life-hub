import { describe, expect, it } from 'vitest';
import { createLinkedSectionStub } from '@/blocks/composition-link';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import {
  countBlocksInTree,
  deleteBlocksById,
  insertAt,
  insertTargetForSelection,
  insertTypeForParent,
  moveBlockTo,
  moveByTarget,
  nextBlockIdFactory,
  reorderSiblings,
  sectionDropUnpacks,
  unpackSectionTo
} from '@/teacher/lesson-canvas/drop';

function asSection(block: Block): Extract<Block, { block_type: 'section' }> {
  if (block.block_type !== 'section') throw new Error('expected section');
  return block;
}

function asColumns(block: Block): Extract<Block, { block_type: 'columns' }> {
  if (block.block_type !== 'columns') throw new Error('expected columns');
  return block;
}

function asTabs(block: Block): Extract<Block, { block_type: 'tabs' }> {
  if (block.block_type !== 'tabs') throw new Error('expected tabs');
  return block;
}

function withSectionChildren(section: Block, children: Block[]): Block {
  const s = asSection(section);
  return { ...s, content: { ...s.content, blocks: children as typeof s.content.blocks } };
}

describe('insertTypeForParent', () => {
  it('allows heading at the lesson root and refuses collection', () => {
    expect(insertTypeForParent({ kind: 'root' }, 'heading')).toBeNull();
    const reason = insertTypeForParent({ kind: 'root' }, 'collection');
    expect(typeof reason).toBe('string');
    expect(reason!.length).toBeGreaterThan(0);
  });

  it('allows collection at a homepage or unit page root', () => {
    expect(insertTypeForParent({ kind: 'root' }, 'collection', 'page')).toBeNull();
    expect(insertTypeForParent({ kind: 'root' }, 'heading', 'page')).toBeNull();
  });

  it('refuses columns inside columns', () => {
    const reason = insertTypeForParent(
      { kind: 'column', id: 'cols1', columnIndex: 0 },
      'columns'
    );
    expect(typeof reason).toBe('string');
    expect(reason!.length).toBeGreaterThan(0);
    expect(insertTypeForParent({ kind: 'column', id: 'cols1', columnIndex: 0 }, 'heading')).toBeNull();
  });
});

describe('insertAt', () => {
  it('inserts a heading at root index 0', () => {
    const existing = [createBlock('rich_text', 'rt1')];
    const heading = createBlock('heading', 'h1');
    const result = insertAt(existing, { kind: 'root' }, 0, heading);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.id)).toEqual(['h1', 'rt1']);
  });

  it('refuses columns inside columns', () => {
    const cols = createBlock('columns', 'cols1');
    const inner = createBlock('columns', 'cols2');
    const result = insertAt([cols], { kind: 'column', id: 'cols1', columnIndex: 0 }, 0, inner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(asColumns([cols][0]!).content.columns[0]!.blocks).toHaveLength(0);
  });

  it('does not insert types that insertTypeForParent rejects', () => {
    const collection = createBlock('collection', 'coll1');
    const result = insertAt([], { kind: 'root' }, 0, collection);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(insertTypeForParent({ kind: 'root' }, 'collection'));
  });

  it('inserts a collection at page root when rootMode is page', () => {
    const collection = createBlock('collection', 'coll1');
    const result = insertAt([], { kind: 'root' }, 0, collection, { rootMode: 'page' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks[0]?.id).toBe('coll1');
  });

  it('inserts a heading into a section', () => {
    const section = createBlock('section', 'sec1');
    const heading = createBlock('heading', 'h1');
    const result = insertAt([section], { kind: 'section', id: 'sec1' }, 0, heading);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(asSection(result.blocks[0]!).content.blocks.map((b) => b.id)).toEqual(['h1']);
  });

  it('inserts into a specific columnIndex', () => {
    const cols = createBlock('columns', 'cols1');
    const heading = createBlock('heading', 'h1');
    const result = insertAt([cols], { kind: 'column', id: 'cols1', columnIndex: 1 }, 0, heading);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const columns = asColumns(result.blocks[0]!).content.columns;
    expect(columns[0]!.blocks).toHaveLength(0);
    expect(columns[1]!.blocks.map((b) => b.id)).toEqual(['h1']);
  });

  it('inserts into a specific tabIndex', () => {
    const tabs = createBlock('tabs', 'tabs1');
    const heading = createBlock('heading', 'h1');
    const result = insertAt([tabs], { kind: 'tab', id: 'tabs1', tabIndex: 2 }, 0, heading);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const panels = asTabs(result.blocks[0]!).content.tabs;
    expect(panels[0]!.blocks).toHaveLength(0);
    expect(panels[1]!.blocks).toHaveLength(0);
    expect(panels[2]!.blocks.map((b) => b.id)).toEqual(['h1']);
  });

  it('returns ok: false and does not mutate when the parent is missing', () => {
    const blocks = [createBlock('heading', 'h1')];
    const snapshot = structuredClone(blocks);
    const result = insertAt(blocks, { kind: 'section', id: 'missing' }, 0, createBlock('rich_text', 'rt1'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(blocks).toEqual(snapshot);
  });

  it('returns ok: false and does not mutate when columnIndex is out of range', () => {
    const cols = createBlock('columns', 'cols1');
    const blocks = [cols];
    const snapshot = structuredClone(blocks);
    const result = insertAt(blocks, { kind: 'column', id: 'cols1', columnIndex: 9 }, 0, createBlock('heading', 'h1'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(blocks).toEqual(snapshot);
    expect(asColumns(blocks[0]!).content.columns.every((col) => col.blocks.length === 0)).toBe(true);
  });
});

describe('moveBlockTo', () => {
  it('moves a rich_text between two siblings', () => {
    const blocks = [
      createBlock('heading', 'h1'),
      createBlock('rich_text', 'rt1'),
      createBlock('callout', 'c1')
    ];
    const result = moveBlockTo(blocks, 'rt1', { kind: 'root' }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.id)).toEqual(['rt1', 'h1', 'c1']);
    expect(result.blocks.filter((b) => b.id === 'rt1')).toHaveLength(1);
  });

  it('removes first then inserts, adjusting index in the same list', () => {
    const blocks = [
      createBlock('heading', 'h1'),
      createBlock('rich_text', 'rt1'),
      createBlock('callout', 'c1')
    ];
    const result = moveBlockTo(blocks, 'h1', { kind: 'root' }, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.id)).toEqual(['rt1', 'h1', 'c1']);
  });

  it('moves a block from root into a column', () => {
    const cols = createBlock('columns', 'cols1');
    const rich = createBlock('rich_text', 'rt1');
    const result = moveBlockTo([cols, rich], 'rt1', { kind: 'column', id: 'cols1', columnIndex: 0 }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.id)).toEqual(['cols1']);
    expect(asColumns(result.blocks[0]!).content.columns[0]!.blocks.map((b) => b.id)).toEqual(['rt1']);
  });
});

describe('countBlocksInTree', () => {
  it('counts nested section children', () => {
    const section = asSection(createBlock('section', 'sec1'));
    const tree: Block[] = [
      {
        ...section,
        content: {
          ...section.content,
          blocks: [createBlock('heading', 'h1'), createBlock('rich_text', 'rt1')] as typeof section.content.blocks
        }
      }
    ];
    expect(countBlocksInTree(tree)).toBe(3);
  });
});

describe('nextBlockIdFactory', () => {
  it('skips ids already used by nested blocks', () => {
    const section = asSection(createBlock('section', 'sec1'));
    const tree: Block[] = [
      {
        ...section,
        content: {
          ...section.content,
          blocks: [createBlock('heading', 'block_lesson_1_1'), createBlock('rich_text', 'block_lesson_1_2')] as typeof section.content.blocks
        }
      }
    ];
    const nextId = nextBlockIdFactory('block_lesson_1', tree);
    expect(nextId()).toBe('block_lesson_1_3');
  });
});

describe('insertTargetForSelection', () => {
  it('inserts inside a selected section', () => {
    const section = withSectionChildren(createBlock('section', 'sec1'), [
      createBlock('heading', 'h1')
    ]);
    expect(insertTargetForSelection([section], 'sec1')).toEqual({
      parent: { kind: 'section', id: 'sec1' },
      index: 1
    });
  });

  it('inserts after a selected nested child in that parent', () => {
    const section = withSectionChildren(createBlock('section', 'sec1'), [
      createBlock('heading', 'h1'),
      createBlock('rich_text', 'rt1')
    ]);
    expect(insertTargetForSelection([section], 'h1')).toEqual({
      parent: { kind: 'section', id: 'sec1' },
      index: 1
    });
  });

  it('appends at root when nothing is selected', () => {
    const heading = createBlock('heading', 'h1');
    expect(insertTargetForSelection([heading], null)).toEqual({
      parent: { kind: 'root' },
      index: 1
    });
  });
});

describe('deleteBlocksById', () => {
  it('removes a nested block inside a section', () => {
    const section = asSection(createBlock('section', 'sec1'));
    const tree: Block[] = [
      {
        ...section,
        content: {
          ...section.content,
          blocks: [createBlock('heading', 'h1'), createBlock('rich_text', 'rt1')] as typeof section.content.blocks
        }
      }
    ];
    const next = deleteBlocksById(tree, ['h1']);
    expect(next).toHaveLength(1);
    expect(asSection(next[0]!).content.blocks.map((b) => b.id)).toEqual(['rt1']);
    expect(countBlocksInTree(next)).toBe(2);
  });
});

describe('reorderSiblings', () => {
  it('reorders root siblings by id list', () => {
    const blocks = [
      createBlock('heading', 'h1'),
      createBlock('rich_text', 'rt1'),
      createBlock('callout', 'c1')
    ];
    const result = reorderSiblings(blocks, { kind: 'root' }, ['c1', 'h1', 'rt1']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((b) => b.id)).toEqual(['c1', 'h1', 'rt1']);
  });

  it('reorders section children', () => {
    const tree = [
      withSectionChildren(createBlock('section', 'sec1'), [
        createBlock('heading', 'h1'),
        createBlock('rich_text', 'rt1')
      ])
    ];
    const result = reorderSiblings(tree, { kind: 'section', id: 'sec1' }, ['rt1', 'h1']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(asSection(result.blocks[0]!).content.blocks.map((b) => b.id)).toEqual(['rt1', 'h1']);
  });
});

describe('linked section writes', () => {
  const linkedMessage = 'Linked sections cannot contain blocks.';

  function linkedTree(): Block[] {
    return [
      createLinkedSectionStub({
        id: 'sec_linked',
        sourceCompositionId: 'comp_1',
        titleHint: 'Hook'
      })
    ];
  }

  it('refuses insertAt into a linked section and does not mutate', () => {
    const blocks = linkedTree();
    const snapshot = structuredClone(blocks);
    const result = insertAt(blocks, { kind: 'section', id: 'sec_linked' }, 0, createBlock('heading', 'h1'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(linkedMessage);
    expect(blocks).toEqual(snapshot);
    expect(asSection(blocks[0]!).content.blocks).toEqual([]);
  });

  it('refuses moveBlockTo into a linked section and does not mutate', () => {
    const linked = createLinkedSectionStub({
      id: 'sec_linked',
      sourceCompositionId: 'comp_1',
      titleHint: 'Hook'
    });
    const rich = createBlock('rich_text', 'rt1');
    const blocks = [linked, rich];
    const snapshot = structuredClone(blocks);
    const result = moveBlockTo(blocks, 'rt1', { kind: 'section', id: 'sec_linked' }, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(linkedMessage);
    expect(blocks).toEqual(snapshot);
    expect(blocks.map((b) => b.id)).toEqual(['sec_linked', 'rt1']);
  });

  it('refuses reorderSiblings on a linked section and does not mutate', () => {
    const linked = createLinkedSectionStub({
      id: 'sec_linked',
      sourceCompositionId: 'comp_1',
      titleHint: 'Hook'
    });
    const tree = [
      withSectionChildren(linked, [createBlock('heading', 'h1'), createBlock('rich_text', 'rt1')])
    ];
    const snapshot = structuredClone(tree);
    const result = reorderSiblings(tree, { kind: 'section', id: 'sec_linked' }, ['rt1', 'h1']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(linkedMessage);
    expect(tree).toEqual(snapshot);
  });
});

describe('lecture side paths when moving', () => {
  const sidePath = (id: string, children: Block[] = []): Block => {
    const s = asSection(createBlock('section', id));
    return { ...s, content: { ...s.content, title: 'Again', side_path: true, blocks: children as typeof s.content.blocks } } as Block;
  };
  const ids = (blocks: Block[]) => blocks.map((b) => b.id);
  const kids = (block: Block) => ids(asSection(block).content.blocks as Block[]);

  it('moves a side path into a chapter section whole', () => {
    const chapter = createBlock('section', 'sec1');
    const blocks = [chapter, sidePath('p1', [createBlock('rich_text', 'rt1')])];
    expect(sectionDropUnpacks(blocks, 'p1', { kind: 'section', id: 'sec1' })).toBe(false);
    const result = moveBlockTo(blocks, 'p1', { kind: 'section', id: 'sec1' }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ids(result.blocks)).toEqual(['sec1']);
    expect(kids(result.blocks[0]!)).toEqual(['p1']);
    expect(kids(asSection(result.blocks[0]!).content.blocks[0] as Block)).toEqual(['rt1']);
  });

  it('refuses a side path inside another side path', () => {
    const blocks = [sidePath('p0'), sidePath('p1')];
    expect(sectionDropUnpacks(blocks, 'p1', { kind: 'section', id: 'p0' })).toBe(false);
    const result = moveBlockTo(blocks, 'p1', { kind: 'section', id: 'p0' }, 0);
    expect(result).toEqual({ ok: false, message: 'An If wrong path can sit on the page or inside a chapter.' });
  });

  it('refuses a side path in a column or tab rather than unpacking it', () => {
    const blocks = [createBlock('columns', 'cols1'), createBlock('tabs', 'tabs1'), sidePath('p1', [createBlock('rich_text', 'rt1')])];
    for (const parent of [
      { kind: 'column', id: 'cols1', columnIndex: 0 },
      { kind: 'tab', id: 'tabs1', tabIndex: 0 }
    ] as const) {
      expect(sectionDropUnpacks(blocks, 'p1', parent)).toBe(false);
      const result = moveBlockTo(blocks, 'p1', parent, 0);
      expect(result).toEqual({ ok: false, message: 'An If wrong path can sit on the page or inside a chapter.' });
    }
  });

  it('still unpacks a chapter dropped into a column or a chapter', () => {
    const cols = createBlock('columns', 'cols1');
    const blocks = [cols, createBlock('section', 'sec1'), createBlock('section', 'sec2')];
    expect(sectionDropUnpacks(blocks, 'sec2', { kind: 'column', id: 'cols1', columnIndex: 0 })).toBe(true);
    expect(sectionDropUnpacks(blocks, 'sec2', { kind: 'section', id: 'sec1' })).toBe(true);
    expect(sectionDropUnpacks(blocks, 'sec2', { kind: 'root' })).toBe(false);
  });

  it('unpacks a chapter that holds a side path into another chapter', () => {
    const inner = [createBlock('cloze', 'q1'), sidePath('p1')];
    const blocks = [createBlock('section', 'sec1'), withSectionChildren(createBlock('section', 'sec2'), inner)];
    const result = unpackSectionTo(blocks, 'sec2', { kind: 'section', id: 'sec1' }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(kids(result.blocks[0]!)).toEqual(['q1', 'p1']);
  });

  it('names the side path rule when a chapter holding one unpacks where it cannot go', () => {
    const blocks = [createBlock('columns', 'cols1'), withSectionChildren(createBlock('section', 'sec2'), [createBlock('cloze', 'q1'), sidePath('p1')])];
    const result = unpackSectionTo(blocks, 'sec2', { kind: 'column', id: 'cols1', columnIndex: 0 }, 0);
    expect(result).toEqual({ ok: false, message: 'An If wrong path can sit on the page or inside a chapter.' });
  });

  it('carries a gate’s side path along when the gate moves', () => {
    const blocks = [createBlock('rich_text', 'rt1'), createBlock('cloze', 'q1'), sidePath('p1'), createBlock('callout', 'c1')];
    const result = moveBlockTo(blocks, 'q1', { kind: 'root' }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ids(result.blocks)).toEqual(['q1', 'p1', 'rt1', 'c1']);

    const down = moveBlockTo(blocks, 'q1', { kind: 'root' }, 4);
    expect(down.ok && ids(down.blocks)).toEqual(['rt1', 'c1', 'q1', 'p1']);
  });

  it('carries the side path when a hinge moves into a chapter', () => {
    const blocks = [createBlock('section', 'sec1'), createBlock('hinge_question', 'hq1'), sidePath('p1')];
    const result = moveBlockTo(blocks, 'hq1', { kind: 'section', id: 'sec1' }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ids(result.blocks)).toEqual(['sec1']);
    expect(kids(result.blocks[0]!)).toEqual(['hq1', 'p1']);
  });

  it('refuses to split a gate from its side path into a column', () => {
    const blocks = [createBlock('columns', 'cols1'), createBlock('cloze', 'q1'), sidePath('p1')];
    const result = moveBlockTo(blocks, 'q1', { kind: 'column', id: 'cols1', columnIndex: 0 }, 0);
    expect(result).toEqual({ ok: false, message: 'A question and its If wrong path move together, onto the page or into a chapter.' });
  });

  it('a self-check does not carry the section after it', () => {
    const blocks = [createBlock('rich_text', 'rt1'), createBlock('self_check', 'k1'), sidePath('p1')];
    const result = moveBlockTo(blocks, 'k1', { kind: 'root' }, 0);
    expect(result.ok && ids(result.blocks)).toEqual(['k1', 'rt1', 'p1']);
  });

  it('move up and down step over a gate and its side path as one', () => {
    const list = [createBlock('rich_text', 'rt1'), createBlock('cloze', 'q1'), sidePath('p1'), createBlock('callout', 'c1')];
    const step = (id: string, delta: 1 | -1) => {
      const at = moveByTarget(list, id, delta);
      if (at === null) return null;
      const result = moveBlockTo(list, id, { kind: 'root' }, at);
      return result.ok ? ids(result.blocks) : null;
    };
    expect(step('q1', 1)).toEqual(['rt1', 'c1', 'q1', 'p1']);
    expect(step('q1', -1)).toEqual(['q1', 'p1', 'rt1', 'c1']);
    expect(step('c1', -1)).toEqual(['rt1', 'c1', 'q1', 'p1']);
    expect(step('rt1', 1)).toEqual(['q1', 'p1', 'rt1', 'c1']);
    expect(step('rt1', -1)).toBeNull();
    expect(step('c1', 1)).toBeNull();
  });
});
