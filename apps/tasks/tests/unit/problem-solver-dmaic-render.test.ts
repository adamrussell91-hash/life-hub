import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDmaicView } from '../../../../packages/problem-solver/render/dmaic';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const dmaic = (nodes: PsNode[]) => run('dmaic', nodes);

type View = ReturnType<typeof createDmaicView>;
const band = (view: View, phase: string) => view.el.querySelector<HTMLElement>(`[data-phase="${phase}"]`)!;
const button = (view: View, phase: string) => band(view, phase).querySelector<HTMLButtonElement>('button')!;
const title = (view: View, phase: string) => {
  const head = band(view, phase).querySelector<HTMLElement>('.ps-dmaic__head')!;
  return head.hidden ? null : head.querySelector('.ps-dmaic__title')!.textContent;
};
const tabs = (view: View) => [...view.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

const PASS1 = [node('d1', 'define:1'), node('m1', 'measure:1'), node('a1', 'analyse:1'), node('i1', 'improve:1')];
const PASS2 = [node('r1', 'repeat:1', { text: 'Sourdough ran out early; plan each loaf type next.' }), node('d2', 'define:2'), node('m2', 'measure:2'), node('a2', 'analyse:2'), node('i2', 'improve:2')];
const FULL = [...PASS1, ...PASS2, node('c', 'control')];

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete proto.animate;
});
function spyAnimate() {
  proto.animate = () => null;
  return vi.spyOn(Element.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
}

describe('DMAIC view', () => {
  // Baseline 1-8.
  it('renders nothing for an empty run', () => {
    const view = createDmaicView();
    view.update(dmaic([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-dmaic__band')).toBeNull();
  });

  it('keeps element identity across updates', () => {
    const view = createDmaicView();
    view.update(dmaic([node('d1', 'define:1')]));
    const before = view.el.querySelector('[data-node="d1"]');
    const bands = [...view.el.querySelectorAll('.ps-dmaic__band')];
    view.update(dmaic(PASS1));
    expect(view.el.querySelector('[data-node="d1"]')).toBe(before);
    expect([...view.el.querySelectorAll('.ps-dmaic__band')]).toEqual(bands);
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createDmaicView();
    view.update(dmaic([node('d1', 'define:1'), node('m1', 'measure:1', { state: 'contested', objection: 'Is two weeks a fair baseline?' })]));
    const m = band(view, 'measure');
    expect(m.classList.contains('is-contested')).toBe(true);
    expect(m.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is two weeks a fair baseline?');
    expect(button(view, 'measure').getAttribute('aria-label')).toContain(', contested');
    button(view, 'measure').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Is two weeks a fair baseline?');
    view.update(dmaic([node('d1', 'define:1'), node('m1', 'measure:1')]));
    expect(m.classList.contains('is-contested')).toBe(false);
    expect(m.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'measure').getAttribute('aria-label')).not.toContain('contested');
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')).toBeNull();
  });

  it('opens one details card at a time', () => {
    const view = createDmaicView();
    view.update(dmaic(PASS1));
    button(view, 'define').click();
    button(view, 'analyse').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'analyse').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 'define').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows titles in the bands and the full answer only in the details', () => {
    const view = createDmaicView();
    view.update(dmaic(PASS1));
    expect(title(view, 'analyse')).toBe('Analyse:1 title');
    for (const shape of view.el.querySelectorAll('[data-shape]')) expect(shape.textContent).not.toContain('answer text');
    expect([...view.el.querySelectorAll('.ps-details')].some((card) => card.textContent!.includes('analyse:1 answer text'))).toBe(true);
  });

  it('starts no animation on a second identical update', () => {
    const animate = spyAnimate();
    const view = createDmaicView();
    view.update(dmaic([]));
    view.update(dmaic(FULL));
    expect(animate).toHaveBeenCalled();
    animate.mockClear();
    view.update(dmaic(FULL));
    expect(animate).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const animate = spyAnimate();
    const view = createDmaicView();
    view.update(dmaic(FULL));
    expect(animate).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createDmaicView();
    view.update(dmaic(FULL));
    for (const id of ['r1', 'd2', 'c']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(dmaic(PASS1));
    for (const id of ['r1', 'd2', 'm2', 'a2', 'i2', 'c']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(view.el.querySelector('[data-loop]')).toBeNull();
    expect(view.el.querySelector('.ps-dmaic__badge')).toBeNull();
    expect(view.el.querySelector<HTMLElement>('.ps-dmaic__tabs')!.hidden).toBe(true);
    // Back on pass 1, every band shows its pass 1 node again.
    expect(band(view, 'define').getAttribute('data-node')).toBe('d1');
  });

  // Tool-specific.
  it('shows define:1 on the D band; Measure is faint until measure:1 exists', () => {
    const view = createDmaicView();
    view.update(dmaic([node('d1', 'define:1', { title: 'Halve binned bread' })]));
    expect(view.el.querySelectorAll('.ps-dmaic__band').length).toBe(5);
    expect(title(view, 'define')).toBe('Halve binned bread');
    const measure = band(view, 'measure');
    expect(measure.classList.contains('is-placed')).toBe(false);
    expect(measure.getAttribute('data-fill')).toBe('paper');
    expect(button(view, 'measure').disabled).toBe(true);
    expect(measure.querySelector('.ps-dmaic__desc')!.textContent).toBeTruthy();
    view.update(dmaic([node('d1', 'define:1'), node('m1', 'measure:1')]));
    expect(band(view, 'measure')).toBe(measure);
    expect(measure.classList.contains('is-placed')).toBe(true);
    expect(measure.getAttribute('data-fill')).toBe('blue');
    expect(measure.getAttribute('data-node')).toBe('m1');
    expect(button(view, 'measure').disabled).toBe(false);
  });

  it('draws the loop only once repeat:1 exists, with a Pass 2 badge by the D disc', () => {
    const view = createDmaicView();
    view.update(dmaic(PASS1));
    expect(view.el.querySelector('[data-loop]')).toBeNull();
    expect(view.el.querySelector('.ps-dmaic__badge')).toBeNull();
    view.update(dmaic([...PASS1, PASS2[0]]));
    expect(view.el.querySelector('[data-loop]')).not.toBeNull();
    expect(band(view, 'define').querySelector('.ps-dmaic__badge')!.textContent).toBe('Pass 2');
    // Pass 2 has begun: its bands wait faint for their nodes.
    expect(title(view, 'define')).toBeNull();
    expect(band(view, 'define').classList.contains('is-placed')).toBe(false);
  });

  it('shows pass tabs from pass 2; picking pass 1 shows its titles in the same band elements and closes a card', () => {
    const view = createDmaicView();
    view.update(dmaic(PASS1));
    expect(view.el.querySelector<HTMLElement>('.ps-dmaic__tabs')!.hidden).toBe(true);
    view.update(dmaic(FULL));
    expect(view.el.querySelector<HTMLElement>('.ps-dmaic__tabs')!.hidden).toBe(false);
    expect(tabs(view).map((t) => t.textContent)).toEqual(['Pass 1', 'Pass 2']);
    expect(tabs(view)[1].getAttribute('aria-selected')).toBe('true');
    expect(title(view, 'define')).toBe('Define:2 title');
    const bands = [...view.el.querySelectorAll('.ps-dmaic__band')];
    button(view, 'measure').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    tabs(view)[0].click();
    expect(title(view, 'define')).toBe('Define:1 title');
    expect(title(view, 'improve')).toBe('Improve:1 title');
    expect([...view.el.querySelectorAll('.ps-dmaic__band')]).toEqual(bands);
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(0);
    expect(band(view, 'define').querySelector('.ps-dmaic__badge')!.textContent).toBe('Pass 1');
    // The picked pass sticks through an identical update.
    view.update(dmaic(FULL));
    expect(title(view, 'define')).toBe('Define:1 title');
  });

  it('shows Control on the C band whatever the pass', () => {
    const view = createDmaicView();
    view.update(dmaic(FULL));
    expect(title(view, 'control')).toBe('Control title');
    expect(band(view, 'control').getAttribute('data-node')).toBe('c');
    tabs(view)[0].click();
    expect(title(view, 'control')).toBe('Control title');
  });

  it('shows the reason for going round in a card under the loop', () => {
    const view = createDmaicView();
    view.update(dmaic(FULL));
    const card = view.el.querySelector<HTMLElement>('[data-repeat="1"]')!;
    expect(card.hidden).toBe(false);
    expect(card.getAttribute('data-node')).toBe('r1');
    expect(card.querySelector('.ps-dmaic__repeat-text')!.textContent).toBe('Sourdough ran out early; plan each loaf type next.');
    expect(card.textContent).toContain('Round again after pass 1');
    tabs(view)[0].click();
    expect(card.hidden).toBe(false);
  });

  it('keeps the list to list items: the loop lies outside it', () => {
    const view = createDmaicView();
    view.update(dmaic(FULL));
    const list = view.el.querySelector('[role="list"]')!;
    expect([...list.children].every((child) => child.getAttribute('role') === 'listitem')).toBe(true);
    expect(view.el.querySelectorAll('[role="list"]').length).toBe(1);
  });

  it('returns focus to the band when Escape closes its card', () => {
    const view = createDmaicView();
    document.body.append(view.el);
    view.update(dmaic(PASS1));
    button(view, 'analyse').click();
    const open = view.el.querySelector<HTMLElement>('.ps-details.is-open')!;
    open.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
    expect(document.activeElement).toBe(button(view, 'analyse'));
    view.el.remove();
  });

  it('stops listening after destroy: a resize and a tab click do nothing', () => {
    let fire: (() => void) | null = null;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          fire = cb;
        }
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = disconnect;
      }
    );
    const view = createDmaicView();
    view.update(dmaic(FULL));
    const chart = view.el.querySelector<HTMLElement>('.ps-dmaic__chart')!;
    const rect = vi.spyOn(chart, 'getBoundingClientRect');
    view.destroy();
    expect(disconnect).toHaveBeenCalled();
    (fire as unknown as () => void)();
    expect(rect).not.toHaveBeenCalled();
    tabs(view)[0].click();
    expect(title(view, 'define')).toBe('Define:2 title');
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* DMAIC cycle');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: dmaic / inline-size');
    expect(section).toContain('@container dmaic (');
    expect(section).not.toMatch(/@container \(/);
  });
});
