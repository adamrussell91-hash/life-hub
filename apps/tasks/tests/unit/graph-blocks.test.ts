import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { BlockSchema } from '@/schemas/block';
import type { Block } from '@/schemas/block';
import { buildTree, colourOf, modeOf, withParents, type GraphContent } from '../../../../packages/graph-blocks/graph';

type MindBlock = Extract<Block, { block_type: 'mind_map' }>;
type ConceptBlock = Extract<Block, { block_type: 'concept_map' }>;

function mindBlock(content?: Partial<MindBlock['content']>): MindBlock {
  const block = createBlock('mind_map', 'm1') as MindBlock;
  return { ...block, content: { ...block.content, ...content } };
}

function conceptBlock(content?: Partial<ConceptBlock['content']>): ConceptBlock {
  const block = createBlock('concept_map', 'c1') as ConceptBlock;
  return { ...block, content: { ...block.content, ...content } };
}

function mountEditor<T extends Block>(block: T) {
  let latest = block;
  const host = document.createElement('div');
  document.body.append(host);
  host.append(
    createBlockEditor(block, (next) => {
      latest = next as T;
    })
  );
  return { host, latest: () => latest };
}

const key = (target: Element, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

const pointer = (target: Element, type: string, init: PointerEventInit = {}) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...init }));

function phoneViewport(phone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: phone && query.includes('max-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {}
      }) as unknown as MediaQueryList
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('graph model', () => {
  it('re-parents orphans and cycles onto the root and keeps outline order', () => {
    const root = buildTree([
      { id: 'a', label: 'A', parent_id: null },
      { id: 'c', label: 'C', parent_id: 'gone' },
      { id: 'b', label: 'B', parent_id: 'a' },
      { id: 'x', label: 'X', parent_id: 'y' },
      { id: 'y', label: 'Y', parent_id: 'x' }
    ])!;
    expect(root.id).toBe('a');
    const ids = (n: typeof root): string[] => [n.id, ...n.kids.flatMap(ids)];
    expect(ids(root).sort()).toEqual(['a', 'b', 'c', 'x', 'y']);
    expect(root.kids.map((k) => k.id)).toEqual(['c', 'b', 'x']);
  });

  it('reads parents from edges when a generated mind map leaves parent_id out', () => {
    const content = withParents('mind', {
      nodes: [
        { id: 'r', label: 'Cheese' },
        { id: 'a', label: 'Soft' },
        { id: 'b', label: 'Brie' }
      ],
      edges: [
        { id: 'e1', from: 'r', to: 'a' },
        { id: 'e2', from: 'a', to: 'b' }
      ]
    });
    expect(content.nodes.map((n) => n.parent_id ?? null)).toEqual([null, 'r', 'a']);
    const { latest } = mountEditor(mindBlock(content));
    const row = document.querySelectorAll<HTMLInputElement>('.graph-outline__input')[2]!;
    expect(row.closest<HTMLElement>('.graph-outline__row')!.dataset.d).toBe('2');
    row.value = 'Camembert';
    row.dispatchEvent(new Event('input'));
    expect(latest().content.nodes[2]).toMatchObject({ label: 'Camembert', parent_id: 'a' });
  });

  it('opens fully placed concept maps on the canvas and everything else as an outline', () => {
    const placed: GraphContent = { nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }], edges: [] };
    expect(modeOf('concept', placed)).toBe('canvas');
    expect(modeOf('mind', placed)).toBe('outline');
    expect(modeOf('concept', { nodes: [{ id: 'a', label: 'A' }], edges: [] })).toBe('outline');
    expect(modeOf('concept', { ...placed, mode: 'outline' })).toBe('outline');
  });

  it('reads Teaching’s old swatch hex values as kit colours', () => {
    expect(colourOf('#DCEAFA')).toBe('blue');
    expect(colourOf('sage')).toBe('sage');
    expect(colourOf('#123456')).toBeUndefined();
  });

  it('keeps mode, colour and position through the Tasks block schema', () => {
    const parsed = BlockSchema.parse(
      mindBlock({ mode: 'canvas', nodes: [{ id: 'r', label: 'Root', parent_id: null, color: 'peach', x: 4, y: -8 }] })
    ) as MindBlock;
    expect(parsed.content.mode).toBe('canvas');
    expect(parsed.content.nodes[0]).toMatchObject({ color: 'peach', x: 4, y: -8 });
  });
});

describe('mind map outline', () => {
  it('builds the tree from the keyboard', () => {
    const { host, latest } = mountEditor(mindBlock());
    const inputs = () => [...host.querySelectorAll<HTMLInputElement>('.graph-outline__input')];
    expect(inputs().map((i) => i.value)).toEqual(['Centre', 'Idea 1', 'Idea 2']);

    key(inputs()[1]!, 'Enter');
    expect(inputs()).toHaveLength(4);
    inputs()[2]!.value = 'Detail';
    inputs()[2]!.dispatchEvent(new Event('input'));
    key(inputs()[2]!, 'Tab');
    let nodes = latest().content.nodes;
    expect(nodes.find((n) => n.label === 'Detail')?.parent_id).toBe('m1_n2');
    expect(host.querySelectorAll('.graph-stage .graph-svg__node')).toHaveLength(4);

    key(inputs()[2]!, 'Tab', { shiftKey: true });
    nodes = latest().content.nodes;
    expect(nodes.find((n) => n.label === 'Detail')?.parent_id).toBe('m1_n1');

    inputs()[2]!.value = '';
    inputs()[2]!.dispatchEvent(new Event('input'));
    key(inputs()[2]!, 'Backspace');
    expect(latest().content.nodes.map((n) => n.label)).toEqual(['Centre', 'Idea 1', 'Idea 2']);
    expect(latest().content.mode).toBe('outline');
  });

  it('does not trap Tab when the line cannot move in', () => {
    const { host } = mountEditor(mindBlock());
    const first = host.querySelector<HTMLInputElement>('.graph-outline__input')!;
    expect(key(first, 'Tab')).toBe(true);
  });
});

describe('concept map outline', () => {
  it('writes links as sentences and keeps them valid when concepts go', () => {
    const { host, latest } = mountEditor(conceptBlock());
    (host.querySelector('.graph-concepts__add') as HTMLButtonElement).click();
    const third = host.querySelectorAll<HTMLInputElement>('.graph-concept__input')[2]!;
    third.value = 'Memory';
    third.dispatchEvent(new Event('input'));

    (host.querySelector('.graph-outline__foot .btn') as HTMLButtonElement).click();
    const edges = latest().content.edges;
    expect(edges).toHaveLength(2);
    expect(edges[1]).toMatchObject({ from: 'c1_n1', to: 'c1_n3' });
    expect(edges[1]!.label).toBeUndefined();

    const swap = host.querySelectorAll<HTMLButtonElement>('.graph-link__swap')[1]!;
    swap.click();
    expect(latest().content.edges[1]).toMatchObject({ from: 'c1_n3', to: 'c1_n1' });

    host.querySelectorAll<HTMLButtonElement>('.graph-concept [data-act="del"]')[2]!.click();
    expect(latest().content.nodes).toHaveLength(2);
    expect(latest().content.edges).toHaveLength(1);
  });

  it('picks link ends from a menu instead of a native select', () => {
    const { host, latest } = mountEditor(conceptBlock());
    expect(host.querySelector('select.graph-link__pick, .graph-link select')).toBeNull();
    (host.querySelector('.graph-link__pick[data-end="to"]') as HTMLButtonElement).click();
    const items = [...document.querySelectorAll<HTMLButtonElement>('.graph-menu .graph-menu__item')];
    expect(items.map((i) => i.textContent)).toEqual(['Concept A', 'Concept B']);
    items[0]!.click();
    expect(document.querySelector('.graph-menu')).toBeNull();
    expect(latest().content.edges[0]).toMatchObject({ from: 'c1_n1', to: 'c1_n1' });
  });
});

describe('canvas mode', () => {
  it('adds, removes and tidies ideas on the mind map canvas', () => {
    phoneViewport(false);
    let clock = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
    const { host, latest } = mountEditor(mindBlock({ mode: 'canvas' }));
    const canvas = host.querySelector<HTMLElement>('.graph-canvas')!;
    expect(canvas).not.toBeNull();
    expect(host.querySelector('.graph-block__modes [data-mode="canvas"]')?.getAttribute('aria-pressed')).toBe('true');

    pointer(canvas.querySelector('[data-id="m1_n2"]')!, 'pointerdown');
    pointer(canvas.querySelector('svg')!, 'pointerup');
    expect(canvas.querySelector('[data-id="m1_n2"]')?.classList.contains('is-selected')).toBe(true);
    expect(canvas.querySelector<HTMLElement>('.graph-float')!.hidden).toBe(false);

    key(canvas, 'Tab');
    expect(latest().content.nodes).toHaveLength(4);
    expect(latest().content.nodes[3]).toMatchObject({ label: 'New idea', parent_id: 'm1_n2' });
    const rename = canvas.querySelector<HTMLInputElement>('.graph-rename')!;
    expect(rename.hidden).toBe(false);
    rename.value = 'Spacing';
    key(rename, 'Enter');
    expect(latest().content.nodes[3]!.label).toBe('Spacing');

    pointer(canvas.querySelector('[data-id="m1_n2"]')!, 'pointerdown', { clientX: 10, clientY: 10 });
    pointer(canvas.querySelector('svg')!, 'pointermove', { clientX: 60, clientY: 40 });
    pointer(canvas.querySelector('svg')!, 'pointerup', { clientX: 60, clientY: 40 });
    expect(latest().content.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);

    (canvas.querySelector('[data-act="tidy"]') as HTMLButtonElement).click();
    expect(latest().content.nodes.some((n) => 'x' in n || 'y' in n)).toBe(false);

    pointer(canvas.querySelector('[data-id="m1_n2"]')!, 'pointerdown');
    pointer(canvas.querySelector('svg')!, 'pointerup');
    key(canvas, 'Delete');
    expect(latest().content.nodes.map((n) => n.id)).toEqual(['m1_n1', 'm1_n3']);
  });

  it('docks the phone sheet above the tab bar and drops it with the editor', () => {
    phoneViewport(true);
    const { host } = mountEditor(conceptBlock({ mode: 'canvas' }));
    const canvas = host.querySelector<HTMLElement>('.graph-canvas')!;
    pointer(canvas.querySelector('[data-id="c1_n1"]')!, 'pointerdown');
    pointer(canvas.querySelector('svg')!, 'pointerup');
    const sheet = document.querySelector<HTMLElement>('.graph-sheet')!;
    expect(sheet.parentElement).toBe(document.body);
    expect(sheet).not.toBeNull();
    const name = sheet.querySelector<HTMLInputElement>('.graph-sheet__name')!;
    expect(name.value).toBe('Concept A');
    expect(sheet.querySelectorAll('[data-part="form-actions"] .btn')).toHaveLength(3);
    expect(sheet.querySelector('.graph-sheet__done')).not.toBeNull();

    host.remove();
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(document.body.querySelector('.graph-sheet')).toBeNull();
        resolve();
      })
    );
  });

  it('links two concepts and asks for the verb', () => {
    phoneViewport(false);
    const { host, latest } = mountEditor(conceptBlock({ mode: 'canvas' }));
    const canvas = host.querySelector<HTMLElement>('.graph-canvas')!;
    pointer(canvas.querySelector('[data-id="c1_n2"]')!, 'pointerdown');
    pointer(canvas.querySelector('svg')!, 'pointerup');
    (canvas.querySelector('.graph-float [data-act="link"]') as HTMLButtonElement).click();
    pointer(canvas.querySelector('[data-id="c1_n1"]')!, 'pointerdown');
    expect(latest().content.edges).toHaveLength(2);
    expect(latest().content.edges[1]).toMatchObject({ from: 'c1_n2', to: 'c1_n1' });
    const verbs = canvas.querySelector<HTMLElement>('.graph-verbs')!;
    expect(verbs.hidden).toBe(false);
    (verbs.querySelector('[data-verb="causes"]') as HTMLButtonElement).click();
    expect(latest().content.edges[1]!.label).toBe('causes');
  });
});

describe('read-only view', () => {
  it('draws with the mode the block was built in', () => {
    const outline = renderBlock(mindBlock(), 'student');
    const canvas = renderBlock(mindBlock({ mode: 'canvas' }), 'student');
    expect(outline.querySelector('.block-mind-map__map svg.graph-svg')).not.toBeNull();
    expect(canvas.querySelector('.block-mind-map__map svg.graph-svg')).not.toBeNull();
    expect(outline.querySelector('.graph-svg path')?.getAttribute('d')).toMatch(/ C/);
    expect(canvas.querySelector('.graph-svg path')?.getAttribute('d')).toMatch(/Z$/);
    expect(canvas.querySelector('.graph-svg__handle, .graph-svg__port')).toBeNull();
  });

  it('opens a full screen view that Escape closes', () => {
    const el = renderBlock(conceptBlock(), 'student');
    document.body.append(el);
    (el.querySelector('.graph-stage__expand') as HTMLButtonElement).click();
    expect(document.querySelector('.graph-full[role="dialog"] svg.graph-svg')).not.toBeNull();
    key(document.body, 'Escape');
    expect(document.querySelector('.graph-full')).toBeNull();
  });
});
