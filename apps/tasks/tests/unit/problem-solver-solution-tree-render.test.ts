import { describe, expect, it } from 'vitest';
import { createSolutionTreeView } from '../../../../packages/problem-solver/render/solution-tree';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'solution_tree', status: 'active', nodes, edges, ...extra });
const parent = (from: string, to: string): PsEdge => ({ from, to, kind: 'parent' });
const item = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;

// aim → h1, h2; h1 → h3; h3 → h4
const tree = [node('a', 'aim'), node('h1', 'how:1'), node('h2', 'how:2'), node('h3', 'how:3'), node('h4', 'how:4')];
const links = [parent('h1', 'a'), parent('h2', 'a'), parent('h3', 'h1'), parent('h4', 'h3')];

describe('Solution tree view', () => {
  it('renders no triangles and no stage for an empty run', () => {
    const view = createSolutionTreeView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-soltree__stage')).toBeNull();
    expect(view.el.querySelector('.ps-soltree__key')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Solution tree');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createSolutionTreeView();
    view.update(run(tree.slice(0, 2), links.slice(0, 1)));
    const aim = item(view, 'a');
    const first = item(view, 'h1');
    const shape = button(view, 'h1');
    const stage = view.el.querySelector('.ps-soltree__stage');
    view.update(run(tree, links));
    expect(item(view, 'a')).toBe(aim);
    expect(item(view, 'h1')).toBe(first);
    expect(button(view, 'h1')).toBe(shape);
    expect(view.el.querySelector('.ps-soltree__stage')).toBe(stage);
    expect(view.el.querySelectorAll('[data-node]').length).toBe(5);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createSolutionTreeView();
    view.update(run([node('a', 'aim'), node('h1', 'how:1', { state: 'contested', objection: 'Is that a way to do it, or a wish?' })], [parent('h1', 'a')]));
    const el = item(view, 'h1');
    expect(el.classList.contains('is-contested')).toBe(true);
    expect(el.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that a way to do it, or a wish?');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Is that a way to do it, or a wish?');
    expect(button(view, 'h1').getAttribute('aria-label')).toContain('contested');
  });

  it('opens one details card at a time', () => {
    const view = createSolutionTreeView();
    view.update(run(tree, links));
    const card = (id: string) => view.el.querySelector(`#${button(view, id).getAttribute('aria-controls')}`)!;
    button(view, 'h1').click();
    expect(item(view, 'h1').classList.contains('is-open')).toBe(true);
    expect(card('h1').classList.contains('is-open')).toBe(true);
    button(view, 'h4').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['h4']);
    expect(card('h1').classList.contains('is-open')).toBe(false);
    expect(card('h4').classList.contains('is-open')).toBe(true);
    expect(button(view, 'h1').getAttribute('aria-expanded')).toBe('false');
    expect(button(view, 'h4').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the short title on the shape and the full answer only in details', () => {
    const view = createSolutionTreeView();
    view.update(run([
      node('a', 'aim', { title: 'Warm hall', text: 'Keep the village hall warm all winter without raising the hire fee.' }),
      node('h1', 'how:1', { title: 'Seal the doors', text: 'Fit brush strips and a closer to both outside doors before October.' })
    ], [parent('h1', 'a')]));
    expect(item(view, 'a').querySelector('.ps-soltree__title')!.textContent).toBe('Warm hall');
    expect(item(view, 'h1').querySelector('.ps-soltree__title')!.textContent).toBe('Seal the doors');
    for (const id of ['a', 'h1']) expect(item(view, id).textContent).not.toMatch(/without raising|brush strips/);
    for (const words of ['without raising', 'brush strips']) {
      const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes(words));
      expect(holders.length).toBe(1);
      expect(holders[0].closest('.ps-details')).not.toBeNull();
    }
  });

  it('draws the aim as the level 1 triangle at the base', () => {
    const view = createSolutionTreeView();
    view.update(run(tree, links));
    const aim = item(view, 'a');
    expect(aim.getAttribute('data-level')).toBe('1');
    expect(aim.classList.contains('is-aim')).toBe(true);
    expect(button(view, 'a').getAttribute('aria-label')).toMatch(/^Aim: aim title/i);
    // The first ring opens out of the aim's point; deeper hows sit above it.
    for (const id of ['h1', 'h2']) {
      expect(Number(item(view, id).style.getPropertyValue('--x'))).toBe(0);
      expect(Number(item(view, id).style.getPropertyValue('--y'))).toBe(0);
    }
    for (const id of ['h3', 'h4']) expect(Number(item(view, id).style.getPropertyValue('--y'))).toBeLessThan(0);
  });

  it('gives a how hung from a how level 3 and the yellow class; level 2 red, level 4 blue', () => {
    const view = createSolutionTreeView();
    view.update(run(tree, links));
    expect(item(view, 'h1').getAttribute('data-level')).toBe('2');
    expect(item(view, 'h1').classList.contains('is-red')).toBe(true);
    expect(item(view, 'h3').getAttribute('data-level')).toBe('3');
    expect(item(view, 'h3').classList.contains('is-yellow')).toBe(true);
    expect(item(view, 'h4').getAttribute('data-level')).toBe('4');
    expect(item(view, 'h4').classList.contains('is-blue')).toBe(true);
    // A how with no parent link hangs from the aim.
    view.update(run([...tree, node('h5', 'how:5')], links));
    expect(item(view, 'h5').getAttribute('data-level')).toBe('2');
  });

  it('keeps existing elements identical after adding a how, and re-spreads the siblings', () => {
    const view = createSolutionTreeView();
    view.update(run(tree, links));
    const before = new Map([...view.el.querySelectorAll<HTMLElement>('[data-node]')].map((el) => [el.getAttribute('data-node')!, el]));
    const buttons = new Map([...before.keys()].map((id) => [id, button(view, id)]));
    const angle = item(view, 'h2').style.getPropertyValue('--a');
    view.update(run([...tree, node('h5', 'how:5')], [...links, parent('h5', 'h1')]));
    for (const [id, el] of before) {
      expect(item(view, id)).toBe(el);
      expect(button(view, id)).toBe(buttons.get(id));
    }
    expect(item(view, 'h5').getAttribute('data-level')).toBe('3');
    // h1's branch now has two leaves, so h2 moves over.
    expect(item(view, 'h2').style.getPropertyValue('--a')).not.toBe(angle);
  });

  it('spreads the hows across the upper half by leaf count, each pointing out along its angle', () => {
    const view = createSolutionTreeView();
    view.layout(900);
    view.update(run(tree, links));
    const a = (id: string) => Number(item(view, id).style.getPropertyValue('--a'));
    for (const id of ['h1', 'h2', 'h3', 'h4']) {
      expect(a(id)).toBeGreaterThanOrEqual(-160);
      expect(a(id)).toBeLessThanOrEqual(-20);
    }
    // Two leaves (h4 under h1's line, and h2): h1's branch on the left, h2 on the right, at the middles of the halves.
    expect(a('h1')).toBeCloseTo(-125, 5);
    expect(a('h2')).toBeCloseTo(-55, 5);
    // An only child sits on its parent's line.
    expect(a('h3')).toBeCloseTo(a('h1'), 5);
    // The phone fan is narrower.
    view.layout(390);
    expect(a('h1')).toBeCloseTo(-120, 5);
    expect(a('h2')).toBeCloseTo(-60, 5);
  });

  it('numbers the triangles and lists the titles under the chart on a narrow container', () => {
    const view = createSolutionTreeView();
    view.update(run(tree, links));
    view.layout(390);
    expect(view.el.getAttribute('data-compact')).toBe('true');
    const key = view.el.querySelector<HTMLElement>('.ps-soltree__key')!;
    expect(key).not.toBeNull();
    expect(key.closest('.ps-soltree__stage')).toBeNull();
    expect(key.getAttribute('role')).toBe('group');
    const rows = [...key.querySelectorAll<HTMLButtonElement>('button[data-key]')];
    expect(rows.map((r) => r.getAttribute('data-key'))).toEqual(['h1', 'h3', 'h4', 'h2']);
    // Each row's number matches its triangle's.
    for (const row of rows) {
      const id = row.getAttribute('data-key')!;
      const code = item(view, id).querySelector('.ps-soltree__code')!.textContent;
      expect(code).toBeTruthy();
      expect(row.querySelector('.ps-soltree__key-code')!.textContent).toBe(code);
      expect(row.textContent!.toLowerCase()).toContain(`${tree.find((n) => n.id === id)!.slot} title`);
      expect(row.classList.contains('is-labelled')).toBe(false);
    }
    expect(item(view, 'h1').querySelector('.ps-soltree__code')!.textContent).toBe('A');
    expect(item(view, 'h3').querySelector('.ps-soltree__code')!.textContent).toBe('A1');
    expect(item(view, 'h4').querySelector('.ps-soltree__code')!.textContent).toBe('A2');
    // A row opens its triangle's details.
    rows[2].click();
    expect(item(view, 'h4').classList.contains('is-open')).toBe(true);
    expect(rows[2].getAttribute('aria-expanded')).toBe('true');
    view.layout(900);
    expect(view.el.getAttribute('data-compact')).toBe('false');
  });
  it('on a wide panel puts every title beside its triangle, or none: all go to the key if any cannot fit', () => {
    const view = createSolutionTreeView();
    view.layout(900);
    view.update(run([node('a', 'aim'), node('h1', 'how:1')], [parent('h1', 'a')]));
    expect(view.el.getAttribute('data-compact')).toBe('false');
    expect(item(view, 'h1').querySelector('.ps-soltree__label')!.classList.contains('is-beside')).toBe(true);
    expect(view.el.querySelector('button[data-key="h1"]')!.classList.contains('is-labelled')).toBe(true);
    expect(view.el.querySelector('.ps-soltree__key')!.classList.contains('is-covered')).toBe(true);

    // Fourteen hows on the first ring: their titles cannot all sit beside, so none do.
    const crowd = Array.from({ length: 14 }, (_, i) => node(`h${i + 1}`, `how:${i + 1}`));
    view.update(run([node('a', 'aim'), ...crowd], crowd.map((n) => parent(n.id, 'a'))));
    expect(view.el.querySelectorAll('.ps-soltree__label.is-beside').length).toBe(0);
    expect(view.el.querySelectorAll('.ps-soltree__label.is-tip').length).toBe(14);
    const rows = [...view.el.querySelectorAll<HTMLButtonElement>('button[data-key]')];
    expect(rows.length).toBe(14);
    for (const row of rows) expect(row.classList.contains('is-labelled')).toBe(false);
    expect(view.el.querySelector('.ps-soltree__key')!.classList.contains('is-covered')).toBe(false);
    // The codes stay on the chart.
    for (const n of crowd) expect(item(view, n.id).querySelector('.ps-soltree__code')!.textContent).toBeTruthy();
  });

  it('sizes triangles by level: every wedge on a ring is the same size, growing outward', () => {
    const view = createSolutionTreeView();
    view.layout(900);
    // h1 carries three leaves, h2 one: their angles differ but their sizes do not.
    const nodes = [node('a', 'aim'), node('h1', 'how:1'), node('h2', 'how:2'), node('h3', 'how:3'), node('h4', 'how:4'), node('h5', 'how:5'), node('h6', 'how:6')];
    const edges = [parent('h1', 'a'), parent('h2', 'a'), parent('h3', 'h1'), parent('h4', 'h1'), parent('h5', 'h1'), parent('h6', 'h3')];
    view.update(run(nodes, edges));
    const v = (id: string, prop: string) => Number(item(view, id).style.getPropertyValue(prop));
    expect(v('h1', '--hw')).toBe(v('h2', '--hw'));
    expect(v('h1', '--len')).toBe(v('h2', '--len'));
    expect(v('h3', '--hw')).toBe(v('h4', '--hw'));
    expect(v('h3', '--hw')).toBe(v('h5', '--hw'));
    expect(v('h1', '--hw')).toBeLessThanOrEqual(v('h3', '--hw'));
    expect(v('h3', '--hw')).toBeLessThanOrEqual(v('h6', '--hw'));
    expect(v('h1', '--len')).toBeLessThan(v('h3', '--len'));
    expect(v('h3', '--len')).toBeLessThan(v('h6', '--len'));
  });
});
