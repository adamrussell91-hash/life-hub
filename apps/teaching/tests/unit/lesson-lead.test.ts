import { describe, it, expect } from 'vitest';
import { firstLeadFromBlocks } from '@/student/lesson-lead';

describe('firstLeadFromBlocks', () => {
  it('strips tags from the first rich_text html', () => {
    expect(
      firstLeadFromBlocks([
        { block_type: 'rich_text', content: { html: '<p>Lead copy here</p>' } }
      ])
    ).toBe('Lead copy here');
  });

  it('uses heading text when it appears first', () => {
    expect(
      firstLeadFromBlocks([
        { block_type: 'heading', content: { text: '  Memory  ' } },
        { block_type: 'rich_text', content: { html: '<p>Later</p>' } }
      ])
    ).toBe('Memory');
  });

  it('returns null for empty blocks', () => {
    expect(firstLeadFromBlocks([])).toBeNull();
    expect(
      firstLeadFromBlocks([{ block_type: 'rich_text', content: { html: '<p>  </p>' } }])
    ).toBeNull();
  });

  it('skips non-lead blocks until the first rich_text or heading', () => {
    expect(
      firstLeadFromBlocks([
        { block_type: 'callout', content: { style: 'information', body: 'note' } },
        { block_type: 'rich_text', content: { html: '<p>Lead</p>' } }
      ])
    ).toBe('Lead');
  });
});
