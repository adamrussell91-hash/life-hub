import { describe, expect, it } from 'vitest';
import { createProblemStatementView } from '../../../../packages/problem-solver/render/problem-statement';
import type { PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} full answer text`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[]): PsToolRun => ({ id: 'r', tool: 'problem_statement', status: 'active', nodes, edges: [] });

describe('Problem statement view', () => {
  it('renders no blocks for an empty run', () => {
    const view = createProblemStatementView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-statement__square')).toBeNull();
  });

  it('places each block in its grid area and colour', () => {
    const view = createProblemStatementView();
    view.update(run([node('p', 'problem'), node('i', 'impact'), node('b', 'benefit')]));
    const block = (id: string) => view.el.querySelector(`[data-node="${id}"]`)!;
    expect(block('p').classList.contains('ps-statement__block--problem')).toBe(true);
    expect(block('b').classList.contains('ps-statement__block--benefit')).toBe(true);
    expect(block('i').classList.contains('ps-statement__block--impact')).toBe(true);
  });

  it('shows only the blocks whose nodes exist, and keeps identity across updates', () => {
    const view = createProblemStatementView();
    view.update(run([node('p', 'problem')]));
    const first = view.el.querySelector('[data-node="p"]');
    expect(view.el.querySelector('.ps-statement__block--impact')).toBeNull();
    view.update(run([node('p', 'problem'), node('i', 'impact')]));
    expect(view.el.querySelector('[data-node="p"]')).toBe(first);
    expect(view.el.querySelector('.ps-statement__block--impact')).not.toBeNull();
    expect(view.el.querySelector('.ps-statement__block--benefit')).toBeNull();
  });

  it('renders the composed statement in full below the square', () => {
    const view = createProblemStatementView();
    const text = 'A long composed statement that goes on for a while to cover the problem, impacts and benefits in full.';
    view.update(run([node('p', 'problem'), node('s', 'statement', { text, title: 'Composed' })]));
    const card = view.el.querySelector('[data-node="s"]')!;
    expect(card.querySelector('.ps-statement__text')!.textContent).toBe(text);
    expect(view.el.querySelector('.ps-statement__square [data-node="s"]')).toBeNull();
  });

  it('shows a short title in a block, not the full answer', () => {
    const view = createProblemStatementView();
    view.update(run([node('p', 'problem', { title: 'Quarter late', text: 'One in four deliveries misses its window.' })]));
    const shape = view.el.querySelector('[data-node="p"] .ps-statement__shape')!;
    expect(shape.querySelector('.ps-statement__title')!.textContent).toBe('Quarter late');
    expect(shape.textContent).not.toContain('misses its window');
  });

  it('marks contested blocks and opens one card at a time', () => {
    const view = createProblemStatementView();
    view.update(run([node('p', 'problem', { state: 'contested', objection: 'Too broad.' }), node('i', 'impact'), node('s', 'statement')]));
    expect(view.el.querySelector('[data-node="p"] .ps-objection')!.getAttribute('title')).toBe('Too broad.');
    const button = (id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
    const open = () => [...view.el.querySelectorAll('.ps-details.is-open')].length;
    button('p').click();
    expect(open()).toBe(1);
    button('s').click();
    expect(open()).toBe(1);
    expect(button('p').getAttribute('aria-expanded')).toBe('false');
    expect(button('s').getAttribute('aria-expanded')).toBe('true');
  });
});
