import { describe, expect, it } from 'vitest';
import { createGapRadarView } from '../../../../packages/problem-solver/render/gap-radar';
import type { PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} full answer text`, state: 'accepted', skills: [], turnId: 't', ...extra });
const axis = (i: number, extra: Partial<PsNode> = {}) => node(`x${i}`, `axis:${i}`, { title: `Topic ${i} title`, ...extra });
const run = (nodes: PsNode[], snapshots: { at: string; current: number[]; objective: number[] }[] = []): PsToolRun => ({ id: 'r', tool: 'gap_radar', status: 'active', nodes, edges: [], radar: { snapshots } });
const base = [node('c', 'current'), node('o', 'objective')];
const points = (view: { el: HTMLElement }, series: string) => view.el.querySelector(`polygon[data-series="${series}"]`)!.getAttribute('points')!.split(' ');

describe('Gap analysis (advanced) view', () => {
  it('renders nothing for an empty run', () => {
    const view = createGapRadarView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('svg')).toBeNull();
    expect(view.el.querySelector('.ps-radar__score')).toBeNull();
  });

  it('draws the rings once the first node exists, with one spoke and label per topic', () => {
    const view = createGapRadarView();
    view.update(run([node('c', 'current')]));
    expect(view.el.querySelectorAll('.ps-radar__ring').length).toBe(10);
    expect(view.el.querySelectorAll('.ps-radar__spoke').length).toBe(0);
    view.update(run([...base, axis(1), axis(2), axis(3), axis(4)]));
    expect(view.el.querySelectorAll('.ps-radar__spoke').length).toBe(4);
    expect(view.el.querySelectorAll('.ps-radar__label').length).toBe(4);
    expect(view.el.querySelector('[data-node="x2"] .ps-radar__meta')!.textContent).toBe('Topic 2');
    expect(view.el.querySelector('[data-node="x2"] .ps-radar__title')!.textContent).toBe('Topic 2 title');
  });

  it('shows no polygon before a snapshot but offers to score once there are three topics', () => {
    const view = createGapRadarView();
    view.update(run([...base, axis(1), axis(2)]));
    expect(view.el.querySelector('.ps-radar__score')).toBeNull();
    view.update(run([...base, axis(1), axis(2), axis(3)]));
    expect(view.el.querySelector('polygon')).toBeNull();
    expect(view.el.querySelector('.ps-radar__score')!.textContent).toBe('Score each topic');
  });

  it('draws one point per topic in each polygon and updates them on a new snapshot', () => {
    const view = createGapRadarView();
    const nodes = [...base, axis(1), axis(2), axis(3), axis(4), axis(5)];
    view.update(run(nodes, [{ at: 'a', current: [2, 3, 4, 5, 6], objective: [8, 8, 8, 8, 8] }]));
    expect(points(view, 'current').length).toBe(5);
    expect(points(view, 'objective').length).toBe(5);
    const first = points(view, 'current').join(' ');
    const el = view.el.querySelector('polygon[data-series="current"]');
    view.update(run(nodes, [{ at: 'a', current: [2, 3, 4, 5, 6], objective: [8, 8, 8, 8, 8] }, { at: 'b', current: [6, 6, 6, 6, 6], objective: [8, 8, 8, 8, 8] }]));
    expect(points(view, 'current').join(' ')).not.toBe(first);
    expect(view.el.querySelector('polygon[data-series="current"]')).toBe(el);
    expect(view.el.querySelector('.ps-radar__score')!.textContent).toBe('Rescore topics');
  });

  it('puts a score of 10 on the rim and 5 halfway', () => {
    const view = createGapRadarView();
    view.update(run([...base, axis(1), axis(2), axis(3)], [{ at: 'a', current: [10, 5, 5], objective: [10, 10, 10] }]));
    const [x, y] = points(view, 'current')[0].split(',').map(Number);
    expect(Math.hypot(x, y)).toBeCloseTo(100, 0);
    const [x2, y2] = points(view, 'current')[1].split(',').map(Number);
    expect(Math.hypot(x2, y2)).toBeCloseTo(50, 0);
  });

  it('hides the polygons when topics outnumber the scores until rescored', () => {
    const view = createGapRadarView();
    const nodes = [...base, axis(1), axis(2), axis(3)];
    view.update(run(nodes, [{ at: 'a', current: [2, 3, 4], objective: [8, 8, 8] }]));
    view.update(run([...nodes, axis(4)], [{ at: 'a', current: [2, 3, 4], objective: [8, 8, 8] }]));
    expect(view.el.querySelector('polygon')!.hasAttribute('hidden')).toBe(true);
  });

  it('keeps element identity across updates', () => {
    const view = createGapRadarView();
    view.update(run([...base, axis(1)]));
    const label = view.el.querySelector('[data-node="x1"]');
    const spoke = view.el.querySelector('.ps-radar__spoke');
    view.update(run([...base, axis(1), axis(2)]));
    expect(view.el.querySelector('[data-node="x1"]')).toBe(label);
    expect(view.el.querySelector('.ps-radar__spoke')).toBe(spoke);
  });

  it('lists current state and objective in the legend as details buttons', () => {
    const view = createGapRadarView();
    view.update(run([node('c', 'current', { title: 'Late deliveries' })]));
    expect(view.el.querySelector('.ps-radar__key--current')!.textContent).toContain('Late deliveries');
    expect(view.el.querySelector('.ps-radar__key--objective')).toBeNull();
  });

  it('marks contested topics and opens one card at a time', () => {
    const view = createGapRadarView();
    view.update(run([...base, axis(1, { state: 'contested', objection: 'Too broad.' }), axis(2)]));
    expect(view.el.querySelector('[data-node="x1"] .ps-objection')!.getAttribute('title')).toBe('Too broad.');
    const button = (id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
    const open = () => view.el.querySelectorAll('.ps-details.is-open').length;
    button('x1').click();
    button('x2').click();
    expect(open()).toBe(1);
    button('c').click();
    expect(open()).toBe(1);
    expect(button('x2').getAttribute('aria-expanded')).toBe('false');
  });

  it('scores through the onScore callback with one score per topic for each overlay', () => {
    const view = createGapRadarView();
    const got: unknown[] = [];
    view.onScore((scores) => got.push(scores));
    view.update(run([...base, axis(1), axis(2), axis(3)]));
    view.el.querySelector<HTMLButtonElement>('.ps-radar__score')!.click();
    const form = view.el.querySelector<HTMLFormElement>('.ps-radar__form')!;
    expect(form.hidden).toBe(false);
    expect(form.querySelectorAll('input[name="current"]').length).toBe(3);
    expect(form.querySelectorAll('input[name="objective"]').length).toBe(3);
    form.querySelector<HTMLInputElement>('input[name="current"]')!.value = '3';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(got).toEqual([{ current: [3, 5, 5], objective: [8, 8, 8] }]);
    expect(form.hidden).toBe(true);
  });

  it('prefills the form from the latest snapshot', () => {
    const view = createGapRadarView();
    view.update(run([...base, axis(1), axis(2), axis(3)], [{ at: 'a', current: [2, 3, 4], objective: [7, 8, 9] }]));
    view.el.querySelector<HTMLButtonElement>('.ps-radar__score')!.click();
    const values = [...view.el.querySelectorAll<HTMLInputElement>('input[name="objective"]')].map((input) => input.value);
    expect(values).toEqual(['7', '8', '9']);
  });
});
