import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { blocksToSearchText, htmlToPlainText, snippetAround } from '@/blocks/search-text';
import type { Block } from '@/schemas';

describe('htmlToPlainText', () => {
  it('strips tags and decodes basic entities', () => {
    expect(htmlToPlainText('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    expect(htmlToPlainText('A &amp; B')).toBe('A & B');
  });
});

describe('blocksToSearchText', () => {
  it('concatenates text from nested blocks', () => {
    const heading = {
      ...createBlock('heading', 'h1'),
      content: { text: 'Forces' }
    } as Block;
    const rich = {
      ...createBlock('rich_text', 'r1'),
      content: { html: '<p>Newton&apos;s laws of motion</p>' }
    } as Block;
    const text = blocksToSearchText([heading, rich]);
    expect(text.toLowerCase()).toContain('forces');
    expect(text.toLowerCase()).toContain('newton');
    expect(text.toLowerCase()).toContain('laws');
  });

  it('walks columns and tabs children', () => {
    const inner = {
      ...createBlock('heading', 'h2'),
      variant: 'subsection' as const,
      content: { text: 'Hidden gem' }
    } as Block;
    const columns = {
      ...createBlock('columns', 'col1'),
      content: {
        preset: '50-50' as const,
        columns: [{ width: 6, blocks: [inner] }, { width: 6, blocks: [] }]
      }
    } as Block;
    expect(blocksToSearchText([columns]).toLowerCase()).toContain('hidden gem');
  });

  it('walks tabs children', () => {
    const inner = {
      ...createBlock('heading', 'h3'),
      variant: 'subsection' as const,
      content: { text: 'Tab secret' }
    } as Block;
    const tabs = {
      ...createBlock('tabs', 'tabs1'),
      content: {
        tabs: [
          { id: 'tabs1_t1', label: 'Overview', blocks: [inner] },
          { id: 'tabs1_t2', label: 'Details', blocks: [] }
        ]
      }
    } as Block;
    const text = blocksToSearchText([tabs]).toLowerCase();
    expect(text).toContain('tab secret');
    expect(text).toContain('overview');
  });
});

describe('snippetAround', () => {
  it('returns a short excerpt around the first match', () => {
    const hay = 'aaa ' + 'word '.repeat(40) + 'TARGET phrase here ' + 'zzz '.repeat(40);
    const snip = snippetAround(hay, 'target');
    expect(snip.toLowerCase()).toContain('target');
    expect(snip.length).toBeLessThan(160);
  });
});
