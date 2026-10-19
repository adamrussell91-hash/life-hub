import { describe, expect, it } from 'vitest';
import { createFromToView } from '../../../../packages/problem-solver/render/from-to';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'from_to', status: 'active', nodes, edges, ...extra });
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;

const row1 = [node('a1', 'aspect:1'), node('t1', 'trend:1', { tag: 'growing' }), node('f1', 'from:1'), node('o1', 'to:1')];

describe('From…to view', () => {
  it('renders no cells and no field for an empty run', () => {
    const view = createFromToView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-fromto__field')).toBeNull();
    expect(view.el.querySelector('.ps-fromto__head')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('From…to exploration');
  });

  it('draws the blue field and four red headers with the first aspect', () => {
    const view = createFromToView();
    view.update(run([node('a1', 'aspect:1')]));
    expect(view.el.querySelector('.ps-fromto__field')).not.toBeNull();
    expect([...view.el.querySelectorAll('.ps-fromto__head-cell')].map((el) => el.textContent)).toEqual(['Aspect', 'Trend', 'From…', 'To']);
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createFromToView();
    view.update(run([node('a1', 'aspect:1'), node('t1', 'trend:1', { tag: 'stable' })]));
    const aspect = view.el.querySelector('[data-node="a1"]');
    const trend = view.el.querySelector('[data-node="t1"]');
    const field = view.el.querySelector('.ps-fromto__field');
    view.update(run([...row1, node('a2', 'aspect:2'), node('i', 'insight')]));
    expect(view.el.querySelector('[data-node="a1"]')).toBe(aspect);
    expect(view.el.querySelector('[data-node="t1"]')).toBe(trend);
    expect(view.el.querySelector('.ps-fromto__field')).toBe(field);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createFromToView();
    view.update(run([node('a1', 'aspect:1'), node('t1', 'trend:1', { tag: 'growing', state: 'contested', objection: 'Where does that trend come from?' })]));
    const item = view.el.querySelector('[data-node="t1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Where does that trend come from?');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Where does that trend come from?');
  });

  it('opens one details card at a time', () => {
    const view = createFromToView();
    view.update(run(row1));
    const card = (id: string) => view.el.querySelector(`#${button(view, id).getAttribute('aria-controls')}`)!;
    button(view, 'a1').click();
    expect(view.el.querySelector('[data-node="a1"]')!.classList.contains('is-open')).toBe(true);
    expect(card('a1').classList.contains('is-open')).toBe(true);
    button(view, 'o1').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['o1']);
    expect(card('a1').classList.contains('is-open')).toBe(false);
    expect(card('o1').classList.contains('is-open')).toBe(true);
    expect(button(view, 'a1').getAttribute('aria-expanded')).toBe('false');
    expect(button(view, 'o1').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the short title in the cell and the full answer only in details', () => {
    const view = createFromToView();
    view.update(run([node('a1', 'aspect:1', { title: 'Footfall', text: 'How many people walk past the shop on a weekday.' })]));
    expect(view.el.querySelector('[data-node="a1"] .ps-fromto__title')!.textContent).toBe('Footfall');
    expect(button(view, 'a1').textContent).not.toContain('walk past');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('walk past'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('puts a row of cells in [data-row] in column order', () => {
    const view = createFromToView();
    view.update(run([node('o1', 'to:1'), node('f1', 'from:1'), node('t1', 'trend:1', { tag: 'declining' }), node('a1', 'aspect:1'), node('a2', 'aspect:2')]));
    const cells = [...view.el.querySelectorAll('[data-row="1"] [data-node]')].map((el) => [el.getAttribute('data-node'), el.getAttribute('data-col')]);
    expect(cells).toEqual([['a1', 'aspect'], ['t1', 'trend'], ['f1', 'from'], ['o1', 'to']]);
    expect(view.el.querySelector('[data-row="2"] [data-node="a2"]')).not.toBeNull();
    // A cell that arrives late still takes its own column.
    const view2 = createFromToView();
    view2.update(run([node('a1', 'aspect:1'), node('f1', 'from:1')]));
    view2.update(run([node('a1', 'aspect:1'), node('f1', 'from:1'), node('t1', 'trend:1', { tag: 'stable' })]));
    expect([...view2.el.querySelectorAll('[data-row="1"] [data-node]')].map((el) => el.getAttribute('data-col'))).toEqual(['aspect', 'trend', 'from']);
  });

  it('sets the trend cell direction from its tag, and follows a change of tag', () => {
    const view = createFromToView();
    view.update(run([node('a1', 'aspect:1'), node('t1', 'trend:1', { tag: 'growing' }), node('a2', 'aspect:2'), node('t2', 'trend:2', { tag: 'stable' }), node('a3', 'aspect:3'), node('t3', 'trend:3', { tag: 'declining' })]));
    const dir = (id: string) => view.el.querySelector(`[data-node="${id}"]`)!.getAttribute('data-direction');
    expect([dir('t1'), dir('t2'), dir('t3')]).toEqual(['growing', 'stable', 'declining']);
    expect(view.el.querySelector('[data-node="t1"] .ps-fromto__arrow')).not.toBeNull();
    expect(view.el.querySelector('[data-node="t1"] .ps-fromto__trend-title')!.textContent).toBe('Trend:1 title');
    view.update(run([node('a1', 'aspect:1'), node('t1', 'trend:1', { tag: 'declining' })]));
    expect(dir('t1')).toBe('declining');
  });

  it('has no cell element for an empty column', () => {
    const view = createFromToView();
    view.update(run([node('a1', 'aspect:1'), node('t1', 'trend:1', { tag: 'growing' })]));
    const row = view.el.querySelector('[data-row="1"]')!;
    expect(row.querySelector('[data-col="aspect"]')).not.toBeNull();
    expect(row.querySelector('[data-col="trend"]')).not.toBeNull();
    expect(row.querySelector('[data-col="from"]')).toBeNull();
    expect(row.querySelector('[data-col="to"]')).toBeNull();
  });

  it('shows the insight card only once there is an insight', () => {
    const view = createFromToView();
    view.update(run(row1));
    expect(view.el.querySelector('.ps-fromto__insight')).toBeNull();
    view.update(run([...row1, node('i', 'insight', { text: 'Use the growing trend to carry the change.' })]));
    const insight = view.el.querySelector('.ps-fromto__insight')!;
    expect(insight.getAttribute('data-node')).toBe('i');
    expect(insight.textContent).toContain('Use the growing trend to carry the change.');
    expect(view.el.lastElementChild).toBe(insight);
  });
});
