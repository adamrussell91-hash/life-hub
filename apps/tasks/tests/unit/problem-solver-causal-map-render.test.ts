import { describe, expect, it } from 'vitest';
import { createCausalMapView } from '../../../../packages/problem-solver/render/causal-map';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'causal_map', status: 'active', nodes, edges, ...extra });
const ids = (el: Element) => [...el.querySelectorAll('[data-node]')].map((n) => n.getAttribute('data-node'));
const region = (view: { el: HTMLElement }, name: string) => view.el.querySelector(`[data-region="${name}"]`)!;
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;

const full = [node('p', 'problem'), node('c1', 'cause:1'), node('c2', 'cause:2'), node('i1', 'influence:1'), node('i2', 'influence:2')];

describe('Causal map view', () => {
  it('renders no shapes and no frame for an empty run', () => {
    const view = createCausalMapView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('[data-region]')).toBeNull();
    expect(view.el.querySelector('svg')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Causal map');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createCausalMapView();
    view.update(run([node('p', 'problem'), node('c1', 'cause:1')]));
    const problem = view.el.querySelector('[data-node="p"]');
    const cause = view.el.querySelector('[data-node="c1"]');
    view.update(run(full));
    expect(view.el.querySelector('[data-node="p"]')).toBe(problem);
    expect(view.el.querySelector('[data-node="c1"]')).toBe(cause);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createCausalMapView();
    view.update(run([node('p', 'problem'), node('c1', 'cause:1', { state: 'contested', objection: 'That is a symptom.' })]));
    const item = view.el.querySelector('[data-node="c1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('That is a symptom.');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('That is a symptom.');
  });

  it('opens one details card at a time', () => {
    const view = createCausalMapView();
    view.update(run(full));
    const card = (id: string) => view.el.querySelector(`#${button(view, id).getAttribute('aria-controls')}`)!;
    button(view, 'c1').click();
    expect(view.el.querySelector('[data-node="c1"]')!.classList.contains('is-open')).toBe(true);
    expect(card('c1').classList.contains('is-open')).toBe(true);
    button(view, 'i2').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['i2']);
    expect(card('c1').classList.contains('is-open')).toBe(false);
    expect(card('i2').classList.contains('is-open')).toBe(true);
    expect(button(view, 'c1').getAttribute('aria-expanded')).toBe('false');
    expect(button(view, 'i2').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the short title in the shape and the full answer only in details', () => {
    const view = createCausalMapView();
    view.update(run([node('p', 'problem', { title: 'Late rota', text: 'The rota goes out two days late every week.' })]));
    expect(view.el.querySelector('[data-node="p"] .ps-causal__title')!.textContent).toBe('Late rota');
    expect(button(view, 'p').textContent).not.toContain('two days late');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('two days late'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('puts the problem, causes and influences in their own regions, in index order', () => {
    const view = createCausalMapView();
    view.update(run([node('i2', 'influence:2'), node('c2', 'cause:2'), node('p', 'problem'), node('c1', 'cause:1'), node('i1', 'influence:1')]));
    expect([...view.el.querySelectorAll('[data-region]')].map((r) => r.getAttribute('data-region'))).toEqual(['problem', 'causes', 'influences']);
    expect(ids(region(view, 'problem'))).toEqual(['p']);
    expect(ids(region(view, 'causes'))).toEqual(['c1', 'c2']);
    expect(ids(region(view, 'influences'))).toEqual(['i1', 'i2']);
    expect(region(view, 'causes').getAttribute('aria-label')).toBe('Causes');
  });

  it('draws one link per edge with its sign and strength', () => {
    const view = createCausalMapView();
    view.update(run(full, [
      { from: 'c1', to: 'p', kind: 'plus' },
      { from: 'c2', to: 'p', kind: 'minus_strong' },
      { from: 'i1', to: 'c1', kind: 'plus_strong' },
      { from: 'i2', to: 'c2', kind: 'minus' }
    ]));
    const links = [...view.el.querySelectorAll('[data-edge]')];
    expect(links.length).toBe(4);
    const of = (key: string) => view.el.querySelector(`[data-edge="${key}"]`)!;
    expect(of('c1:p').getAttribute('data-sign')).toBe('plus');
    expect(of('c1:p').getAttribute('data-strength')).toBe('normal');
    expect(of('c2:p').getAttribute('data-sign')).toBe('minus');
    expect(of('c2:p').getAttribute('data-strength')).toBe('strong');
    expect(of('i1:c1').getAttribute('data-strength')).toBe('strong');
    expect(of('i2:c2').getAttribute('data-sign')).toBe('minus');
    expect(of('c1:p').querySelector('.ps-causal__badge text')!.textContent).toBe('+');
    expect(of('i2:c2').querySelector('.ps-causal__badge text')!.textContent).toBe('−');
  });

  it('shows the legend only once the first link exists', () => {
    const view = createCausalMapView();
    view.update(run(full));
    expect(view.el.querySelector('.ps-causal__legend')).toBeNull();
    view.update(run(full, [{ from: 'c1', to: 'p', kind: 'plus' }]));
    const legend = view.el.querySelector('.ps-causal__legend')!;
    expect(legend.textContent).toContain('makes it more');
    expect(legend.textContent).toContain('makes it less');
    expect(legend.textContent).toContain('Thicker: stronger');
  });

  it('adds a new link on a later update and keeps the existing ones', () => {
    const view = createCausalMapView();
    view.update(run(full, [{ from: 'c1', to: 'p', kind: 'plus' }]));
    const first = view.el.querySelector('[data-edge="c1:p"]');
    view.update(run(full, [{ from: 'c1', to: 'p', kind: 'plus' }, { from: 'i1', to: 'c1', kind: 'minus' }]));
    expect(view.el.querySelectorAll('[data-edge]').length).toBe(2);
    expect(view.el.querySelector('[data-edge="c1:p"]')).toBe(first);
  });

  it('ignores links to nodes that are not drawn and unknown kinds', () => {
    const view = createCausalMapView();
    view.update(run([node('p', 'problem'), node('c1', 'cause:1')], [{ from: 'c9', to: 'p', kind: 'plus' }, { from: 'c1', to: 'p', kind: 'relates' }]));
    expect(view.el.querySelectorAll('[data-edge]').length).toBe(0);
  });
});
