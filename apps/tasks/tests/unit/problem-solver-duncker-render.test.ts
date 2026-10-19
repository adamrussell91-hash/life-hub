import { describe, expect, it } from 'vitest';
import { createDunckerView } from '../../../../packages/problem-solver/render/duncker';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'duncker', status: 'active', nodes, edges, ...extra });
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
const under = (from: string, to: string): PsEdge => ({ from, to, kind: 'under' });

const problem = node('p', 'problem');
const desired = node('d', 'desired');
const direct1 = node('pa1', 'pathway:1', { tag: 'direct' });
const direct2 = node('pa2', 'pathway:2', { tag: 'direct' });
const opposite = node('pa3', 'pathway:3', { tag: 'opposite' });
const sol1 = node('so1', 'solution:1');
const sol2 = node('so2', 'solution:2');
const sol3 = node('so3', 'solution:3');
const redefinition = node('rd', 'redefinition');
const evaluation = node('ev', 'evaluation', { text: 'The opposite path wins: cheaper and it still reaches the desired state.' });

describe('Duncker diagram view', () => {
  it('renders nothing for an empty run', () => {
    const view = createDunckerView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-duncker__chart')).toBeNull();
    expect(view.el.querySelector('[data-family]')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Duncker diagram');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createDunckerView();
    view.update(run([problem, desired, direct1]));
    const item = view.el.querySelector('[data-node="pa1"]');
    const box = button(view, 'pa1');
    const chart = view.el.querySelector('.ps-duncker__chart');
    view.update(run([problem, desired, direct1, opposite, sol1], [under('so1', 'pa1')]));
    expect(view.el.querySelector('[data-node="pa1"]')).toBe(item);
    expect(button(view, 'pa1')).toBe(box);
    expect(view.el.querySelector('.ps-duncker__chart')).toBe(chart);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createDunckerView();
    view.update(run([problem, node('pa1', 'pathway:1', { tag: 'direct', state: 'contested', objection: 'Is that a pathway or a solution?' })]));
    const item = view.el.querySelector('[data-node="pa1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(view.el.querySelector('[data-node="p"]')!.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that a pathway or a solution?');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Is that a pathway or a solution?');
  });

  it('opens one details card at a time', () => {
    const view = createDunckerView();
    view.update(run([problem, desired, direct1]));
    button(view, 'p').click();
    expect(view.el.querySelector('[data-node="p"]')!.classList.contains('is-open')).toBe(true);
    button(view, 'pa1').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['pa1']);
    expect(button(view, 'p').getAttribute('aria-expanded')).toBe('false');
    const card = view.el.querySelector(`#${button(view, 'pa1').getAttribute('aria-controls')}`)!;
    expect(card.classList.contains('is-open')).toBe(true);
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
  });

  it('shows the short title in the box and the full answer only in details', () => {
    const view = createDunckerView();
    view.update(run([node('p', 'problem', { title: 'Late buses', text: 'The school bus arrives after the bell twice a week.' })]));
    expect(view.el.querySelector('[data-node="p"] .ps-duncker__title')!.textContent).toBe('Late buses');
    expect(button(view, 'p').textContent).not.toContain('after the bell');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('after the bell'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('puts direct pathways under the direct family and opposite ones under the opposite family', () => {
    const view = createDunckerView();
    view.update(run([problem, desired, direct1, opposite]));
    expect(view.el.querySelector('[data-family="direct"] [data-node="pa1"]')).not.toBeNull();
    expect(view.el.querySelector('[data-family="opposite"] [data-node="pa3"]')).not.toBeNull();
    expect(view.el.querySelector('[data-family="direct"] [data-node="pa3"]')).toBeNull();
    // Book order: the opposite family on the left, so first in reading order.
    expect([...view.el.querySelectorAll('[data-family]')].map((el) => el.getAttribute('data-family'))).toEqual(['opposite', 'direct']);
  });

  it('puts a solution inside its pathway group', () => {
    const view = createDunckerView();
    view.update(run([problem, desired, direct1, direct2, sol1, sol2], [under('so1', 'pa2'), under('so2', 'pa1')]));
    expect(view.el.querySelector('[data-pathway="pa2"] [data-node="so1"]')).not.toBeNull();
    expect(view.el.querySelector('[data-pathway="pa1"] [data-node="so2"]')).not.toBeNull();
    expect(view.el.querySelector('[data-pathway="pa1"] [data-node="so1"]')).toBeNull();
    // Solutions are numbered within their pathway.
    expect(view.el.querySelector('[data-node="so1"] .ps-duncker__meta')!.textContent).toBe('Solution 1');
  });

  it('places the desired state in the bottom region, after the pathways', () => {
    const view = createDunckerView();
    view.update(run([problem, desired, direct1, sol1], [under('so1', 'pa1')]));
    expect(view.el.querySelector('[data-region="bottom"] [data-node="d"]')).not.toBeNull();
    const order = [...view.el.querySelectorAll('[data-node]')].map((el) => el.getAttribute('data-node'));
    expect(order).toEqual(['p', 'pa1', 'so1', 'd']);
  });

  it('shows a family only once a pathway with its tag exists', () => {
    const view = createDunckerView();
    view.update(run([problem, desired]));
    expect(view.el.querySelector('[data-family]')).toBeNull();
    view.update(run([problem, desired, direct1]));
    expect(view.el.querySelector('[data-family="direct"]')).not.toBeNull();
    expect(view.el.querySelector('[data-family="opposite"]')).toBeNull();
    view.update(run([problem, desired, direct1, opposite]));
    expect(view.el.querySelector('[data-family="opposite"]')).not.toBeNull();
  });

  it('puts the redefinition bottom left, before the desired state', () => {
    const view = createDunckerView();
    view.update(run([problem, desired, opposite, redefinition]));
    const bottom = view.el.querySelector('[data-region="bottom"]')!;
    expect([...bottom.querySelectorAll('[data-node]')].map((el) => el.getAttribute('data-node'))).toEqual(['rd', 'd']);
    expect(bottom.querySelector('[data-node="rd"]')!.classList.contains('ps-duncker__item--redefinition')).toBe(true);
  });

  it('shows the evaluation in full in a card under the diagram', () => {
    const view = createDunckerView();
    view.update(run([problem, desired, direct1, opposite, sol1, sol2, evaluation], [under('so1', 'pa1'), under('so2', 'pa3')]));
    const card = view.el.querySelector('[data-region="evaluation"] [data-node="ev"]')!;
    expect(card.textContent).toContain('The opposite path wins');
    expect(view.el.lastElementChild!.contains(card)).toBe(true);
  });

  it('draws a connector per parent link, top down, and drops it with its node', () => {
    const view = createDunckerView();
    view.update(run([problem, desired, direct1, opposite, sol1], [under('so1', 'pa1')]));
    const keys = [...view.el.querySelectorAll('[data-link]')].map((el) => el.getAttribute('data-link')).sort();
    expect(keys).toEqual(['family:direct', 'family:opposite', 'pathway:pa1', 'pathway:pa3', 'solution:so1']);
    // Undo the opposite pathway: its pathway, its family and their connectors all go.
    view.update(run([problem, desired, direct1, sol1], [under('so1', 'pa1')]));
    expect(view.el.querySelector('[data-node="pa3"]')).toBeNull();
    expect(view.el.querySelector('[data-family="opposite"]')).toBeNull();
    expect(view.el.querySelector('[data-link="family:opposite"]')).toBeNull();
    expect(view.el.querySelector('[data-link="pathway:pa3"]')).toBeNull();
  });

  it('removes an undone node with its details card, and the chart once the run is empty', () => {
    const view = createDunckerView();
    view.update(run([problem, desired, direct1]));
    button(view, 'pa1').click();
    const id = button(view, 'pa1').getAttribute('aria-controls')!;
    view.update(run([problem, desired]));
    expect(view.el.querySelector('[data-node="pa1"]')).toBeNull();
    expect(view.el.querySelector(`#${id}`)).toBeNull();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(0);
    view.update(run([]));
    expect(view.el.querySelector('.ps-duncker__chart')).toBeNull();
  });

  it('moves a pathway to the other family when its tag changes, keeping its element', () => {
    const view = createDunckerView();
    view.update(run([problem, direct1]));
    const item = view.el.querySelector('[data-node="pa1"]');
    view.update(run([problem, node('pa1', 'pathway:1', { tag: 'opposite' })]));
    expect(view.el.querySelector('[data-family="opposite"] [data-node="pa1"]')).toBe(item);
    expect(view.el.querySelector('[data-family="direct"]')).toBeNull();
  });
});
