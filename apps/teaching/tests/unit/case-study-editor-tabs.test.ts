import { describe, it, expect } from 'vitest';
import { inCaseTab, withCaseBriefSection } from '@/case-study/editor-tabs';
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
});
