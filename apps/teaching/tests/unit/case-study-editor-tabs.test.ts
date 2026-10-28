import { describe, it, expect } from 'vitest';
import { inCaseTab, withCaseBriefSection, withCasePartSection } from '@/case-study/editor-tabs';
import type { Block } from '@/schemas/block';

describe('case study editor tabs', () => {
  it('puts the Brief section on Brief and every other block on Decide', () => {
    let n = 0;
    const plain = { id: 'b1', block_type: 'text', content: { text: 'x' } } as unknown as Block;
    const blocks = withCaseBriefSection([plain], () => `id${++n}`);
    const brief = blocks[0]!;
    expect(blocks).toHaveLength(2);
    expect(inCaseTab(brief, 'brief')).toBe(true);
    expect(inCaseTab(brief, 'decide')).toBe(false);
    expect(inCaseTab(plain, 'brief')).toBe(false);
    expect(inCaseTab(plain, 'decide')).toBe(true);
    expect(inCaseTab(plain, 'kit')).toBe(false);
    expect(inCaseTab(brief, 'all') && inCaseTab(plain, 'all')).toBe(true);
    expect(withCaseBriefSection(blocks, () => 'again')).toBe(blocks);
  });

  it('puts a part section on The case only, once per part', () => {
    const plain = { id: 'b1', block_type: 'text', content: { text: 'x' } } as unknown as Block;
    const blocks = withCasePartSection([plain], 'p1', 'Part 1: Questions 1 and 2', () => 'sec1');
    const part = blocks[1]!;
    expect(blocks).toHaveLength(2);
    expect(part.block_type === 'section' && part.content.case_part).toBe('p1');
    expect(inCaseTab(part, 'case')).toBe(true);
    expect(inCaseTab(part, 'decide')).toBe(false);
    expect(inCaseTab(part, 'brief')).toBe(false);
    expect(inCaseTab(plain, 'case')).toBe(false);
    expect(inCaseTab(part, 'all')).toBe(true);
    expect(withCasePartSection(blocks, 'p1', 'again', () => 'sec2')).toBe(blocks);
    expect(withCasePartSection(blocks, 'p2', 'Part 2', () => 'sec2')).toHaveLength(3);
  });
});
