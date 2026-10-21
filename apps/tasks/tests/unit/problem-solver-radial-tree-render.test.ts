import { describe, expect, it } from 'vitest';
import { createRadialTreeView } from '../../../../packages/problem-solver/render/radial-tree';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'radial_tree', status: 'active', nodes, edges, ...extra });
const parent = (from: string, to: string): PsEdge => ({ from, to, kind: 'parent' });
const item = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
const toggle = (view: { el: HTMLElement }, layout: 'radial' | 'vertical') => view.el.querySelector<HTMLButtonElement>(`[data-layout-option="${layout}"]`)!;

// root → n1, n2; n1 → n3; n3 → n4
const tree = [node('root', 'root'), node('n1', 'node:1'), node('n2', 'node:2'), node('n3', 'node:3'), node('n4', 'node:4')];
const links = [parent('n1', 'root'), parent('n2', 'root'), parent('n3', 'n1'), parent('n4', 'n3')];

describe('Radial tree view', () => {
  it('renders no nodes, disc or toggle for an empty run', () => {
    const view = createRadialTreeView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-radial__stage')).toBeNull();
    expect(view.el.querySelector('.ps-radial__disc')).toBeNull();
    expect(view.el.querySelector('[data-layout-option]')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Radial tree');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createRadialTreeView();
    view.update(run(tree.slice(0, 2), links.slice(0, 1)));
    const root = item(view, 'root');
    const first = item(view, 'n1');
    const disc = view.el.querySelector('.ps-radial__disc');
    view.update(run(tree, links));
    expect(item(view, 'root')).toBe(root);
    expect(item(view, 'n1')).toBe(first);
    expect(view.el.querySelector('.ps-radial__disc')).toBe(disc);
    expect(view.el.querySelectorAll('[data-node]').length).toBe(5);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createRadialTreeView();
    view.update(run([node('root', 'root'), node('n1', 'node:1', { state: 'contested', objection: 'Is that a kind of thing or a place?' })]));
    const el = item(view, 'n1');
    expect(el.classList.contains('is-contested')).toBe(true);
    expect(el.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that a kind of thing or a place?');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Is that a kind of thing or a place?');
  });

  it('opens one details card at a time', () => {
    const view = createRadialTreeView();
    view.update(run(tree, links));
    const card = (id: string) => view.el.querySelector(`#${button(view, id).getAttribute('aria-controls')}`)!;
    button(view, 'n1').click();
    expect(item(view, 'n1').classList.contains('is-open')).toBe(true);
    expect(card('n1').classList.contains('is-open')).toBe(true);
    button(view, 'n4').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['n4']);
    expect(card('n1').classList.contains('is-open')).toBe(false);
    expect(card('n4').classList.contains('is-open')).toBe(true);
    expect(button(view, 'n1').getAttribute('aria-expanded')).toBe('false');
    expect(button(view, 'n4').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the short title on the node and the full answer only in details', () => {
    const view = createRadialTreeView();
    view.update(run([node('root', 'root', { title: 'Weekend trips', text: 'Every weekend trip we took last year, broken down by what went into it.' })]));
    expect(item(view, 'root').querySelector('.ps-radial__title')!.textContent).toBe('Weekend trips');
    expect(item(view, 'root').textContent).not.toContain('broken down by');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('broken down by'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('puts the root at the centre as level 1', () => {
    const view = createRadialTreeView();
    view.update(run(tree, links));
    const root = item(view, 'root');
    expect(root.getAttribute('data-level')).toBe('1');
    expect(root.style.getPropertyValue('--x')).toBe('0');
    expect(root.style.getPropertyValue('--y')).toBe('110');
  });

  it('gives a child with a parent link the level below its parent', () => {
    const view = createRadialTreeView();
    view.update(run(tree, links));
    expect(item(view, 'n1').getAttribute('data-level')).toBe('2');
    expect(item(view, 'n3').getAttribute('data-level')).toBe('3');
    expect(item(view, 'n4').getAttribute('data-level')).toBe('4');
    // A node with no parent link hangs from the root.
    view.update(run([...tree, node('n5', 'node:5')], links));
    expect(item(view, 'n5').getAttribute('data-level')).toBe('2');
  });

  it('draws a ring for each level from 2 down to the deepest', () => {
    const view = createRadialTreeView();
    view.update(run([node('root', 'root')]));
    expect(view.el.querySelectorAll('.ps-radial__ring').length).toBe(0);
    view.update(run(tree.slice(0, 3), links.slice(0, 2)));
    expect([...view.el.querySelectorAll('.ps-radial__ring')].map((r) => r.getAttribute('data-level'))).toEqual(['2']);
    const ring2 = view.el.querySelector('.ps-radial__ring[data-level="2"]');
    view.update(run(tree, links));
    expect([...view.el.querySelectorAll('.ps-radial__ring')].map((r) => r.getAttribute('data-level'))).toEqual(['2', '3', '4']);
    expect(view.el.querySelector('.ps-radial__ring[data-level="2"]')).toBe(ring2);
  });

  it('draws one link per child, from its parent', () => {
    const view = createRadialTreeView();
    view.update(run(tree, links));
    const drawn = [...view.el.querySelectorAll('[data-link]')].map((l) => l.getAttribute('data-link')).sort();
    expect(drawn).toEqual(['n1:root', 'n2:root', 'n3:n1', 'n4:n3']);
  });

  it('toggles to a vertical tree with the same node elements, and back', () => {
    const view = createRadialTreeView();
    view.update(run(tree, links));
    expect(view.el.getAttribute('data-layout')).toBe('radial');
    const before = [...view.el.querySelectorAll('[data-node]')];
    const group = view.el.querySelector('[data-layout-option]')!.closest('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Layout');
    expect(toggle(view, 'radial').getAttribute('aria-pressed')).toBe('true');

    toggle(view, 'vertical').click();
    expect(view.el.getAttribute('data-layout')).toBe('vertical');
    expect(toggle(view, 'vertical').getAttribute('aria-pressed')).toBe('true');
    expect(toggle(view, 'radial').getAttribute('aria-pressed')).toBe('false');
    expect([...view.el.querySelectorAll('[data-node]')]).toEqual(before);
    before.forEach((el, i) => expect(view.el.querySelectorAll('[data-node]')[i]).toBe(el));
    // Levels are unchanged; the root sits top centre.
    expect(item(view, 'n3').getAttribute('data-level')).toBe('3');
    expect(item(view, 'root').style.getPropertyValue('--x')).toBe('0');
    expect(Number(item(view, 'root').style.getPropertyValue('--y'))).toBeLessThan(Number(item(view, 'n1').style.getPropertyValue('--y')));

    // The choice holds across updates, and new nodes join the vertical tree.
    view.update(run([...tree, node('n5', 'node:5')], [...links, parent('n5', 'n2')]));
    expect(view.el.getAttribute('data-layout')).toBe('vertical');
    expect(item(view, 'n1')).toBe(before[1]);

    toggle(view, 'radial').click();
    expect(view.el.getAttribute('data-layout')).toBe('radial');
    expect(item(view, 'root').style.getPropertyValue('--y')).toBe('110');
  });

  it('keeps the toggle and its own focus when the layout switches', () => {
    const view = createRadialTreeView();
    document.body.append(view.el);
    view.update(run(tree, links));
    const vertical = toggle(view, 'vertical');
    vertical.focus();
    vertical.click();
    expect(document.activeElement).toBe(vertical);
    view.el.remove();
  });

  it('shows the review as a card under the chart with its full text', () => {
    const view = createRadialTreeView();
    view.update(run([...tree, node('rv', 'review', { text: 'Two branches carry most of the weight; the third is thin and needs a second look.' })], links));
    const review = item(view, 'rv');
    expect(review.classList.contains('ps-radial__review')).toBe(true);
    expect(review.closest('.ps-radial__stage')).toBeNull();
    expect(review.querySelector('.ps-radial__review-text')!.textContent).toBe('Two branches carry most of the weight; the third is thin and needs a second look.');
    expect(view.el.lastElementChild).toBe(review);
  });
});

type Laid = { el: HTMLElement; update(run: PsToolRun): void; layout(width: number): void };
const code = (view: { el: HTMLElement }, id: string) => item(view, id).querySelector('.ps-radial__code')!.textContent;
const pos = (view: { el: HTMLElement }, id: string) => {
  const el = item(view, id);
  return { x: Number(el.style.getPropertyValue('--x')), y: Number(el.style.getPropertyValue('--y')), r: Number(el.style.getPropertyValue('--r')) };
};

describe('Radial tree view: codes, key, root caption and depth', () => {
  it('gives level-2 branches a letter and deeper nodes the branch letter plus an index', () => {
    const view = createRadialTreeView();
    view.update(run([...tree, node('n5', 'node:5')], [...links, parent('n5', 'n2')]));
    expect(code(view, 'n1')).toBe('A');
    expect(code(view, 'n2')).toBe('B');
    expect(code(view, 'n3')).toBe('A1');
    expect(code(view, 'n4')).toBe('A2');
    expect(code(view, 'n5')).toBe('B1');
    expect(item(view, 'root').querySelector('.ps-radial__code')).toBeNull();
  });

  it('lists deeper nodes in a key under the chart, grouped by branch, each row opening its node', () => {
    const view = createRadialTreeView();
    view.update(run(tree.slice(0, 3), links.slice(0, 2)));
    expect(view.el.querySelector('.ps-radial__key')).toBeNull();
    view.update(run(tree, links));
    const key = view.el.querySelector<HTMLElement>('.ps-radial__key')!;
    expect(key.closest('.ps-radial__stage')).toBeNull();
    const groups = [...key.querySelectorAll('[data-branch]')];
    expect(groups.map((g) => g.getAttribute('data-branch'))).toEqual(['n1']);
    expect(groups[0].querySelector('.ps-radial__key-head')!.textContent).toContain('A');
    expect(groups[0].querySelector('.ps-radial__key-head')!.textContent!.toLowerCase()).toContain('node:1 title');
    const rows = [...key.querySelectorAll<HTMLButtonElement>('button[data-key]')];
    expect(rows.map((r) => r.getAttribute('data-key'))).toEqual(['n3', 'n4']);
    expect(rows[0].textContent).toContain('A1');
    expect(rows[0].textContent!.toLowerCase()).toContain('node:3 title');
    rows[0].click();
    expect(item(view, 'n3').classList.contains('is-open')).toBe(true);
    expect(rows[0].getAttribute('aria-expanded')).toBe('true');
  });

  it('tries beside-labels for level 3 only on a wide container', () => {
    const view = createRadialTreeView() as unknown as Laid;
    view.update(run(tree, links));
    view.layout(900);
    expect(view.el.getAttribute('data-compact')).toBe('false');
    const label = item(view, 'n3').querySelector('.ps-radial__label')!;
    expect(label.classList.contains('is-beside')).toBe(true);
    expect(view.el.querySelector('button[data-key="n3"]')!.classList.contains('is-labelled')).toBe(true);
    view.layout(390);
    expect(view.el.getAttribute('data-compact')).toBe('true');
    expect(view.el.querySelectorAll('.ps-radial__label.is-beside').length).toBe(0);
    expect(view.el.querySelector('button[data-key="n3"]')!.classList.contains('is-labelled')).toBe(false);
  });

  it('puts a short root title inside the centre node, and a long one in a caption above the disc', () => {
    const short = createRadialTreeView() as unknown as Laid;
    short.update(run([node('root', 'root', { title: 'Trips' })]));
    short.layout(390);
    expect(item(short, 'root').querySelector('.ps-radial__label')!.getAttribute('data-side')).toBe('inside');
    expect(short.el.querySelector('.ps-radial__caption')).toBeNull();

    const long = createRadialTreeView() as unknown as Laid;
    long.update(run([node('root', 'root', { title: 'Allotment volunteer rotas' })]));
    long.layout(390);
    const caption = long.el.querySelector('.ps-radial__caption')!;
    expect(caption.textContent).toBe('Allotment volunteer rotas');
    expect(caption.compareDocumentPosition(long.el.querySelector('.ps-radial__stage')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(item(long, 'root').querySelector('.ps-radial__label')!.getAttribute('data-side')).toBe('caption');
  });

  it('never draws two nodes on top of each other, even on a crowded ring', () => {
    const view = createRadialTreeView();
    const nodes = [node('root', 'root')];
    const edges: PsEdge[] = [];
    for (let b = 1; b <= 4; b += 1) nodes.push(node(`b${b}`, `node:${b}`));
    for (let i = 1; i <= 36; i += 1) {
      nodes.push(node(`c${i}`, `node:${4 + i}`));
      edges.push(parent(`c${i}`, `b${1 + (i % 4)}`));
    }
    view.update(run(nodes, edges));
    for (const layout of ['radial', 'vertical'] as const) {
      if (layout === 'vertical') toggle(view, 'vertical').click();
      const all = nodes.map((n) => pos(view, n.id));
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
          // Vertical stacks overlap a little by design (as in the book), but never more than half.
          const allowed = layout === 'radial' ? all[i].r + all[j].r : Math.max(all[i].r, all[j].r);
          expect(d, `${layout} ${nodes[i].id}/${nodes[j].id}`).toBeGreaterThanOrEqual(allowed - 0.01);
        }
      }
    }
  });

  it('draws a node that the data puts below level 5 on the rim, beside its siblings', () => {
    const view = createRadialTreeView();
    const chain = [node('root', 'root'), node('a', 'node:1'), node('b', 'node:2'), node('c', 'node:3'), node('d', 'node:4'), node('e', 'node:5')];
    view.update(run(chain, [parent('a', 'root'), parent('b', 'a'), parent('c', 'b'), parent('d', 'c'), parent('e', 'd')]));
    expect(item(view, 'e').getAttribute('data-level')).toBe('5');
    const d = pos(view, 'd');
    const e = pos(view, 'e');
    expect(Math.hypot(d.x - e.x, d.y - e.y)).toBeGreaterThanOrEqual(d.r + e.r);
  });
});
