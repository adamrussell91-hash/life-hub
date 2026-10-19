import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDoubleLoopView } from '../../../../packages/problem-solver/render/double-loop';
import { loopStage } from '../../../../packages/problem-solver/tools/double-loop.mjs';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const dl = (nodes: PsNode[]) => run('double_loop', nodes);

type View = ReturnType<typeof createDoubleLoopView>;
const box = (view: View, key: string) => view.el.querySelector<HTMLElement>(`[data-box="${key}"]`)!;
const button = (view: View, key: string) => box(view, key).querySelector<HTMLButtonElement>('.ps-dloop__button')!;
const loop = (view: View, which: string) => view.el.querySelector<SVGElement>(`[data-loop="${which}"]`)!;
const arrow = (view: View, which: string) => view.el.querySelector<SVGElement>(`[data-arrow="${which}"]`)!;
const marker = (view: View) => view.el.querySelector<HTMLElement>('.ps-dloop__marker')!;

const P = node('p', 'problem', { text: 'Orders keep shipping to old addresses.', title: 'Old addresses' });
const S = node('s', 'single', { text: 'We corrected the address on each order by hand.', title: 'Fixed by hand' });
const RY = node('r', 'recurs', { tag: 'yes', text: 'Twelve more went out wrong the next month.', title: 'Came back' });
const RN = node('r', 'recurs', { tag: 'no', text: 'None since.', title: 'Held' });
const G1 = node('g1', 'governing:1', { title: 'Addresses copied once' });
const G2 = node('g2', 'governing:2', { title: 'Nobody owns the record' });
const RF = node('rf', 'reframe', { title: 'One record, many copies' });
const ST = node('st', 'strategy:1', { title: 'Single address record' });
const T = node('t', 'test', { title: 'Try with one region' });
const M = node('m', 'monitor', { title: 'Monthly check' });
const FULL = [P, S, RY, G1, G2, RF, ST, T, M];

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});
function spyAnimate() {
  proto.animate = () => null;
  const handles: Array<{ target: Element; cancel: ReturnType<typeof vi.fn> }> = [];
  const spy = vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element) {
    const handle = { target: this, cancel: vi.fn(), finish() {}, onfinish: null };
    handles.push(handle);
    return handle as unknown as Animation;
  });
  return { spy, handles };
}

describe('Double-loop learning view', () => {
  // Baseline 1-8.
  it('draws nothing for an empty run: no node, no stage, no loops', () => {
    const view = createDoubleLoopView();
    view.update(dl([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-dloop__stage')).toBeNull();
    expect(view.el.querySelector('[data-loop]')).toBeNull();
    expect(view.el.getAttribute('aria-label')).toBe('Double-loop learning');
  });

  it('keeps element identity across updates', () => {
    const view = createDoubleLoopView();
    view.update(dl([P]));
    const before = view.el.querySelector('[data-node="p"]');
    const stage = view.el.querySelector('.ps-dloop__stage');
    const outer = loop(view, 'outer');
    view.update(dl(FULL));
    expect(view.el.querySelector('[data-node="p"]')).toBe(before);
    expect(view.el.querySelector('.ps-dloop__stage')).toBe(stage);
    expect(loop(view, 'outer')).toBe(outer);
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createDoubleLoopView();
    view.update(dl([P, { ...S, state: 'contested', objection: 'Was that a fix or a workaround?' }]));
    const item = box(view, 'action');
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Was that a fix or a workaround?');
    expect(button(view, 'action').getAttribute('aria-label')).toContain(', contested');
    button(view, 'action').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Was that a fix or a workaround?');
    view.update(dl([P, S]));
    expect(item.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'action').getAttribute('aria-label')).not.toContain('contested');
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')).toBeNull();
  });

  it('opens one details card at a time', () => {
    const view = createDoubleLoopView();
    view.update(dl(FULL));
    button(view, 'problem').click();
    button(view, 'action').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'action').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 'problem').getAttribute('aria-expanded')).toBe('false');
    expect(box(view, 'action').classList.contains('is-open')).toBe(true);
    expect(box(view, 'problem').classList.contains('is-open')).toBe(false);
  });

  it('shows the node title in the box and the full answer only in the details', () => {
    const view = createDoubleLoopView();
    view.update(dl(FULL));
    expect(box(view, 'problem').querySelector('.ps-dloop__title')!.textContent).toBe('Old addresses');
    expect(box(view, 'problem').querySelector('.ps-dloop__meta')!.textContent).toBe('Problem');
    const full = 'Orders keep shipping to old addresses.';
    const holders = [...view.el.querySelectorAll('*')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.includes(full)));
    expect(holders.length).toBeGreaterThan(0);
    expect(holders.every((el) => el.closest('.ps-details'))).toBe(true);
  });

  it('starts no animation on a second identical update', () => {
    const { spy } = spyAnimate();
    const view = createDoubleLoopView();
    view.update(dl([]));
    view.update(dl(FULL));
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    view.update(dl(FULL));
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const { spy } = spyAnimate();
    const view = createDoubleLoopView();
    view.update(dl(FULL));
    expect(spy).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createDoubleLoopView();
    view.update(dl(FULL));
    button(view, 'governing').click();
    for (const id of ['g2', 'rf', 'm']) expect(view.el.querySelectorAll(`[data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(dl([P, S, RY, G1]));
    for (const id of ['g2', 'rf', 'st', 't', 'm']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(box(view, 'governing').getAttribute('data-node')).toBe('g1');
    expect(box(view, 'solution').hasAttribute('data-node')).toBe(false);
    expect(button(view, 'solution').disabled).toBe(true);
  });

  // Tool-specific.
  it('draws the outer loop only once the problem is said to recur', () => {
    const view = createDoubleLoopView();
    view.update(dl([P, S]));
    expect(loop(view, 'outer').getAttribute('data-drawn')).toBe('false');
    expect(arrow(view, 'mismatch').getAttribute('data-lit')).toBe('false');
    view.update(dl([P, S, RY]));
    expect(loop(view, 'outer').getAttribute('data-drawn')).toBe('true');
    expect(arrow(view, 'mismatch').getAttribute('data-lit')).toBe('true');
    expect(arrow(view, 'match').getAttribute('data-lit')).toBe('false');
  });

  it('lights the Match arrow and leaves the outer loop faint when it held', () => {
    const view = createDoubleLoopView();
    view.update(dl([P, S, RN]));
    expect(arrow(view, 'match').getAttribute('data-lit')).toBe('true');
    expect(arrow(view, 'mismatch').getAttribute('data-lit')).toBe('false');
    expect(loop(view, 'outer').getAttribute('data-drawn')).toBe('false');
    expect(box(view, 'consequences').querySelector('.ps-dloop__tag')!.textContent).toBe('Match: it held');
  });

  it('draws the inner loop once the single-loop fix exists', () => {
    const view = createDoubleLoopView();
    view.update(dl([P]));
    expect(loop(view, 'inner').getAttribute('data-drawn')).toBe('false');
    view.update(dl([P, S]));
    expect(loop(view, 'inner').getAttribute('data-drawn')).toBe('true');
  });

  it('rests the marker on the box of the latest node', () => {
    const view = createDoubleLoopView();
    const steps = [[P], [P, S], [P, S, RY], [P, S, RY, G1]];
    const seen: string[] = [];
    for (const nodes of steps) {
      view.update(dl(nodes));
      seen.push(marker(view).getAttribute('data-stage')!);
      expect(seen.at(-1)).toBe(loopStage(dl(nodes)));
      expect(box(view, seen.at(-1)!).contains(marker(view))).toBe(true);
    }
    expect(seen).toEqual(['problem', 'action', 'consequences', 'governing']);
  });

  it('counts extra entries on a box and lists every entry in its details', () => {
    const view = createDoubleLoopView();
    view.update(dl([P, S, RY, G1, G2]));
    const gov = box(view, 'governing');
    expect(gov.querySelector('.ps-dloop__count')!.textContent).toBe('+1');
    expect(gov.querySelector('.ps-dloop__title')!.textContent).toBe('Nobody owns the record');
    button(view, 'governing').click();
    const open = view.el.querySelector('.ps-details.is-open')!;
    expect(open.querySelector('[data-for="g1"]')).not.toBeNull();
    expect(open.querySelector('[data-for="g2"]')).not.toBeNull();
    view.update(dl([P, S, RY, G1]));
    expect(gov.querySelector('.ps-dloop__count')!.textContent).toBe('');
  });

  it('marks a new strategy, a reframe and the recurrence in their boxes', () => {
    const view = createDoubleLoopView();
    view.update(dl(FULL.slice(0, 7)));
    expect(box(view, 'action').querySelector('.ps-dloop__tag')!.textContent).toBe('New');
    expect(box(view, 'action').querySelector('.ps-dloop__title')!.textContent).toBe('Single address record');
    expect(box(view, 'governing').querySelector('.ps-dloop__tag')!.textContent).toBe('Reframed');
    expect(box(view, 'consequences').querySelector('.ps-dloop__tag')!.textContent).toBe('Mismatch: it came back');
    view.update(dl(FULL));
    expect(box(view, 'consequences').querySelector('.ps-dloop__title')!.textContent).toBe('Try with one region');
    expect(box(view, 'consequences').querySelector('.ps-dloop__tag')!.textContent).toBe('Mismatch: it came back');
  });

  it('un-draws the outer loop on undo of the recurrence, leaving no animation running', () => {
    const { handles } = spyAnimate();
    const view = createDoubleLoopView();
    view.update(dl([P, S]));
    view.update(dl([P, S, RY]));
    const outer = loop(view, 'outer');
    const drawing = handles.filter((h) => outer.contains(h.target));
    expect(drawing.length).toBeGreaterThan(0);
    view.update(dl([P, S]));
    expect(outer.getAttribute('data-drawn')).toBe('false');
    expect(drawing.every((h) => h.cancel.mock.calls.length > 0)).toBe(true);
    expect(arrow(view, 'mismatch').getAttribute('data-lit')).toBe('false');
    expect(box(view, 'consequences').querySelector('.ps-dloop__tag')!.textContent).toBe('');
  });

  it('keeps faint boxes for every heading once the stage exists, filling only those with entries', () => {
    const view = createDoubleLoopView();
    view.update(dl([P]));
    const keys = [...view.el.querySelectorAll('[data-box]')].map((item) => item.getAttribute('data-box'));
    expect(keys).toEqual(['problem', 'action', 'consequences', 'governing', 'solution']);
    expect([...view.el.querySelectorAll('.ps-dloop__shape')].map((s) => s.getAttribute('data-fill'))).toEqual(['red', 'paper', 'paper', 'paper', 'paper']);
    view.update(dl(FULL));
    expect([...view.el.querySelectorAll('.ps-dloop__shape')].map((s) => s.getAttribute('data-fill'))).toEqual(['red', 'yellow', 'yellow', 'yellow', 'blue']);
  });

  it('has a key pairing each code with its heading, which opens the box details', () => {
    const view = createDoubleLoopView();
    view.update(dl([P, S]));
    const items = [...view.el.querySelectorAll<HTMLButtonElement>('.ps-dloop__key-item')];
    expect(items.map((item) => item.querySelector('.ps-dloop__key-code')!.textContent)).toEqual(['P', 'A', 'C', 'G', 'S']);
    expect(items[1].querySelector('.ps-dloop__key-title')!.textContent).toBe('Fixed by hand');
    expect(items[2].disabled).toBe(true);
    items[1].click();
    expect(button(view, 'action').getAttribute('aria-expanded')).toBe('true');
    expect(items[1].classList.contains('is-open')).toBe(true);
  });

  it('keeps the list to list items', () => {
    const view = createDoubleLoopView();
    view.update(dl(FULL));
    const lists = view.el.querySelectorAll('[role="list"]');
    expect(lists.length).toBe(1);
    expect([...lists[0].children].every((child) => child.getAttribute('role') === 'listitem')).toBe(true);
  });

  it('does nothing after destroy', () => {
    const view = createDoubleLoopView();
    view.update(dl([P]));
    view.destroy();
    view.update(dl(FULL));
    expect(box(view, 'action').hasAttribute('data-node')).toBe(false);
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* Double-loop learning');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: dloop / inline-size');
    expect(section).toContain('@container dloop (');
    expect(section).not.toMatch(/@container \(/);
  });
});
