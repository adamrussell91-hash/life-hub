import { describe, expect, it } from 'vitest';
import { conceptContent, createConceptMapView } from '../../../../packages/problem-solver/render/concept-map';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} full answer text`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = []): PsToolRun => ({ id: 'r', tool: 'concept_map', status: 'active', nodes, edges });

describe('Concept map adapter', () => {
  it('makes the theme the root and alternates concept colours', () => {
    const content = conceptContent(run([node('t', 'theme', { title: 'Falling yields' }), node('a', 'concept:1', { title: 'Soil' }), node('b', 'concept:2', { title: 'Water' })]));
    expect(content.title).toBe('Falling yields');
    expect(content.nodes.map((n) => [n.id, n.label, n.parent_id, n.color])).toEqual([
      ['t', 'Falling yields', null, 'peach'],
      ['a', 'Soil', 't', 'blue'],
      ['b', 'Water', 't', 'gold']
    ]);
  });

  it('labels each link kind and sets parents from hierarchical links', () => {
    const content = conceptContent(
      run(
        [node('t', 'theme'), node('a', 'concept:1'), node('b', 'concept:2'), node('c', 'concept:3')],
        [
          { from: 't', to: 'a', kind: 'hierarchical' },
          { from: 'a', to: 'b', kind: 'hierarchical' },
          { from: 'b', to: 'c', kind: 'association' },
          { from: 'a', to: 'c', kind: 'cross' }
        ]
      )
    );
    expect(content.nodes.find((n) => n.id === 'b')!.parent_id).toBe('a');
    expect(content.edges.map((e) => [e.from, e.to, e.label])).toEqual([
      ['t', 'a', 'leads to'],
      ['a', 'b', 'leads to'],
      ['b', 'c', 'relates to'],
      ['a', 'c', 'links across']
    ]);
  });

  it('hangs an unlinked concept off the theme', () => {
    const content = conceptContent(run([node('t', 'theme'), node('a', 'concept:1')]));
    expect(content.edges).toEqual([{ id: 'theme:t:a', from: 't', to: 'a', label: 'includes' }]);
  });
});

describe('Concept map view', () => {
  it('renders nothing for an empty run', () => {
    const view = createConceptMapView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-cmap__stage')).toBeNull();
  });

  it('draws the map and lists the theme first, then concepts', () => {
    const view = createConceptMapView();
    view.update(run([node('a', 'concept:1', { title: 'Soil' }), node('t', 'theme', { title: 'Yields' })]));
    expect(view.el.querySelector('.ps-cmap__stage .graph-svg')).not.toBeNull();
    expect([...view.el.querySelectorAll('[data-node]')].map((n) => n.getAttribute('data-node'))).toEqual(['t', 'a']);
    expect(view.el.querySelector('[data-node="t"]')!.classList.contains('ps-cmap__item--red')).toBe(true);
    expect(view.el.querySelector('[data-node="a"]')!.classList.contains('ps-cmap__item--blue')).toBe(true);
  });

  it('marks a contested concept in its pill and keeps identity across updates', () => {
    const view = createConceptMapView();
    const nodes = [node('t', 'theme'), node('a', 'concept:1', { state: 'contested', objection: 'Guess?' })];
    view.update(run(nodes));
    const first = view.el.querySelector('[data-node="a"]');
    view.update(run([...nodes, node('b', 'concept:2')]));
    expect(view.el.querySelector('[data-node="a"]')).toBe(first);
    expect(view.el.querySelector('[data-node="a"] .ps-objection')!.getAttribute('title')).toBe('Guess?');
    expect(view.el.querySelector('[data-node="b"]')!.classList.contains('ps-cmap__item--yellow')).toBe(true);
  });

  it('opens one details card at a time', () => {
    const view = createConceptMapView();
    view.update(run([node('t', 'theme'), node('a', 'concept:1')]));
    const button = (id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
    button('t').click();
    button('a').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button('t').getAttribute('aria-expanded')).toBe('false');
    expect(button('a').getAttribute('aria-expanded')).toBe('true');
  });
});
