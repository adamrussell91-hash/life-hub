import { describe, expect, it } from 'vitest';
import { agendaToBlocks, extractDecisions, extractMentions } from '@/lib/meeting-notes';

describe('agendaToBlocks', () => {
  it('turns a pasted agenda into a heading and an empty text block per item', () => {
    let n = 0;
    const blocks = agendaToBlocks('1. Minutes and matters arising\n2) Treasurer’s report\n\n- Medal ceremony run sheet', () => `block_${++n}`);
    expect(blocks.map((block) => [block.block_type, (block.content as { text?: string; html?: string }).text ?? (block.content as { html: string }).html])).toEqual([
      ['heading', 'Minutes and matters arising'], ['rich_text', ''],
      ['heading', 'Treasurer’s report'], ['rich_text', ''],
      ['heading', 'Medal ceremony run sheet'], ['rich_text', '']
    ]);
    expect(blocks[0]).toMatchObject({ id: 'block_1', variant: 'section' });
  });
  it('empty agenda gives no blocks', () => {
    expect(agendaToBlocks('  \n ', () => 'x')).toEqual([]);
  });
});

describe('extractDecisions', () => {
  it('reads ✓ and "Decision:" lines under the nearest heading', () => {
    const blocks = [
      { id: 'h1', block_type: 'heading', content: { text: 'Minutes' } },
      { id: 'r1', block_type: 'rich_text', content: { html: '<p>✓ Minutes accepted</p><p>Other chat</p>' } },
      { id: 'h2', block_type: 'heading', content: { text: 'Run sheet' } },
      { id: 'r2', block_type: 'rich_text', content: { html: '<p>Decision: ceremony at Parliament House</p>' } }
    ];
    expect(extractDecisions(blocks)).toEqual([
      { text: 'Minutes accepted', agenda_heading: 'Minutes' },
      { text: 'ceremony at Parliament House', agenda_heading: 'Run sheet' }
    ]);
  });
});

describe('extractMentions', () => {
  it('collects @Name lines per person', () => {
    const text = '@Greg surplus of $4.2k\nPremier’s grant closes 30 Oct\n@Greg grant closes 30 Oct\n@Sam O. first time here';
    expect(extractMentions(text)).toEqual([
      { name: 'Greg', lines: ['surplus of $4.2k', 'grant closes 30 Oct'] },
      { name: 'Sam O.', lines: ['first time here'] }
    ]);
  });
});
