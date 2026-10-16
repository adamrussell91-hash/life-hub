import { describe, expect, it } from 'vitest';
import { createGapBasicView } from '../../../../packages/problem-solver/render/gap-basic';
import type { PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} full answer text`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[]): PsToolRun => ({ id: 'r', tool: 'gap_basic', status: 'active', nodes, edges: [] });
const lobe = (view: { el: HTMLElement }, name: string) => view.el.querySelector(`[data-lobe="${name}"]`);

describe('Gap analysis view', () => {
  it('renders no shapes for an empty run', () => {
    const view = createGapBasicView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-gap__half')).toBeNull();
    expect(view.el.querySelector('.ps-gap__bar')).toBeNull();
  });

  it('draws each end and its half only once that end exists', () => {
    const view = createGapBasicView();
    view.update(run([node('c', 'current')]));
    expect(view.el.querySelector('.ps-gap__half--current')).not.toBeNull();
    expect(view.el.querySelector('.ps-gap__half--objective')).toBeNull();
    expect(view.el.querySelector('[data-node="c"] .ps-gap__title')).not.toBeNull();
    view.update(run([node('c', 'current'), node('o', 'objective')]));
    expect(view.el.querySelector('.ps-gap__half--objective')).not.toBeNull();
  });

  it('places each slot in its lobe', () => {
    const view = createGapBasicView();
    view.update(run([node('c', 'current'), node('o', 'objective'), node('k', 'known:1'), node('d', 'done:1'), node('mk', 'must_know:1'), node('md', 'must_do:1')]));
    expect(lobe(view, 'known')!.querySelector('[data-node="k"]')).not.toBeNull();
    expect(lobe(view, 'done')!.querySelector('[data-node="d"]')).not.toBeNull();
    expect(lobe(view, 'must_know')!.querySelector('[data-node="mk"]')).not.toBeNull();
    expect(lobe(view, 'must_do')!.querySelector('[data-node="md"]')).not.toBeNull();
  });

  it('keeps the yellow bar absent until the first action', () => {
    const view = createGapBasicView();
    const base = [node('c', 'current'), node('o', 'objective')];
    view.update(run(base));
    expect(view.el.querySelector('.ps-gap__bar')).toBeNull();
    view.update(run([...base, node('a1', 'action:1')]));
    expect(view.el.querySelector('.ps-gap__bar')).not.toBeNull();
    expect(view.el.querySelector('.ps-gap__actions [data-node="a1"]')).not.toBeNull();
  });

  it('shows three pills per lobe then a +N pill listing the rest', () => {
    const view = createGapBasicView();
    const known = [1, 2, 3, 4, 5].map((i) => node(`k${i}`, `known:${i}`, { title: `Known ${i}` }));
    view.update(run([node('c', 'current'), ...known]));
    const visible = [...lobe(view, 'known')!.querySelectorAll<HTMLElement>('[data-node]')].filter((n) => !n.hidden);
    expect(visible.length).toBe(3);
    const more = lobe(view, 'known')!.querySelector<HTMLButtonElement>('.ps-gap__more')!;
    expect(more.textContent).toBe('+2');
    more.click();
    const open = view.el.querySelector('.ps-details.is-open')!;
    expect(open.textContent).toContain('Known 4');
    expect(open.textContent).toContain('Known 5');
  });

  it('shows no +N pill at three or fewer', () => {
    const view = createGapBasicView();
    view.update(run([node('c', 'current'), node('k1', 'known:1'), node('k2', 'known:2'), node('k3', 'known:3')]));
    expect(lobe(view, 'known')!.querySelector('.ps-gap__more')).toBeNull();
  });

  it('keeps element identity across updates and orders pills by index', () => {
    const view = createGapBasicView();
    view.update(run([node('c', 'current'), node('k2', 'known:2')]));
    const first = view.el.querySelector('[data-node="k2"]');
    view.update(run([node('c', 'current'), node('k2', 'known:2'), node('k1', 'known:1')]));
    expect(view.el.querySelector('[data-node="k2"]')).toBe(first);
    const ids = [...lobe(view, 'known')!.querySelectorAll('[data-node]')].map((n) => n.getAttribute('data-node'));
    expect(ids).toEqual(['k1', 'k2']);
  });

  it('shows a short title in a pill, not the full answer', () => {
    const view = createGapBasicView();
    view.update(run([node('c', 'current'), node('k', 'known:1', { title: 'Rota habits', text: 'Everyone swaps shifts by text message.' })]));
    const pill = view.el.querySelector('[data-node="k"] button')!;
    expect(pill.textContent).toContain('Rota habits');
    expect(pill.textContent).not.toContain('text message');
  });

  it('marks contested nodes and opens one card at a time', () => {
    const view = createGapBasicView();
    view.update(run([node('c', 'current', { state: 'contested', objection: 'Too vague.' }), node('o', 'objective'), node('k', 'known:1')]));
    expect(view.el.querySelector('[data-node="c"] .ps-objection')!.getAttribute('title')).toBe('Too vague.');
    const button = (id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
    const open = () => view.el.querySelectorAll('.ps-details.is-open').length;
    button('c').click();
    expect(open()).toBe(1);
    button('k').click();
    expect(open()).toBe(1);
    expect(button('c').getAttribute('aria-expanded')).toBe('false');
    expect(button('k').getAttribute('aria-expanded')).toBe('true');
  });
});
