import { describe, expect, it } from 'vitest';
import type { AnthologyData, AnthologyItem } from '@/blocks/anthology-collect';
import { factConnections, noteConnections, searchAnthology, sharedTags } from '@/blocks/anthology-connections';
import type { KnowledgeApi, KnowledgeItem } from '@/blocks/anthology-knowledge';
import { buildAnthologyView } from '@/blocks/anthology-view';
import { createBlock } from '@/blocks/create-block';

function note(block: string, id: string, themes: string[], technique?: string, concepts: string[] = []): AnthologyItem {
  return {
    lesson_id: `lesson_${block}`,
    lesson_title: `Lesson ${block}`,
    block_id: block,
    annotation_id: id,
    quote: `quote  ${id}\nline`,
    note: `effect of ${id}`,
    line_number: 3,
    layer_name: 'General Notes',
    ...(technique ? { technique_id: technique } : {}),
    themes,
    concepts
  };
}

function fact(id: string, themes: string[], extra: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return { id, title: `Fact ${id}`, quote: `line ${id}`, info: `info ${id}`, themes, concepts: [], created_at: '2026-11-01', ...extra };
}

const data: AnthologyData = {
  items: [
    note('river', 'r1', ['Floods', 'Love'], 'metaphor'),
    note('river', 'r2', ['Love'], 'metaphor'),
    note('road', 'o1', ['Floods'], 'metaphor'),
    note('road', 'o2', ['love'], 'simile'),
    note('road', 'o3', ['Country'])
  ],
  texts: [
    { lesson_id: 'lesson_river', block_id: 'river', title: 'River Poem', fingerprint: {}, text_included: true },
    { lesson_id: 'lesson_road', block_id: 'road', title: 'Road Poem', fingerprint: {}, text_included: true }
  ]
};

const names = (id: string) => ({ metaphor: 'Metaphor', simile: 'Simile' })[id];

const knowledge = [
  fact('k1', ['Floods']),
  fact('k2', ['Floods', 'Love']),
  fact('k3', ['Country']),
  fact('k4', ['Love'], { status: 'hidden' })
];

describe('anthology connections', () => {
  it('matches tags without caring about case', () => {
    expect(sharedTags({ themes: ['Love', 'Floods'], concepts: [] }, { themes: ['love'], concepts: [] })).toEqual(['Love']);
  });

  it('sets a note out as an anatomy-table row', () => {
    const links = noteConnections(data.items[0]!, data, knowledge, names);
    expect(links.row).toEqual({
      poem: 'River Poem',
      technique: 'Metaphor',
      quote: 'quote r1 line',
      line: 3,
      effect: 'effect of r1'
    });
  });

  it('finds shown class facts on the same themes, most shared first, for So… why?', () => {
    const links = noteConnections(data.items[0]!, data, knowledge, names);
    expect(links.facts.map((row) => [row.item.id, row.shared])).toEqual([
      ['k2', ['Floods', 'Love']],
      ['k1', ['Floods']]
    ]);
  });

  it('finds the same technique in other poems only, and keeps them out of same idea', () => {
    const links = noteConnections(data.items[0]!, data, knowledge, names);
    expect(links.sameTechnique.map((row) => row.item.annotation_id)).toEqual(['o1']);
    expect(links.sameIdea.map((row) => [row.item.annotation_id, row.technique, row.shared])).toEqual([['o2', 'Simile', ['love']]]);
  });

  it('leaves same technique empty when the note has no technique', () => {
    const links = noteConnections(data.items[4]!, data, knowledge, names);
    expect(links.row.technique).toBe('');
    expect(links.sameTechnique).toEqual([]);
  });

  it('shows a fact the poem notes it helps explain, and other facts on its tags', () => {
    const links = factConnections(knowledge[0]!, data, knowledge, names);
    expect(links.notes.map((row) => `${row.poem}:${row.item.annotation_id}`)).toEqual(['River Poem:r1', 'Road Poem:o1']);
    expect(links.facts.map((row) => row.item.id)).toEqual(['k2']);
  });

  it('searches notes by poem, technique and words, and shown facts', () => {
    expect(searchAnthology('road metaphor', data, knowledge, names).map((hit) => hit.item.title ?? '')).toHaveLength(1);
    expect(searchAnthology('metaphor', data, knowledge, names).filter((hit) => hit.kind === 'note')).toHaveLength(3);
    expect(searchAnthology('info k', data, knowledge, names).map((hit) => (hit.kind === 'fact' ? hit.item.id : ''))).toEqual([
      'k1',
      'k2',
      'k3'
    ]);
    expect(searchAnthology('  ', data, knowledge, names)).toEqual([]);
  });
});

describe('connections panel', () => {
  const api: KnowledgeApi = {
    teacher: false,
    list: async () => knowledge.filter((row) => row.status !== 'hidden'),
    add: async () => ({ item: knowledge[0]!, status: 'shown' })
  };
  const view = () => {
    const block = createBlock('anthology', 'anth_1');
    if (block.block_type !== 'anthology') throw new Error('expected anthology');
    return buildAnthologyView(block, { data, mode: 'student', knowledge: api });
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('sits beside the map and invites a click before anything is chosen', () => {
    const root = view();
    expect(root.querySelector('.block-anthology__body > .block-anthology__panel')).not.toBeNull();
    expect(root.querySelector('.block-anthology__panel')?.textContent).toContain('Click a dot, or search');
  });

  it('lists search matches, and a match opens its table row and links', async () => {
    const root = view();
    await settle();
    const search = root.querySelector<HTMLInputElement>('.block-anthology__search')!;
    search.value = 'road';
    search.dispatchEvent(new Event('input'));
    const panel = root.querySelector('.block-anthology__panel')!;
    expect(panel.textContent).toContain('Matches for “road” (3)');
    panel.querySelector<HTMLButtonElement>('.block-anthology__link')!.click();
    expect(panel.textContent).toContain('Your table row');
    expect(panel.querySelector('.block-anthology__row')?.textContent).toContain('Road Poem');
    expect(panel.textContent).toContain('So… why? Class facts that fit (2)');
    panel.querySelector<HTMLButtonElement>('.block-anthology__link--fact')!.click();
    expect(panel.textContent).toContain('Poem notes this fact helps explain');
    [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Back to matches')!.click();
    expect(panel.textContent).toContain('Matches for “road”');
  });
});
