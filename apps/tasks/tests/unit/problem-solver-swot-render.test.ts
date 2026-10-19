import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSwotView } from '../../../../packages/problem-solver/render/swot';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const of = (from: string, to: string): PsEdge => ({ from, to, kind: 'of' }) as PsEdge;
const swot = (nodes: PsNode[], edges: PsEdge[] = []) => run('swot', nodes, edges);

const item = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const button = (view: { el: HTMLElement }, id: string) => {
  const host = item(view, id);
  return host.matches('button') ? (host as HTMLButtonElement) : host.querySelector<HTMLButtonElement>('button')!;
};
const shown = (view: { el: HTMLElement }, quadrant: string) =>
  [...view.el.querySelectorAll<HTMLElement>(`[data-quadrant="${quadrant}"] [data-node]`)].filter((el) => !el.hidden).map((el) => el.dataset.node);

/** Goal, two options; option 1 has a strength and a threat, option 2 a strength and a weakness. */
const FULL = [node('g', 'goal', { title: 'Steady income' }), node('o1', 'option:1', { title: 'Sundays' }), node('o2', 'option:2', { title: 'Market stall' }), node('s1', 'strength:1'), node('t1', 'threat:1'), node('s2', 'strength:2'), node('w1', 'weakness:1')];
const FULL_EDGES = [of('s1', 'o1'), of('t1', 'o1'), of('s2', 'o2'), of('w1', 'o2')];

const proto = HTMLElement.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});
function spyAnimate() {
  proto.animate = () => null;
  return vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
}

describe('SWOT view', () => {
  // Baseline 1-8.
  it('renders nothing for an empty run', () => {
    const view = createSwotView();
    view.update(swot([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-swot__grid')).toBeNull();
    expect(view.el.querySelector('.ps-swot__band')).toBeNull();
  });

  it('keeps element identity across updates', () => {
    const view = createSwotView();
    view.update(swot([node('g', 'goal'), node('o1', 'option:1'), node('s1', 'strength:1')], [of('s1', 'o1')]));
    const before = ['g', 'o1', 's1'].map((id) => item(view, id));
    view.update(swot(FULL, FULL_EDGES));
    ['g', 'o1', 's1'].forEach((id, i) => expect(item(view, id)).toBe(before[i]));
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createSwotView();
    view.update(swot([node('o1', 'option:1'), node('w1', 'weakness:1', { state: 'contested', objection: 'Is that really yours to fix?' })], [of('w1', 'o1')]));
    const w = item(view, 'w1');
    expect(w.classList.contains('is-contested')).toBe(true);
    expect(w.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that really yours to fix?');
    expect(button(view, 'w1').getAttribute('aria-label')).toContain(', contested');
    button(view, 'w1').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Is that really yours to fix?');
    view.update(swot([node('o1', 'option:1', { state: 'contested', objection: 'Is it an option at all?' }), node('w1', 'weakness:1')], [of('w1', 'o1')]));
    expect(w.classList.contains('is-contested')).toBe(false);
    expect(w.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'w1').getAttribute('aria-label')).not.toContain('contested');
    expect(item(view, 'o1').classList.contains('is-contested')).toBe(true);
    expect(button(view, 'o1').getAttribute('aria-label')).toContain(', contested');
  });

  it('opens one details card at a time', () => {
    const view = createSwotView();
    view.update(swot(FULL, FULL_EDGES));
    button(view, 'g').click();
    button(view, 's2').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 's2').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 'g').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows titles in the shapes and the full answer only in the details', () => {
    const view = createSwotView();
    view.update(swot(FULL, FULL_EDGES));
    expect(item(view, 's2').querySelector('.ps-swot__title')!.textContent).toBe('Strength:2 title');
    for (const shape of view.el.querySelectorAll('[data-shape]')) expect(shape.textContent).not.toContain('answer text');
    expect([...view.el.querySelectorAll('.ps-details')].some((card) => card.textContent!.includes('strength:2 answer text'))).toBe(true);
  });

  it('starts no animation on a second identical update', () => {
    const animate = spyAnimate();
    const view = createSwotView();
    view.update(swot([]));
    const all = [...FULL, node('syn', 'synthesis'), node('ch', 'choice')];
    view.update(swot(all, FULL_EDGES));
    expect(animate).toHaveBeenCalled();
    animate.mockClear();
    view.update(swot(all, FULL_EDGES));
    expect(animate).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const animate = spyAnimate();
    const view = createSwotView();
    view.update(swot([...FULL, node('syn', 'synthesis'), node('ch', 'choice')], FULL_EDGES));
    expect(animate).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createSwotView();
    view.update(swot([...FULL, node('u1', 'opportunity:1'), node('syn', 'synthesis'), node('ch', 'choice')], FULL_EDGES));
    for (const id of ['o2', 's2', 'w1', 'u1', 'syn', 'ch']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(swot(FULL.filter((n) => !['o2', 's2', 'w1'].includes(n.id)), [of('s1', 'o1'), of('t1', 'o1')]));
    for (const id of ['o2', 's2', 'w1', 'u1', 'syn', 'ch']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(view.el.querySelectorAll('[role="tab"]').length).toBe(1);
    expect(view.el.querySelector('.ps-swot__unplaced')).toBeNull();
  });

  // Tool-specific.
  it('renders a strength linked to option 1 in the strength quadrant', () => {
    const view = createSwotView();
    view.update(swot([node('o1', 'option:1'), node('s1', 'strength:1')], [of('s1', 'o1')]));
    expect(item(view, 's1').closest('[data-quadrant]')!.getAttribute('data-quadrant')).toBe('strength');
    expect(view.el.querySelectorAll('[data-quadrant]').length).toBe(4);
    // One option: no tabs.
    expect(view.el.querySelector<HTMLElement>('.ps-swot__tabs')!.hidden).toBe(true);
  });

  it('shows the newest option with an item by default; switching to another shows only its items and closes an open card', () => {
    const view = createSwotView();
    view.update(swot(FULL, FULL_EDGES));
    expect(shown(view, 'strength')).toEqual(['s2']);
    expect(view.el.querySelector<HTMLElement>('.ps-swot__tabs')!.hidden).toBe(false);
    button(view, 's2').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    const tabs = [...view.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Option 1: Sundays', 'Option 2: Market stall']);
    tabs[0].click();
    expect(shown(view, 'strength')).toEqual(['s1']);
    expect(shown(view, 'threat')).toEqual(['t1']);
    expect(shown(view, 'weakness')).toEqual([]);
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(0);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    // The option band shows the selected option.
    const bandShown = [...view.el.querySelectorAll<HTMLElement>('.ps-swot__band--option [data-node]')].filter((el) => !el.hidden);
    expect(bandShown.map((el) => el.dataset.node)).toEqual(['o1']);
    expect(bandShown[0].querySelector('.ps-swot__title')!.textContent).toBe('Sundays');
    // A picked tab sticks through later updates.
    view.update(swot([...FULL, node('p1', 'opportunity:1')], [...FULL_EDGES, of('p1', 'o2')]));
    expect(shown(view, 'strength')).toEqual(['s1']);
  });

  it('switches option with a sideways swipe on the grid', () => {
    const view = createSwotView();
    view.update(swot(FULL, FULL_EDGES));
    const grid = view.el.querySelector<HTMLElement>('.ps-swot__grid')!;
    const pointer = (type: string, x: number, y = 100) => grid.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { clientX: x, clientY: y, pointerId: 1 }));
    pointer('pointerdown', 100);
    pointer('pointerup', 220);
    expect(shown(view, 'strength')).toEqual(['s1']);
    pointer('pointerdown', 200);
    pointer('pointerup', 190);
    expect(shown(view, 'strength')).toEqual(['s1']);
    pointer('pointerdown', 220);
    pointer('pointerup', 100);
    expect(shown(view, 'strength')).toEqual(['s2']);
  });

  it('lists items with no option in the Unplaced row', () => {
    const view = createSwotView();
    view.update(swot([node('o1', 'option:1'), node('s1', 'strength:1'), node('t1', 'threat:1', { title: 'Rival stall' })], [of('s1', 'o1')]));
    const row = view.el.querySelector('.ps-swot__unplaced')!;
    expect(row.contains(item(view, 't1'))).toBe(true);
    expect(row.contains(item(view, 's1'))).toBe(false);
    expect(item(view, 't1').textContent).toContain('Rival stall');
    // Once linked it moves into its quadrant and the row goes.
    const t1 = item(view, 't1');
    view.update(swot([node('o1', 'option:1'), node('s1', 'strength:1'), node('t1', 'threat:1', { title: 'Rival stall' })], [of('s1', 'o1'), of('t1', 'o1')]));
    expect(item(view, 't1')).toBe(t1);
    expect(t1.closest('[data-quadrant]')!.getAttribute('data-quadrant')).toBe('threat');
    expect(view.el.querySelector('.ps-swot__unplaced')).toBeNull();
  });

  it('shows the synthesis card only with synthesis', () => {
    const view = createSwotView();
    view.update(swot(FULL, FULL_EDGES));
    expect(view.el.querySelector('.ps-swot__synthesis')).toBeNull();
    view.update(swot([...FULL, node('syn', 'synthesis', { text: 'Build on the bread; shrink the rota gap.' })], FULL_EDGES));
    const card = view.el.querySelector('.ps-swot__synthesis')!;
    expect(card.querySelector('.ps-swot__synthesis-text')!.textContent).toBe('Build on the bread; shrink the rota gap.');
    expect([...card.querySelectorAll('.ps-swot__move')].map((m) => m.textContent)).toEqual(['Build on', 'Shrink', 'Counter', 'Convert']);
  });

  it('shows the goal title in the Goal band, and the grid only with the first option', () => {
    const view = createSwotView();
    view.update(swot([node('g', 'goal', { title: 'Steady income' })]));
    expect(view.el.querySelector('.ps-swot__band--goal .ps-swot__title')!.textContent).toBe('Steady income');
    expect(view.el.querySelector('.ps-swot__grid')).toBeNull();
    view.update(swot([node('g', 'goal', { title: 'Steady income' }), node('o1', 'option:1')]));
    expect(view.el.querySelector('.ps-swot__grid')).not.toBeNull();
  });

  describe('chosen option', () => {
    it('is absent until the choice exists, then shows its full text; removing the node removes the card', () => {
      const view = createSwotView();
      view.update(swot(FULL, FULL_EDGES));
      expect(view.el.querySelector('[data-choice]')).toBeNull();
      view.update(swot([...FULL, node('ch', 'choice', { text: 'Run the market stall for a month.' })], FULL_EDGES));
      expect(view.el.querySelector('[data-choice] .ps-choice__text')!.textContent).toBe('Run the market stall for a month.');
      view.update(swot(FULL, FULL_EDGES));
      expect(view.el.querySelector('[data-choice]')).toBeNull();
    });
  });

  it('ignores swipes after destroy', () => {
    const view = createSwotView();
    view.update(swot(FULL, FULL_EDGES));
    view.destroy();
    const grid = view.el.querySelector<HTMLElement>('.ps-swot__grid')!;
    grid.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 100, clientY: 0, pointerId: 1 }));
    grid.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 260, clientY: 0, pointerId: 1 }));
    expect(shown(view, 'strength')).toEqual(['s2']);
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* SWOT analysis');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: swot / inline-size');
    expect(section).toContain('@container swot (');
    expect(section).not.toMatch(/@container \(/);
  });
});
