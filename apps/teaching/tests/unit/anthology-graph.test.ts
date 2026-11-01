import { describe, expect, it, vi } from 'vitest';
import type { AnthologyData, AnthologyItem } from '@/blocks/anthology-collect';
import { anthologyMapItems, anthologyNoteId, buildAnthologyGraph } from '@/blocks/anthology-graph';
import { buildAnthologyView, mountWhileConnected } from '@/blocks/anthology-view';
import { createBlock } from '@/blocks/create-block';
import {
  CLASS_KNOWLEDGE_TEXT,
  isKnowledgeNoteId,
  knowledgeNoteId,
  unitTagChoices,
  type KnowledgeApi,
  type KnowledgeItem
} from '@/blocks/anthology-knowledge';

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

  it('keeps the floating note card hidden until a dot is chosen', () => {
    const block = createBlock('anthology', 'anth_1');
    if (block.block_type !== 'anthology') throw new Error('expected anthology');
    const view = buildAnthologyView(block, { data, mode: 'student' });
    const pop = view.querySelector<HTMLElement>('.block-anthology__map .block-anthology__pop');
    expect(pop?.hidden).toBe(true);
  });
});

describe('map mount', () => {
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('starts the map again when the block is moved back onto the page', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const stop = vi.fn();
    const mount = vi.fn(() => stop);
    mountWhileConnected(host, mount);
    await nextFrame();
    expect(mount).toHaveBeenCalledTimes(1);

    host.remove();
    await settle();
    expect(stop).toHaveBeenCalledTimes(1);

    document.body.append(host);
    await settle();
    expect(mount).toHaveBeenCalledTimes(2);
    host.remove();
    await settle();
  });
});

const knowledge: KnowledgeItem[] = [
  {
    id: 'k1aa00-0000aaaa',
    title: 'Rain as renewal',
    quote: 'An invented article line.',
    info: 'Invented info.',
    themes: ['Hope'],
    concepts: [],
    created_at: '2026-10-31T00:00:00.000Z'
  }
];

describe('class knowledge on the map', () => {
  it('adds knowledge dots under the same theme hubs, named by title', () => {
    const graph = buildAnthologyGraph(data, 'theme', knowledge);
    const dot = graph.nodes.find((node) => node.pageId === knowledgeNoteId('k1aa00-0000aaaa'));
    expect(dot?.label).toBe('Rain as renewal');
    expect(dot?.hubLabels).toEqual(['Hope']);
    expect(isKnowledgeNoteId(dot!.pageId!)).toBe(true);
  });

  it('puts knowledge under one Class knowledge hub when grouped by text', () => {
    const hubs = buildAnthologyGraph(data, 'poem', knowledge)
      .nodes.filter((node) => node.kind === 'major')
      .map((node) => node.label);
    expect(hubs).toContain(CLASS_KNOWLEDGE_TEXT);
  });

  it('leaves the map unchanged with no knowledge', () => {
    expect(buildAnthologyGraph(data, 'theme', []).nodes.length).toBe(buildAnthologyGraph(data, 'theme').nodes.length);
  });

  it("offers only the unit's own themes and concepts", () => {
    expect(unitTagChoices(data)).toEqual({ themes: ['Country', 'Hope'], concepts: ['Style'] });
  });
});

function fakeApi(teacher: boolean, items = knowledge): KnowledgeApi & { added: unknown[] } {
  const added: unknown[] = [];
  return {
    teacher,
    added,
    list: async () => items,
    add: async (draft) => {
      added.push(draft);
      return { item: { ...items[0]!, title: draft.title }, status: 'shown' };
    },
    moderate: teacher ? async () => {} : undefined
  };
}

describe('class knowledge view', () => {
  const anthology = () => {
    const block = createBlock('anthology', 'anth_1');
    if (block.block_type !== 'anthology') throw new Error('expected anthology');
    return block;
  };
  const pressed = (view: HTMLElement) =>
    view.querySelector('.block-anthology__layers [aria-pressed="true"]')?.textContent;

  it('opens on Class for students and Teacher for the teacher', () => {
    expect(pressed(buildAnthologyView(anthology(), { data, mode: 'student', knowledge: fakeApi(false) }))).toBe('Class');
    expect(pressed(buildAnthologyView(anthology(), { data, mode: 'teacher', knowledge: fakeApi(true) }))).toBe('Teacher');
  });

  it('has no switch when there is no class map', () => {
    expect(buildAnthologyView(anthology(), { data, mode: 'student' }).querySelector('.block-anthology__layers')).toBeNull();
  });

  it('the Add card offers only the unit tags and refuses a send with none picked', async () => {
    const api = fakeApi(false);
    const view = buildAnthologyView(anthology(), { data, mode: 'student', knowledge: api });
    view.querySelector<HTMLButtonElement>('.block-anthology__add')!.click();
    const form = view.querySelector<HTMLFormElement>('.block-anthology__add-form')!;
    expect([...form.querySelectorAll('.block-anthology__tag')].map((b) => b.textContent)).toEqual([
      'Country',
      'Hope',
      'Style'
    ]);
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'An idea';
    form.querySelector<HTMLTextAreaElement>('[name="quote"]')!.value = 'An invented line.';
    form.querySelector<HTMLInputElement>('[name="initials"]')!.value = 'ab';
    form.requestSubmit();
    await Promise.resolve();
    expect(api.added).toHaveLength(0);
    expect(form.querySelector('.block-anthology__add-error')?.textContent).toMatch(/theme or concept/);
    form.querySelector<HTMLButtonElement>('.block-anthology__tag')!.click();
    form.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.added).toEqual([
      { title: 'An idea', quote: 'An invented line.', info: '', themes: ['Country'], concepts: [], initials: 'AB' }
    ]);
  });

  it("a student's own addition shows at once, even while the server list lags", async () => {
    const api = fakeApi(false, []);
    const view = buildAnthologyView(anthology(), { data, mode: 'student', knowledge: api });
    view.querySelector<HTMLButtonElement>('.block-anthology__add')!.click();
    const form = view.querySelector<HTMLFormElement>('.block-anthology__add-form')!;
    api.add = async (draft) => ({ item: { ...knowledge[0]!, title: draft.title }, status: 'shown' });
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'An idea';
    form.querySelector<HTMLTextAreaElement>('[name="quote"]')!.value = 'An invented line.';
    form.querySelector<HTMLInputElement>('[name="initials"]')!.value = 'TT2';
    form.querySelector<HTMLButtonElement>('.block-anthology__tag')!.click();
    form.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.querySelector('.block-anthology__count')?.textContent).toBe('3 notes · 2 texts · 1 from the class');
  });

  it('counts the class additions on the Class tab', async () => {
    const view = buildAnthologyView(anthology(), { data, mode: 'student', knowledge: fakeApi(false) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.querySelector('.block-anthology__count')?.textContent).toBe('3 notes · 2 texts · 1 from the class');
  });
});

