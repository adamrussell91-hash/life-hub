import { describe, expect, it } from 'vitest';
import type { AnthologyData, AnthologyItem } from '@/blocks/anthology-collect';
import { anthologyMapItems, anthologyNoteId, buildAnthologyGraph } from '@/blocks/anthology-graph';
import { buildAnthologyView } from '@/blocks/anthology-view';
import { createBlock } from '@/blocks/create-block';

function item(block: string, id: string, themes: string[], concepts: string[] = []): AnthologyItem {
  return {
    lesson_id: `lesson_${block}`,
    lesson_title: `Lesson ${block}`,
    block_id: block,
    annotation_id: id,
    quote: `quote ${id}`,
    note: `note about ${id}`,
    line_number: 1,
    layer_name: 'General Notes',
    themes,
    concepts
  };
}

const data: AnthologyData = {
  items: [
    item('a', 'n1', ['Hope', 'Country'], ['Style']),
    item('a', 'n2', ['Country']),
    item('b', 'n1', ['Hope'], ['Style']),
    item('b', 'n3', [])
  ],
  texts: [
    { lesson_id: 'lesson_a', block_id: 'a', title: 'Poem A', fingerprint: {}, text_included: true },
    { lesson_id: 'lesson_b', block_id: 'b', title: 'Poem B', fingerprint: {}, text_included: false }
  ]
};

describe('anthology map', () => {
  it('keeps untagged notes off the map once anything is tagged', () => {
    expect(anthologyMapItems(data).map(anthologyNoteId)).toEqual(['a::n1', 'a::n2', 'b::n1']);
  });

  it('gives notes with the same annotation id in different texts their own dots', () => {
    const model = buildAnthologyGraph(data, 'theme');
    const leaves = model.nodes.filter((node) => node.kind === 'leaf').map((node) => node.pageId);
    expect(leaves.sort()).toEqual(['a::n1', 'a::n2', 'b::n1']);
  });

  it('makes a hub per theme, concept or text', () => {
    const hubs = (grouping: 'theme' | 'concept' | 'poem') =>
      buildAnthologyGraph(data, grouping)
        .nodes.filter((node) => node.kind === 'major')
        .map((node) => node.label)
        .sort();
    expect(hubs('theme')).toEqual(['Country', 'Hope']);
    expect(hubs('concept')).toEqual(['Style']);
    expect(hubs('poem')).toEqual(['Poem A', 'Poem B']);
  });

  it('colours each theme hub differently', () => {
    const colours = buildAnthologyGraph(data, 'theme')
      .nodes.filter((node) => node.kind === 'major')
      .map((node) => node.color);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('prints a list by theme instead of the map', () => {
    const block = createBlock('anthology', 'anth_1');
    if (block.block_type !== 'anthology') throw new Error('expected anthology');
    const view = buildAnthologyView(block, { data, mode: 'print' });
    expect([...view.querySelectorAll('.block-anthology__print-theme')].map((h) => h.textContent)).toEqual([
      'Country',
      'Hope'
    ]);
    expect(view.querySelector('.block-anthology__stage')).toBeNull();
  });

  it('shows the toolbar and stage on screen', () => {
    const block = createBlock('anthology', 'anth_1');
    if (block.block_type !== 'anthology') throw new Error('expected anthology');
    const view = buildAnthologyView(block, { data, mode: 'student' });
    expect([...view.querySelectorAll('.block-anthology__groupings button')].map((b) => b.textContent)).toEqual([
      'Themes',
      'Concepts',
      'Texts'
    ]);
    expect(view.querySelector('.block-anthology__stage')).not.toBeNull();
    expect(view.querySelector('.block-anthology__count')?.textContent).toBe('3 notes · 2 texts');
  });
});
