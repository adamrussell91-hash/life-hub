import { describe, expect, it } from 'vitest';
import { createProblemTreeView } from '../../../../packages/problem-solver/render/problem-tree';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} text here`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = []): PsToolRun => ({ id: 'r', tool: 'problem_tree', status: 'active', nodes, edges });
const region = (view: { el: HTMLElement }, name: string) => view.el.querySelector(`[data-region="${name}"]`)!;

describe('Problem tree view', () => {
  it('renders no shapes for an empty run', () => {
    const view = createProblemTreeView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-tree__shape')).toBeNull();
  });

  it('keeps the regions in reading order: effects, trunk, causes, each labelled', () => {
    const view = createProblemTreeView();
    view.update(run([node('t', 'trunk')]));
    const names = [...view.el.querySelectorAll('[data-region]')].map((r) => r.getAttribute('data-region'));
    expect(names).toEqual(['effects', 'trunk', 'causes']);
    expect(region(view, 'effects').getAttribute('aria-label')).toBe('Effects');
    expect(region(view, 'causes').getAttribute('aria-label')).toBe('Causes');
  });

  it('places causes below and effects above the trunk', () => {
    const view = createProblemTreeView();
    view.update(run([node('t', 'trunk'), node('c1', 'cause:1'), node('c2', 'cause:2'), node('e1', 'effect:1')]));
    expect(region(view, 'trunk').querySelector('[data-node="t"]')).not.toBeNull();
    expect([...region(view, 'causes').querySelectorAll('[data-node]')].map((n) => n.getAttribute('data-node'))).toEqual(['c1', 'c2']);
    expect([...region(view, 'effects').querySelectorAll('[data-node]')].map((n) => n.getAttribute('data-node'))).toEqual(['e1']);
  });

  it('draws the background oval only once the first effect exists', () => {
    const view = createProblemTreeView();
    view.update(run([node('t', 'trunk'), node('c1', 'cause:1')]));
    expect(view.el.querySelector('.ps-tree__oval')).toBeNull();
    view.update(run([node('t', 'trunk'), node('c1', 'cause:1'), node('e1', 'effect:1')]));
    expect(view.el.querySelector('.ps-tree__oval')).not.toBeNull();
  });

  it('does not rebuild existing nodes and orders by index', () => {
    const view = createProblemTreeView();
    view.update(run([node('c2', 'cause:2'), node('c1', 'cause:1')]));
    const first = view.el.querySelector('[data-node="c1"]');
    view.update(run([node('c2', 'cause:2'), node('c1', 'cause:1'), node('c3', 'cause:3')]));
    expect(view.el.querySelector('[data-node="c1"]')).toBe(first);
    expect([...region(view, 'causes').querySelectorAll('[data-node]')].map((n) => n.getAttribute('data-node'))).toEqual(['c1', 'c2', 'c3']);
  });

  it('shows a contested tag with the objection, shape left solid', () => {
    const view = createProblemTreeView();
    view.update(run([node('t', 'trunk'), node('c1', 'cause:1', { state: 'contested', objection: 'Symptom, not cause.' })]));
    const item = view.el.querySelector('[data-node="c1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Symptom, not cause.');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Symptom, not cause.');
  });

  it('shows the short title in the shape and the full answer only in details', () => {
    const view = createProblemTreeView();
    view.update(run([node('t', 'trunk', { title: 'Late deliveries', text: 'Deliveries arrive after the window.' })]));
    expect(view.el.querySelector('[data-node="t"] .ps-tree__title')!.textContent).toBe('Late deliveries');
    expect(view.el.querySelector('[data-node="t"] .ps-tree__shape')!.textContent).not.toContain('Deliveries arrive');
  });

  it('opens one details card at a time', () => {
    const view = createProblemTreeView();
    view.update(run([node('t', 'trunk'), node('c1', 'cause:1'), node('e1', 'effect:1')]));
    const button = (id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] .ps-tree__shape`)!;
    const card = (b: HTMLButtonElement) => view.el.querySelector(`#${b.getAttribute('aria-controls')}`)!;
    button('c1').click();
    expect(button('c1').getAttribute('aria-expanded')).toBe('true');
    expect(card(button('c1')).classList.contains('is-open')).toBe(true);
    button('e1').click();
    expect(button('c1').getAttribute('aria-expanded')).toBe('false');
    expect(card(button('c1')).classList.contains('is-open')).toBe(false);
    expect(card(button('e1')).classList.contains('is-open')).toBe(true);
    button('e1').click();
    expect(card(button('e1')).classList.contains('is-open')).toBe(false);
  });

  it('draws one line per relationship and ignores edges to missing nodes', () => {
    const view = createProblemTreeView();
    const nodes = [node('t', 'trunk'), node('c1', 'cause:1'), node('e1', 'effect:1')];
    view.update(run(nodes, [{ from: 'c1', to: 'e1', kind: 'relates' }, { from: 'c1', to: 'gone', kind: 'relates' }]));
    expect(view.el.querySelectorAll('line.ps-tree__edge').length).toBe(1);
    view.update(run(nodes, [{ from: 'c1', to: 'e1', kind: 'relates' }]));
    expect(view.el.querySelectorAll('line.ps-tree__edge').length).toBe(1);
  });
});
