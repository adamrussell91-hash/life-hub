import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKanbanView } from '../../../../packages/problem-solver/render/kanban';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const kanban = (nodes: PsNode[]) => run('kanban', nodes);
const card = (id: string, index: number, tag: string, extra: Partial<PsNode> = {}) => node(id, `card:${index}`, { tag, ...extra });

type View = ReturnType<typeof createKanbanView>;
const item = (view: View, id: string) => view.el.querySelector<HTMLElement>(`.ps-kanban__card[data-node="${id}"]`)!;
const button = (view: View, id: string) => item(view, id).querySelector<HTMLButtonElement>('button')!;
const columnOf = (view: View, id: string) => item(view, id).parentElement!.getAttribute('data-column');
const words = (target: Element) => target.textContent!.replace(/ /g, ' ');

const BASE = [card('k1', 1, 'todo'), card('k2', 2, 'todo'), card('k3', 3, 'doing'), card('k4', 4, 'review'), card('k5', 5, 'done')];
const WIP = node('w', 'wip', { text: 'At most 2 cards in Doing.', title: 'Two at once' });

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

describe('Kanban view', () => {
  // Baseline 1-8.
  it('renders nothing for an empty run', () => {
    const view = createKanbanView();
    view.update(kanban([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-kanban__col')).toBeNull();
  });

  it('keeps element identity across updates', () => {
    const view = createKanbanView();
    view.update(kanban(BASE.slice(0, 2)));
    const k1 = item(view, 'k1');
    const col = view.el.querySelector('[data-region="todo"]');
    view.update(kanban([...BASE, WIP]));
    expect(item(view, 'k1')).toBe(k1);
    expect(view.el.querySelector('[data-region="todo"]')).toBe(col);
  });

  it('marks a contested card and carries the objection, and follows a later change of state', () => {
    const view = createKanbanView();
    view.update(kanban([card('k1', 1, 'todo', { state: 'contested', objection: 'Too big to finish?' }), card('k2', 2, 'todo')]));
    const k1 = item(view, 'k1');
    expect(k1.classList.contains('is-contested')).toBe(true);
    expect(k1.querySelector('.ps-objection')!.getAttribute('title')).toBe('Too big to finish?');
    expect(button(view, 'k1').getAttribute('aria-label')).toContain(', contested');
    button(view, 'k1').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Too big to finish?');
    view.update(kanban([card('k1', 1, 'todo'), card('k2', 2, 'todo')]));
    expect(k1.classList.contains('is-contested')).toBe(false);
    expect(k1.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'k1').getAttribute('aria-label')).not.toContain('contested');
  });

  it('opens one details card at a time', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    button(view, 'k1').click();
    button(view, 'k3').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'k3').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 'k1').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows titles in the pills and the full answer only in the details', () => {
    const view = createKanbanView();
    view.update(kanban([...BASE, WIP]));
    expect(item(view, 'k1').querySelector('.ps-kanban__title')!.textContent).toBe('Card:1 title');
    for (const shape of view.el.querySelectorAll('[data-shape]')) expect(shape.textContent).not.toContain('answer text');
    expect([...view.el.querySelectorAll('.ps-details')].some((c) => c.textContent!.includes('card:1 answer text'))).toBe(true);
  });

  it('starts no animation on a second identical update or setTasks', () => {
    const animate = spyAnimate();
    const view = createKanbanView();
    document.body.append(view.el);
    view.update(kanban([]));
    view.update(kanban(BASE));
    expect(animate).toHaveBeenCalled();
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'open' }]);
    animate.mockClear();
    view.update(kanban(BASE));
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'open' }]);
    view.setProposed([]);
    expect(animate).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update, nor when its statuses first arrive', () => {
    const animate = spyAnimate();
    const view = createKanbanView();
    document.body.append(view.el);
    view.update(kanban([...BASE, WIP]));
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'unknown' }]);
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'in_progress' }]);
    expect(columnOf(view, 'k1')).toBe('doing');
    expect(animate).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createKanbanView();
    view.update(kanban([...BASE, WIP]));
    for (const id of ['k2', 'w']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(kanban([card('k1', 1, 'todo'), card('k3', 3, 'doing')]));
    for (const id of ['k2', 'k4', 'k5', 'w']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(view.el.querySelector('.ps-kanban__wip')).toBeNull();
    view.update(kanban([]));
    expect(view.el.children.length).toBe(0);
  });

  // Tool-specific.
  it('places each card by its tag, with Review inside Doing', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    expect(view.el.querySelector('[data-column="todo"] [data-node="k1"]')).not.toBeNull();
    expect(view.el.querySelector('[data-region="doing"] [data-column="review"] [data-node="k4"]')).not.toBeNull();
    expect(columnOf(view, 'k3')).toBe('doing');
    expect(columnOf(view, 'k5')).toBe('done');
    expect([...view.el.querySelectorAll('.ps-kanban__col')].map((c) => c.getAttribute('data-region'))).toEqual(['todo', 'doing', 'done']);
    expect(item(view, 'k1').getAttribute('data-fill')).toBe('yellow');
    expect(item(view, 'k4').getAttribute('data-fill')).toBe('red');
    expect(item(view, 'k5').getAttribute('data-fill')).toBe('blue');
  });

  it('moves a linked card by its live status, as the same element', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    const k1 = item(view, 'k1');
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'open' }]);
    expect(columnOf(view, 'k1')).toBe('todo');
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'in_progress' }]);
    expect(view.el.querySelector('[data-column="doing"] [data-node="k1"]')).toBe(k1);
    expect(k1.getAttribute('data-task-status')).toBe('in_progress');
    expect(k1.querySelector('.ps-kanban__link')).not.toBeNull();
    expect(button(view, 'k1').getAttribute('aria-label')).toContain('task: Doing');
    // Slot order holds in the new column.
    expect([...view.el.querySelectorAll('[data-column="doing"] [data-node]')].map((e) => e.getAttribute('data-node'))).toEqual(['k1', 'k3']);
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'done' }]);
    expect(view.el.querySelector('[data-column="done"] [data-node="k1"]')).toBe(k1);
    expect(k1.getAttribute('data-fill')).toBe('blue');
    // Unknown keeps the last known place.
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'unknown' }]);
    expect(columnOf(view, 'k1')).toBe('done');
    // Unlinked again: back to its tag.
    view.setTasks([]);
    expect(columnOf(view, 'k1')).toBe('todo');
    expect(k1.hasAttribute('data-task-status')).toBe(false);
    expect(k1.querySelector('.ps-kanban__link')).toBeNull();
  });

  it('keeps a review task in Review until it is started', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    view.setTasks([{ nodeId: 'k4', taskId: 't4', status: 'open' }]);
    expect(columnOf(view, 'k4')).toBe('review');
    view.setTasks([{ nodeId: 'k4', taskId: 't4', status: 'in_progress' }]);
    expect(columnOf(view, 'k4')).toBe('doing');
  });

  it('leaves unlinked cards where the coach put them', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'done' }]);
    expect(columnOf(view, 'k2')).toBe('todo');
    expect(columnOf(view, 'k3')).toBe('doing');
  });

  it('shows "Task removed" for a deleted task and keeps the card in its tag column', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    view.setTasks([{ nodeId: 'k3', taskId: 't3', status: 'done' }]);
    expect(columnOf(view, 'k3')).toBe('done');
    view.setTasks([{ nodeId: 'k3', taskId: 't3', status: 'removed' }]);
    expect(columnOf(view, 'k3')).toBe('doing');
    expect(item(view, 'k3').classList.contains('is-removed')).toBe(true);
    expect(item(view, 'k3').querySelector('.ps-kanban__meta')!.textContent).toBe('Task removed');
    expect(item(view, 'k3').querySelector('.ps-kanban__link')).toBeNull();
    expect(button(view, 'k3').getAttribute('aria-label')).toContain('task removed');
  });

  it('marks a card with a pending proposal', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    view.setProposed(['k2']);
    const meta = item(view, 'k2').querySelector<HTMLElement>('.ps-kanban__meta')!;
    expect(meta.hidden).toBe(false);
    expect(meta.textContent).toBe('Proposed task');
    expect(button(view, 'k2').getAttribute('aria-label')).toContain('proposed task');
    view.setProposed([]);
    expect(meta.hidden).toBe(true);
  });

  it('shows the WIP limit on Doing and says when Doing is over it', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    expect(view.el.querySelector('.ps-kanban__wip')).toBeNull();
    view.update(kanban([...BASE, WIP]));
    const wip = view.el.querySelector<HTMLButtonElement>('[data-region="doing"] .ps-kanban__head .ps-kanban__wip')!;
    expect(words(wip)).toBe('Limit 2');
    expect(wip.classList.contains('is-over')).toBe(false);
    expect(wip.getAttribute('aria-label')).toContain('Review cards not counted');
    view.setTasks([
      { nodeId: 'k1', taskId: 't1', status: 'in_progress' },
      { nodeId: 'k2', taskId: 't2', status: 'in_progress' }
    ]);
    expect(words(wip)).toBe('Over limit (3 of 2)');
    expect(wip.classList.contains('is-over')).toBe(true);
    // Review cards wait at the review stop; they are not counted as in progress.
    expect(view.el.querySelectorAll('[data-column="doing"] [data-node]').length).toBe(3);
    view.setTasks([]);
    expect(words(wip)).toBe('Limit 2');
    wip.click();
    expect(view.el.querySelector('.ps-details.is-open')!.getAttribute('data-for')).toBe('w');
  });

  it('moves a card by measured centres, reads before writes', () => {
    const animate = spyAnimate();
    const view = createKanbanView();
    document.body.append(view.el);
    view.update(kanban([]));
    view.update(kanban(BASE));
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'open' }]);
    const k1 = item(view, 'k1');
    let x = 0;
    vi.spyOn(k1, 'getBoundingClientRect').mockImplementation(() => {
      const left = x;
      x += 200;
      return { left, top: 100, width: 150, height: 44, right: left + 150, bottom: 144, x: left, y: 100, toJSON() {} } as DOMRect;
    });
    animate.mockClear();
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'in_progress' }]);
    const index = animate.mock.contexts.indexOf(k1);
    expect(index).toBeGreaterThanOrEqual(0);
    expect((animate.mock.calls[index][0] as Keyframe[])[0].transform).toBe('translate(-200px, 0px)');
  });

  it('starts a move from where an interrupted move left the card', () => {
    const animate = spyAnimate();
    const view = createKanbanView();
    document.body.append(view.el);
    view.update(kanban([]));
    view.update(kanban(BASE));
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'open' }]);
    const k1 = item(view, 'k1');
    // Layout x by column; a running move adds its offset (the card is drawn where the move is).
    const X: Record<string, number> = { todo: 0, doing: 200, done: 400 };
    let offset = 0;
    const running = { cancel() { offset = 0; }, finish() {}, onfinish: null } as unknown as Animation;
    (k1 as unknown as { getAnimations(): Animation[] }).getAnimations = () => (offset ? [running] : []);
    vi.spyOn(k1, 'getBoundingClientRect').mockImplementation(() => {
      const left = X[k1.parentElement!.getAttribute('data-column')!] + offset;
      return { left, top: 100, width: 150, height: 44, right: left + 150, bottom: 144, x: left, y: 100, toJSON() {} } as DOMRect;
    });
    animate.mockImplementation(function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null) {
      const m = this === k1 ? /translate\((-?[\d.]+)px/.exec(String((frames as Keyframe[])[0].transform)) : null;
      if (m) offset = Number(m[1]); // the move starts at its first frame
      return running;
    } as never);
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'in_progress' }]);
    animate.mockClear();
    // Interrupted at its first frame: the card is drawn at x 0, and is now headed for Done.
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'done' }]);
    const index = animate.mock.contexts.indexOf(k1);
    expect((animate.mock.calls[index][0] as Keyframe[])[0].transform).toBe('translate(-400px, 0px)');
  });

  it('keeps focus on a pill that a status update moves', () => {
    const view = createKanbanView();
    document.body.append(view.el);
    view.update(kanban(BASE));
    button(view, 'k2').focus();
    view.setTasks([{ nodeId: 'k2', taskId: 't2', status: 'open' }]);
    view.setTasks([{ nodeId: 'k2', taskId: 't2', status: 'in_progress' }]);
    expect(columnOf(view, 'k2')).toBe('doing');
    expect(document.activeElement).toBe(button(view, 'k2'));
  });

  it('re-sorts a lane when a card changes slot', () => {
    const view = createKanbanView();
    view.update(kanban([card('k1', 1, 'todo'), card('k2', 2, 'todo')]));
    view.update(kanban([card('k1', 3, 'todo'), card('k2', 2, 'todo')]));
    expect([...view.el.querySelectorAll('[data-column="todo"] [data-node]')].map((e) => e.getAttribute('data-node'))).toEqual(['k2', 'k1']);
  });

  it('colours the details by the place the card is in now', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    const details = () => view.el.querySelector(`.ps-details[data-for="k1"] .ps-details__card`)!.outerHTML;
    const before = details();
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'done' }]);
    expect(details()).not.toBe(before);
    expect(details()).toContain('ps-details__card--blue');
  });

  it('drops a new card in from above, after the first paint only', () => {
    const animate = spyAnimate();
    const view = createKanbanView();
    document.body.append(view.el);
    view.update(kanban(BASE.slice(0, 1)));
    expect(animate).not.toHaveBeenCalled();
    view.update(kanban(BASE.slice(0, 2)));
    const call = animate.mock.calls[animate.mock.contexts.indexOf(item(view, 'k2'))];
    expect((call[0] as Keyframe[])[0].transform).toBe('translateY(-22px)');
  });

  it('returns focus to the pill when Escape closes its card', () => {
    const view = createKanbanView();
    document.body.append(view.el);
    view.update(kanban(BASE));
    button(view, 'k2').click();
    view.el.querySelector('.ps-details.is-open')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
    expect(document.activeElement).toBe(button(view, 'k2'));
  });

  it('closes an open card whose node goes', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    button(view, 'k2').click();
    view.update(kanban(BASE.filter((n) => n.id !== 'k2')));
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
  });

  it('does nothing after destroy', () => {
    const view = createKanbanView();
    view.update(kanban(BASE));
    view.destroy();
    view.update(kanban([...BASE, card('k6', 6, 'todo')]));
    view.setTasks([{ nodeId: 'k1', taskId: 't1', status: 'in_progress' }]);
    view.setProposed(['k2']);
    expect(item(view, 'k6')).toBeNull();
    expect(columnOf(view, 'k1')).toBe('todo');
    expect(item(view, 'k2').querySelector<HTMLElement>('.ps-kanban__meta')!.hidden).toBe(true);
  });

  it('uses no list roles', () => {
    const view = createKanbanView();
    view.update(kanban([...BASE, WIP]));
    expect(view.el.querySelector('[role="list"], [role="listitem"]')).toBeNull();
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* Kanban (toolkit');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z0-9][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: kanban / inline-size');
    expect(section).toContain('@container kanban (');
    expect(section).not.toMatch(/@container \(/);
    // The named container is never styled inside its own query.
    const phone = section.slice(section.indexOf('@container kanban ('));
    expect(phone).not.toMatch(/\.ps-kanban\s*\{/);
  });
});
