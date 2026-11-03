// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createFromInsertMenu } from '@/blocks/create-block';
import { fadeLines, renderWhatHowWhy } from '@/blocks/what-how-why';
import { criteriaFromLines } from '@/blocks/what-how-why-editor';
import { BlockSchema, type Block } from '@/schemas/block';
import { listPublishBlockIssues } from '@/schemas/publish-block-issues';

type OutcomesBlock = Extract<Block, { block_type: 'outcomes' }>;

function makeBlock(what = '', how: Array<{ id: string; text: string }> = []): OutcomesBlock {
  const base = createFromInsertMenu('outcomes', 'w1') as OutcomesBlock;
  return { ...base, content: { what, how } };
}

describe('What, how, why block', () => {
  it('nests the Why inside the How inside the What', () => {
    const root = renderWhatHowWhy(makeBlock('Sentence length', [{ id: 'c1', text: 'Point to it' }]), 'student');
    expect(root.querySelector('.whw__br--what .whw__br--how .whw__br--why')).not.toBeNull();
    expect(root.querySelector('.whw__what')?.textContent).toBe('Sentence length');
    expect(root.querySelector('.whw__list')?.textContent).toContain('Point to it');
  });

  it('a block placed before this design still parses, and stays out of students’ way', () => {
    const parsed = BlockSchema.parse({ ...makeBlock(), content: {} }) as OutcomesBlock;
    expect(parsed.content).toEqual({ what: '', how: [] });
    expect(renderWhatHowWhy(parsed, 'student').hidden).toBe(true);
    expect(renderWhatHowWhy(parsed, 'teacher').hidden).toBe(false);
  });

  it('asks for a What before publishing', () => {
    expect(listPublishBlockIssues([makeBlock()]).length).toBe(1);
    expect(listPublishBlockIssues([makeBlock('Sentence length')]).length).toBe(0);
  });

  it('shows the student’s own Why first and again among the class’s', () => {
    const lines = fadeLines('Mine', ['One', 'Two'], (items) => items);
    expect(lines[0]).toEqual({ text: 'Mine', mine: true });
    expect(lines.filter((l) => l.mine).length).toBe(2);
    expect(lines.filter((l) => !l.mine).map((l) => l.text)).toEqual(['One', 'Two']);
  });

  it('holds just the student’s own Why while nobody else has written', () => {
    expect(fadeLines('Mine', [], (items) => items)).toEqual([{ text: 'Mine', mine: true }]);
  });

  it('keeps a criterion’s id while its line stays the same', () => {
    const before = [{ id: 'c1', text: 'Point to it' }, { id: 'c2', text: 'Explain it' }];
    const after = criteriaFromLines('Explain it\n\nUse it', before);
    expect(after[0]).toEqual({ id: 'c2', text: 'Explain it' });
    expect(after[1]?.text).toBe('Use it');
    expect(after.length).toBe(2);
  });
});
