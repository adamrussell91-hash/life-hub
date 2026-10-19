import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEisenhowerView } from '../../../../packages/problem-solver/render/eisenhower';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const eisen = (nodes: PsNode[]) => run('eisenhower', nodes);
const entry = (id: string, index: number, tag: string, extra: Partial<PsNode> = {}) => node(id, `item:${index}`, { tag, ...extra });

type View = ReturnType<typeof createEisenhowerView>;
const item = (view: View, id: string) => view.el.querySelector<HTMLElement>(`.ps-eisen__item[data-node="${id}"]`)!;
const button = (view: View, id: string) => item(view, id).querySelector<HTMLButtonElement>('button')!;
const quadrantOf = (view: View, id: string) => item(view, id).closest('[data-quadrant]')!.getAttribute('data-quadrant');

const BASE = [entry('e1', 1, 'do'), entry('e2', 2, 'do'), entry('e3', 3, 'schedule'), entry('e4', 4, 'delegate'), entry('e5', 5, 'eliminate')];

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
  document.body.replaceChildren();
});
function spyAnimate() {
  proto.animate = () => null;
  return vi.spyOn(Element.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
}

describe('Eisenhower view', () => {
  // Baseline 1-8.
  it('renders nothing for an empty run', () => {
    const view = createEisenhowerView();
    view.update(eisen([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-eisen__chart')).toBeNull();
    expect(view.el.querySelector('.ps-eisen__icon')).toBeNull();
  });

  it('keeps element identity across updates', () => {
    const view = createEisenhowerView();
    view.update(eisen(BASE.slice(0, 2)));
    const e1 = item(view, 'e1');
    const quad = view.el.querySelector('[data-quadrant="do"]');
    view.update(eisen(BASE));
    expect(item(view, 'e1')).toBe(e1);
    expect(view.el.querySelector('[data-quadrant="do"]')).toBe(quad);
  });

  it('marks a contested item and carries the objection, and follows a later change of state', () => {
    const view = createEisenhowerView();
    view.update(eisen([entry('e1', 1, 'eliminate', { state: 'contested', objection: 'Is dropping this fair?' })]));
    const e1 = item(view, 'e1');
    expect(e1.classList.contains('is-contested')).toBe(true);
    expect(e1.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is dropping this fair?');
    expect(button(view, 'e1').getAttribute('aria-label')).toContain(', contested');
    button(view, 'e1').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Is dropping this fair?');
    view.update(eisen([entry('e1', 1, 'eliminate')]));
    expect(e1.classList.contains('is-contested')).toBe(false);
    expect(e1.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'e1').getAttribute('aria-label')).not.toContain('contested');
  });

  it('opens one details card at a time', () => {
    const view = createEisenhowerView();
    view.update(eisen(BASE));
    button(view, 'e1').click();
    button(view, 'e4').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'e4').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 'e1').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows titles in the pills and the full answer only in the details', () => {
    const view = createEisenhowerView();
    view.update(eisen(BASE));
    expect(item(view, 'e1').querySelector('.ps-eisen__title')!.textContent).toBe('Item:1 title');
    for (const shape of view.el.querySelectorAll('[data-shape]')) expect(shape.textContent).not.toContain('answer text');
    expect([...view.el.querySelectorAll('.ps-details')].some((c) => c.textContent!.includes('item:1 answer text'))).toBe(true);
  });

  it('starts no animation on a second identical update, setTasks or setProposed', () => {
    const animate = spyAnimate();
    const view = createEisenhowerView();
    document.body.append(view.el);
    view.update(eisen([]));
    view.update(eisen(BASE));
    expect(animate).toHaveBeenCalled();
    view.setTasks([{ nodeId: 'e1', taskId: 't1', status: 'open' }]);
    view.setProposed(['e2']);
    animate.mockClear();
    view.update(eisen(BASE));
    view.setTasks([{ nodeId: 'e1', taskId: 't1', status: 'open' }]);
    view.setProposed(['e2']);
    expect(animate).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update, nor when its statuses first arrive', () => {
    const animate = spyAnimate();
    const view = createEisenhowerView();
    document.body.append(view.el);
    view.update(eisen(BASE));
    view.setTasks([{ nodeId: 'e1', taskId: 't1', status: 'unknown' }]);
    view.setTasks([{ nodeId: 'e1', taskId: 't1', status: 'in_progress' }]);
    expect(item(view, 'e1').querySelector('.ps-eisen__task')).not.toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id, and the grid with the last item', () => {
    const view = createEisenhowerView();
    view.update(eisen(BASE));
    for (const id of ['e2', 'e4']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(eisen([entry('e1', 1, 'do'), entry('e3', 3, 'schedule')]));
    for (const id of ['e2', 'e4', 'e5']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    view.update(eisen([]));
    expect(view.el.children.length).toBe(0);
  });

  // Tool-specific.
  it('places each item in its quadrant, in the book colours', () => {
    const view = createEisenhowerView();
    view.update(eisen(BASE));
    expect(view.el.querySelector('[data-quadrant="do"] [data-node="e1"]')).not.toBeNull();
    expect(quadrantOf(view, 'e3')).toBe('schedule');
    expect(quadrantOf(view, 'e4')).toBe('delegate');
    expect(quadrantOf(view, 'e5')).toBe('eliminate');
    const quads = [...view.el.querySelectorAll('.ps-eisen__quadrant')];
    expect(quads.map((q) => q.getAttribute('data-quadrant'))).toEqual(['do', 'schedule', 'delegate', 'eliminate']);
    expect(quads.map((q) => q.getAttribute('data-fill'))).toEqual(['blue', 'yellow', 'yellow', 'red']);
    expect([...view.el.querySelectorAll('.ps-eisen__heading')].map((h) => h.textContent)).toEqual(['Do first', 'Schedule', 'Delegate', 'Eliminate']);
    expect(view.el.querySelector('.ps-eisen__band--urgent')!.textContent).toBe('Urgent');
    expect(view.el.querySelector('.ps-eisen__side--not-important')!.textContent).toBe('Not important');
  });

  it('draws the icons once any item exists and not before', () => {
    const view = createEisenhowerView();
    view.update(eisen([]));
    expect(view.el.querySelectorAll('.ps-eisen__icon').length).toBe(0);
    view.update(eisen([entry('e4', 4, 'delegate')]));
    const icons = [...view.el.querySelectorAll('.ps-eisen__icon')];
    expect(icons.length).toBe(4);
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(view.el.querySelector('[data-quadrant="schedule"] .ps-eisen__icon path')!.getAttribute('fill')).toBe('var(--ps-red)');
  });

  it('shows the task status label on a Do first item', () => {
    const view = createEisenhowerView();
    view.update(eisen(BASE));
    view.setTasks([{ nodeId: 'e1', taskId: 't1', status: 'in_progress' }]);
    const e1 = item(view, 'e1');
    expect(e1.getAttribute('data-task-status')).toBe('in_progress');
    expect(e1.querySelector('.ps-eisen__task')!.textContent).toBe('TaskDoing');
    expect(button(view, 'e1').getAttribute('aria-label')).toContain('task: Doing');
    view.setTasks([{ nodeId: 'e1', taskId: 't1', status: 'done' }]);
    expect(e1.querySelector('.ps-eisen__task-status')!.textContent).toBe('Done');
    expect(item(view, 'e2').querySelector('.ps-eisen__task')).toBeNull();
    view.setTasks([]);
    expect(e1.querySelector('.ps-eisen__task')).toBeNull();
    expect(e1.hasAttribute('data-task-status')).toBe(false);
  });

  it('shows "Task removed" for a deleted task', () => {
    const view = createEisenhowerView();
    view.update(eisen(BASE));
    view.setTasks([{ nodeId: 'e2', taskId: 't2', status: 'removed' }]);
    const e2 = item(view, 'e2');
    expect(e2.classList.contains('is-removed')).toBe(true);
    expect(e2.querySelector('.ps-eisen__task')!.textContent).toBe('Task removed');
    expect(quadrantOf(view, 'e2')).toBe('do');
    expect(button(view, 'e2').getAttribute('aria-label')).toContain('task removed');
  });

  it('marks an item with a pending proposal, and grows the task tag in once it is confirmed', () => {
    const animate = spyAnimate();
    const view = createEisenhowerView();
    document.body.append(view.el);
    view.update(eisen(BASE));
    view.setProposed(['e2']);
    const meta = item(view, 'e2').querySelector<HTMLElement>('.ps-eisen__proposed')!;
    expect(meta.hidden).toBe(false);
    expect(button(view, 'e2').getAttribute('aria-label')).toContain('proposed task');
    animate.mockClear();
    view.setTasks([{ nodeId: 'e2', taskId: 't2', status: 'unknown' }]);
    view.setProposed([]);
    expect(meta.hidden).toBe(true);
    const tag = item(view, 'e2').querySelector('.ps-eisen__task')!;
    expect(animate.mock.contexts).toContain(tag);
  });

  it('moves an item to its new quadrant as the same element, by measured centres, keeping focus', () => {
    const animate = spyAnimate();
    const view = createEisenhowerView();
    document.body.append(view.el);
    view.update(eisen(BASE));
    const e5 = item(view, 'e5');
    let x = 0;
    vi.spyOn(e5, 'getBoundingClientRect').mockImplementation(() => {
      const left = x;
      x -= 200;
      return { left, top: 100, width: 150, height: 44, right: left + 150, bottom: 144, x: left, y: 100, toJSON() {} } as DOMRect;
    });
    button(view, 'e5').focus();
    animate.mockClear();
    view.update(eisen(BASE.map((n) => (n.id === 'e5' ? { ...n, tag: 'delegate' } : n))));
    expect(item(view, 'e5')).toBe(e5);
    expect(quadrantOf(view, 'e5')).toBe('delegate');
    expect(e5.getAttribute('data-fill')).toBe('yellow');
    expect(document.activeElement).toBe(button(view, 'e5'));
    const index = animate.mock.contexts.indexOf(e5);
    expect((animate.mock.calls[index][0] as Keyframe[])[0].transform).toBe('translate(200px, 0px)');
  });

  it('keeps slot order inside a quadrant', () => {
    const view = createEisenhowerView();
    view.update(eisen([entry('e1', 3, 'do'), entry('e2', 1, 'do')]));
    expect([...view.el.querySelectorAll('[data-quadrant="do"] [data-node]')].map((e) => e.getAttribute('data-node'))).toEqual(['e2', 'e1']);
  });

  it('returns focus to the pill when Escape closes its card, and closes a card whose node goes', () => {
    const view = createEisenhowerView();
    document.body.append(view.el);
    view.update(eisen(BASE));
    button(view, 'e2').click();
    view.el.querySelector('.ps-details.is-open')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
    expect(document.activeElement).toBe(button(view, 'e2'));
    button(view, 'e3').click();
    view.update(eisen(BASE.filter((n) => n.id !== 'e3')));
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
  });

  it('does nothing after destroy', () => {
    const view = createEisenhowerView();
    view.update(eisen(BASE));
    view.destroy();
    view.update(eisen([...BASE, entry('e6', 6, 'do')]));
    view.setTasks([{ nodeId: 'e1', taskId: 't1', status: 'in_progress' }]);
    view.setProposed(['e2']);
    expect(item(view, 'e6')).toBeNull();
    expect(item(view, 'e1').querySelector('.ps-eisen__task')).toBeNull();
    expect(item(view, 'e2').querySelector<HTMLElement>('.ps-eisen__proposed')!.hidden).toBe(true);
  });

  it('uses no list roles', () => {
    const view = createEisenhowerView();
    view.update(eisen(BASE));
    expect(view.el.querySelector('[role="list"], [role="listitem"]')).toBeNull();
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* Eisenhower matrix (toolkit');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z0-9][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: eisen / inline-size');
    expect(section).toContain('@container eisen (');
    expect(section).not.toMatch(/@container \(/);
    // The named container is never styled inside its own query.
    const phone = section.slice(section.indexOf('@container eisen ('));
    expect(phone).not.toMatch(/\.ps-eisen\s*\{/);
  });
});
