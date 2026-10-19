import { describe, expect, it } from 'vitest';
import { createContradictionView } from '../../../../packages/problem-solver/render/contradiction';
import type { PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'contradiction', status: 'active', nodes, edges: [], ...extra });
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;

const improving = node('i', 'improving');
const worsening = node('w', 'worsening');
const statement = node('s', 'statement', { text: 'The faster we pack orders, the more mistakes reach customers.' });

describe('Contradiction view', () => {
  it('renders nothing for an empty run', () => {
    const view = createContradictionView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-contra__stage')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Contradiction');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createContradictionView();
    view.update(run([improving]));
    const item = view.el.querySelector('[data-node="i"]');
    const shape = button(view, 'i');
    const stage = view.el.querySelector('.ps-contra__stage');
    view.update(run([improving, worsening, statement]));
    expect(view.el.querySelector('[data-node="i"]')).toBe(item);
    expect(button(view, 'i')).toBe(shape);
    expect(view.el.querySelector('.ps-contra__stage')).toBe(stage);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createContradictionView();
    view.update(run([improving, node('w', 'worsening', { state: 'contested', objection: 'Does that really get worse?' })]));
    const item = view.el.querySelector('[data-node="w"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(view.el.querySelector('[data-node="i"]')!.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Does that really get worse?');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Does that really get worse?');
  });

  it('opens one details card at a time', () => {
    const view = createContradictionView();
    view.update(run([improving, worsening]));
    button(view, 'i').click();
    expect(view.el.querySelector('[data-node="i"]')!.classList.contains('is-open')).toBe(true);
    button(view, 'w').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['w']);
    expect(button(view, 'i').getAttribute('aria-expanded')).toBe('false');
    const card = view.el.querySelector(`#${button(view, 'w').getAttribute('aria-controls')}`)!;
    expect(card.classList.contains('is-open')).toBe(true);
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
  });

  it('shows the short title in the triangle and the full answer only in details', () => {
    const view = createContradictionView();
    view.update(run([node('i', 'improving', { title: 'Packing speed', text: 'How many orders leave the warehouse each hour.' })]));
    expect(view.el.querySelector('[data-node="i"] .ps-contra__title')!.textContent).toBe('Packing speed');
    expect(button(view, 'i').textContent).not.toContain('leave the warehouse');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('leave the warehouse'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('puts the improving shape in the improving region and the worsening one in its own', () => {
    const view = createContradictionView();
    view.update(run([improving, worsening]));
    expect(view.el.querySelector('[data-region="improving"] [data-node="i"]')).not.toBeNull();
    expect(view.el.querySelector('[data-region="worsening"] [data-node="w"]')).not.toBeNull();
    // Each region appears with its node.
    const one = createContradictionView();
    one.update(run([improving]));
    expect(one.el.querySelector('[data-region="worsening"]')).toBeNull();
  });

  it('draws the tension line only when both nodes exist, and drops it on undo', () => {
    const view = createContradictionView();
    view.update(run([improving]));
    expect(view.el.querySelector('.ps-contra__tension')).toBeNull();
    view.update(run([improving, worsening]));
    expect(view.el.querySelector('.ps-contra__tension')).not.toBeNull();
    view.update(run([improving]));
    expect(view.el.querySelector('.ps-contra__tension')).toBeNull();
    expect(view.el.querySelector('[data-node="w"]')).toBeNull();
  });

  it('shows the statement in full in a card under the shapes', () => {
    const view = createContradictionView();
    view.update(run([improving, worsening, statement]));
    const card = view.el.querySelector('[data-region="statement"] [data-node="s"]')!;
    expect(card.querySelector('.ps-contra__statement-text')!.textContent).toBe('The faster we pack orders, the more mistakes reach customers.');
    expect(view.el.lastElementChild!.contains(card)).toBe(true);
  });

  it('removes an undone node with its open details card, and everything once the run is empty', () => {
    const view = createContradictionView();
    view.update(run([improving, worsening]));
    button(view, 'w').click();
    const id = button(view, 'w').getAttribute('aria-controls')!;
    view.update(run([improving]));
    expect(view.el.querySelector(`#${id}`)).toBeNull();
    expect(view.el.querySelectorAll('.is-open').length).toBe(0);
    view.update(run([]));
    expect(view.el.querySelector('.ps-contra__stage')).toBeNull();
    expect(view.el.children.length).toBe(0);
  });
});
