// apps/tasks/tests/unit/problem-solver-five-whys-render.test.ts
import { describe, expect, it } from 'vitest';
import { createFiveWhysView } from '../../../../packages/problem-solver/render/five-whys';
import { renderOutline } from '../../../../packages/problem-solver/render/outline';
import type { PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} text`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[]): PsToolRun => ({ id: 'r', tool: 'five_whys', status: 'active', nodes, edges: [] });

describe('5 Whys view', () => {
  it('starts empty and adds one shape per node', () => {
    const view = createFiveWhysView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    view.update(run([node('p', 'problem'), node('w1', 'why:1')]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(2);
    expect(view.el.querySelector('[data-node="w1"] .ps-whys__why')).not.toBeNull();
  });

  it('does not rebuild existing nodes', () => {
    const view = createFiveWhysView();
    view.update(run([node('p', 'problem')]));
    const first = view.el.querySelector('[data-node="p"]');
    view.update(run([node('p', 'problem'), node('w1', 'why:1')]));
    expect(view.el.querySelector('[data-node="p"]')).toBe(first);
  });

  it('marks contested nodes and exposes the objection', () => {
    const view = createFiveWhysView();
    view.update(run([node('p', 'problem'), node('w1', 'why:1', { state: 'contested', objection: 'That blames a person.' })]));
    const g = view.el.querySelector('[data-node="w1"]')!;
    expect(g.classList.contains('is-contested')).toBe(true);
    expect(g.querySelector('.ps-objection')!.getAttribute('title')).toBe('That blames a person.');
  });

  it('keeps chain order: problem, whys by index, root last', () => {
    const view = createFiveWhysView();
    const whys = [1, 2, 3, 4, 5].map((i) => node(`w${i}`, `why:${i}`));
    view.update(run([node('r', 'root'), whys[1], node('p', 'problem'), whys[0], ...whys.slice(2)]));
    const ids = [...view.el.querySelectorAll('[data-node]')].map((row) => row.getAttribute('data-node'));
    expect(ids).toEqual(['p', 'w1', 'w2', 'w3', 'w4', 'w5', 'r']);
    expect(view.el.querySelector('[data-node="r"] .ps-whys__root')).not.toBeNull();
    expect(view.el.querySelector('[data-node="w2"] .ps-whys__meta')!.textContent).toBe('Why 2');
  });

  it('shows the objection as a note under a contested answer, shape left solid', () => {
    const view = createFiveWhysView();
    view.update(run([node('p', 'problem'), node('w1', 'why:1', { state: 'contested', objection: 'That blames a person.' })]));
    const row = view.el.querySelector('[data-node="w1"]')!;
    expect(row.querySelector('.ps-whys__note')!.textContent).toBe('That blames a person.');
    expect(row.querySelector('.ps-whys__why')!.getAttribute('stroke-dasharray')).toBeNull();
  });
});

describe('outline', () => {
  it('lists nodes in order with slot labels and contested marks', () => {
    const list = renderOutline(run([node('p', 'problem'), node('w1', 'why:1', { state: 'contested', objection: 'x' })]));
    expect(list.querySelectorAll('li').length).toBe(2);
    expect(list.textContent).toContain('Why 1');
    expect(list.textContent).toContain('contested');
  });
});
