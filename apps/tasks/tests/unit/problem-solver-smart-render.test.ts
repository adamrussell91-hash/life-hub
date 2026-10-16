import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSmartView } from '../../../../packages/problem-solver/render/smart';
import type { PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} full answer text`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[]): PsToolRun => ({ id: 'r', tool: 'smart', status: 'active', nodes, edges: [] });
const col = (view: { el: HTMLElement }, letter: string) => view.el.querySelector(`[data-letter="${letter}"]`)!;

describe('SMART view', () => {
  it('renders nothing for an empty run', () => {
    const view = createSmartView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-smart__table')).toBeNull();
  });

  it('draws the header row and problem bar with the problem node, with all letters unfilled', () => {
    const view = createSmartView();
    view.update(run([node('p', 'problem', { title: 'Quarter late' })]));
    expect(view.el.querySelector('.ps-smart__bar [data-node="p"]')).not.toBeNull();
    expect(view.el.querySelector('[data-node="p"] .ps-smart__title')!.textContent).toBe('Quarter late');
    expect(view.el.querySelectorAll('.ps-smart__tri').length).toBe(5);
    expect(view.el.querySelectorAll('.ps-smart__tri.is-filled').length).toBe(0);
    expect(view.el.querySelectorAll('.ps-smart__shape-art').length).toBe(0);
    expect([...view.el.querySelectorAll('.ps-smart__tri')].map((t) => t.textContent)).toEqual(['S', 'M', 'A', 'R', 'T']);
  });

  it('fills only the column of the letter that exists', () => {
    const view = createSmartView();
    view.update(run([node('p', 'problem'), node('m', 'm', { title: 'Late share' })]));
    expect(col(view, 'm').querySelector('[data-node="m"] .ps-smart__title')!.textContent).toBe('Late share');
    expect(col(view, 'm').querySelector('.ps-smart__tri')!.classList.contains('is-filled')).toBe(true);
    for (const other of ['s', 'a', 'r', 't']) {
      expect(col(view, other).querySelector('[data-node]')).toBeNull();
      expect(col(view, other).querySelector('.ps-smart__tri')!.classList.contains('is-filled')).toBe(false);
    }
  });

  it('gives each column its own yellow shape', () => {
    const view = createSmartView();
    view.update(run(['s', 'm', 'a', 'r', 't'].map((l) => node(l, l))));
    const kinds = ['s', 'm', 'a', 'r', 't'].map((l) => col(view, l).querySelector('.ps-smart__shape-art')!.getAttribute('data-shape'));
    expect(kinds).toEqual(['triangle', 'half-circle', 'square', 'circle', 'triangle-down']);
  });

  it('shows a short title in the cell, not the full answer', () => {
    const view = createSmartView();
    view.update(run([node('s', 's', { title: 'Two daily runs', text: 'Dispatch team, all warehouse orders.' })]));
    expect(view.el.querySelector('[data-node="s"] button')!.textContent).not.toContain('warehouse');
  });

  it('keeps identity and opens one card at a time, marking contested', () => {
    const view = createSmartView();
    view.update(run([node('p', 'problem'), node('s', 's', { state: 'contested', objection: 'Vague.' })]));
    const first = view.el.querySelector('[data-node="s"]');
    view.update(run([node('p', 'problem'), node('s', 's', { state: 'contested', objection: 'Vague.' }), node('m', 'm')]));
    expect(view.el.querySelector('[data-node="s"]')).toBe(first);
    expect(view.el.querySelector('[data-node="s"] .ps-objection')!.getAttribute('title')).toBe('Vague.');
    const button = (id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
    button('s').click();
    button('m').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button('s').getAttribute('aria-expanded')).toBe('false');
  });

  it('switches to stacked rows with a container query, not script', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    expect(css).toMatch(/@container \(max-width: \d+px\) \{[^@]*\.ps-smart__col/);
    const view = createSmartView();
    expect(view.el.className).toBe('ps-smart');
  });
});
