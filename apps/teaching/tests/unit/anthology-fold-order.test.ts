import { describe, expect, it } from 'vitest';
import { buildAnthologyView } from '@/blocks/anthology-view';
import { createBlock } from '@/blocks/create-block';

describe('anthology fold expand', () => {
  it('lists hidden lines in their real order', () => {
    const block = createBlock('anthology', 'anth_1');
    if (block.block_type !== 'anthology') throw new Error('expected anthology');
    const lines = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id: `l_${id}`, text: `line ${id}` }));
    const view = buildAnthologyView(block, {
      mode: 'student',
      defaultView: 'theme',
      data: {
        items: [{
          lesson_id: 'les_1', lesson_title: 'L', block_id: 'b1', annotation_id: 'n1', quote: 'q',
          line_number: 5, layer_name: 'Mine', themes: ['grief'], concepts: []
        }],
        texts: [{
          lesson_id: 'les_1', block_id: 'b1', title: 'Poem', fingerprint: {}, text_included: true,
          poem: { stanzas: [{ id: 's1', lines }] } as never,
          stop_lines: { n1: 'l_e' }
        }]
      }
    });
    document.body.append(view);
    const bar = view.querySelector<HTMLButtonElement>('.block-anthology__fold-bar')!;
    bar.click();
    const shown = [...view.querySelectorAll('.block-anthology__fold-line[data-fold-id]')].map((p) => p.textContent);
    expect(shown).toEqual(['line a', 'line b', 'line c', 'line d']);
  });
});
