import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import {
  formatPublishBlockIssue,
  listPublishBlockIssues,
  publishBlockIssues
} from '@/schemas/publish-block-issues';
import type { Block } from '@/schemas/block';

function captionOnlyDiagram(id: string, caption: string): Block {
  const block = createBlock('diagram', id);
  if (block.block_type !== 'diagram') throw new Error('expected diagram');
  block.content = {
    source: 'image',
    image_url: '',
    image_alt: '',
    caption
  };
  return block;
}

describe('listPublishBlockIssues', () => {
  it('names the diagram and its caption so the teacher can find it', () => {
    const issues = listPublishBlockIssues([
      createBlock('heading', 'h1'),
      captionOnlyDiagram('d1', 'Spacing vs massed practice')
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.blockId).toBe('d1');
    expect(formatPublishBlockIssue(issues[0]!)).toBe(
      'Diagram “Spacing vs massed practice”: Diagram image needs a valid http(s) URL to publish'
    );
    expect(publishBlockIssues([captionOnlyDiagram('d1', 'Spacing vs massed practice')])).toContain(
      'Diagram “Spacing vs massed practice”'
    );
  });

  it('numbers two diagrams of the same type', () => {
    const issues = listPublishBlockIssues([
      captionOnlyDiagram('d1', 'First'),
      captionOnlyDiagram('d2', 'Second')
    ]);
    expect(issues.map((issue) => issue.label)).toEqual([
      'Diagram 1 “First”',
      'Diagram 2 “Second”'
    ]);
  });

  it('includes the parent section when the broken block is nested', () => {
    const diagram = captionOnlyDiagram('d1', 'Forgetting curve');
    const section = createBlock('section', 'sec1');
    if (section.block_type !== 'section') throw new Error('expected section');
    section.content = {
      title: 'Practice',
      blocks: [diagram] as typeof section.content.blocks
    };
    const issues = listPublishBlockIssues([section]);
    expect(issues[0]?.label).toBe('Section “Practice” → Diagram “Forgetting curve”');
  });
});

describe('lecture side paths at publish', () => {
  const ORPHAN = 'Place this If wrong path straight under a hinge question or cloze.';
  const sidePath = (id: string): Block => {
    const s = createBlock('section', id);
    if (s.block_type !== 'section') throw new Error('expected section');
    return { ...s, content: { ...s.content, title: 'Again', side_path: true } } as Block;
  };
  const orphans = (blocks: Block[], lecture = true) =>
    listPublishBlockIssues(blocks, { lecture }).filter((issue) => issue.message === ORPHAN).map((issue) => issue.blockId);

  it('flags a side path with no hinge or cloze straight above it', () => {
    expect(orphans([createBlock('rich_text', 't1'), sidePath('p1')])).toEqual(['p1']);
    expect(orphans([sidePath('p0'), createBlock('rich_text', 't1')])).toEqual(['p0']);
    expect(orphans([createBlock('cloze', 'q1'), sidePath('p1'), createBlock('hinge_question', 'h1'), sidePath('p2')])).toEqual([]);
  });

  it('checks inside a chapter too', () => {
    const chapter = createBlock('section', 's1');
    if (chapter.block_type !== 'section') throw new Error('expected section');
    const inside = { ...chapter, content: { ...chapter.content, blocks: [createBlock('self_check', 'k1'), sidePath('p1')] } } as Block;
    expect(orphans([inside])).toEqual(['p1']);
  });

  it('leaves other lesson types and a lone block alone', () => {
    expect(orphans([createBlock('rich_text', 't1'), sidePath('p1')], false)).toEqual([]);
    expect(orphans([sidePath('p1')])).toEqual([]);
  });
});
