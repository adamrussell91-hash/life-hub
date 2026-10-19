import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFifteenPercentView } from '../../../../packages/problem-solver/render/fifteen-percent';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const fifteen = (nodes: PsNode[], edges: PsEdge[] = []) => run('fifteen_percent', nodes, edges);
const picks = (from: string, to: string): PsEdge => ({ from, to, kind: 'picks' });

type View = ReturnType<typeof createFifteenPercentView>;
const pill = (view: View, id: string) => view.el.querySelector<HTMLElement>(`.ps-fifteen__pill[data-node="${id}"]`)!;
const pillButton = (view: View, id: string) => pill(view, id).querySelector<HTMLButtonElement>('button')!;

const BASE = [node('w', 'reflect'), node('a1', 'action:1'), node('a2', 'action:2'), node('a3', 'action:3')];
const CHOSEN = [...BASE, node('c1', 'chosen:1', { text: 'Start on Saturday at opening.', title: 'From Saturday' })];
const FULL = { nodes: CHOSEN, edges: [picks('c1', 'a2')] };

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

describe('15% solutions view', () => {
  // Baseline 1-8.
  it('renders nothing for an empty run', () => {
    const view = createFifteenPercentView();
    view.update(fifteen([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-fifteen__disc')).toBeNull();
  });

  it('keeps element identity across updates', () => {
    const view = createFifteenPercentView();
    view.update(fifteen(BASE));
    const before = pill(view, 'a1');
    const note = view.el.querySelector('[data-node="w"]');
    const disc = view.el.querySelector('.ps-fifteen__disc--now');
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(pill(view, 'a1')).toBe(before);
    expect(view.el.querySelector('[data-node="w"]')).toBe(note);
    expect(view.el.querySelector('.ps-fifteen__disc--now')).toBe(disc);
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createFifteenPercentView();
    const nodes = [node('w', 'reflect'), node('a1', 'action:1', { state: 'contested', objection: 'Is that yours to change?' }), node('a2', 'action:2')];
    view.update(fifteen(nodes));
    const a1 = pill(view, 'a1');
    expect(a1.classList.contains('is-contested')).toBe(true);
    expect(a1.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that yours to change?');
    expect(pillButton(view, 'a1').getAttribute('aria-label')).toContain(', contested');
    pillButton(view, 'a1').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Is that yours to change?');
    view.update(fifteen([node('w', 'reflect'), node('a1', 'action:1'), node('a2', 'action:2')]));
    expect(a1.classList.contains('is-contested')).toBe(false);
    expect(a1.querySelector('.ps-objection')).toBeNull();
    expect(pillButton(view, 'a1').getAttribute('aria-label')).not.toContain('contested');
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')).toBeNull();
  });

  it('opens one details card at a time', () => {
    const view = createFifteenPercentView();
    view.update(fifteen(BASE));
    pillButton(view, 'a1').click();
    pillButton(view, 'a2').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(pillButton(view, 'a2').getAttribute('aria-expanded')).toBe('true');
    expect(pillButton(view, 'a1').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows titles in the shapes and the full answer only in the details', () => {
    const view = createFifteenPercentView();
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(pill(view, 'a1').querySelector('.ps-fifteen__title')!.textContent).toBe('Action:1 title');
    expect(view.el.querySelector('[data-node="w"] .ps-fifteen__title')!.textContent).toBe('Reflect title');
    for (const shape of view.el.querySelectorAll('[data-shape]')) expect(shape.textContent).not.toContain('answer text');
    expect([...view.el.querySelectorAll('.ps-details')].some((card) => card.textContent!.includes('reflect answer text'))).toBe(true);
  });

  it('starts no animation on a second identical update', () => {
    const animate = spyAnimate();
    const view = createFifteenPercentView();
    document.body.append(view.el);
    view.update(fifteen([]));
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(animate).toHaveBeenCalled();
    animate.mockClear();
    view.update(fifteen(FULL.nodes, FULL.edges));
    view.setTasks([]);
    expect(animate).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const animate = spyAnimate();
    const view = createFifteenPercentView();
    document.body.append(view.el);
    view.setTasks([{ nodeId: 'c1', taskId: 't', status: 'open' }]);
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(animate).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createFifteenPercentView();
    view.update(fifteen(FULL.nodes, FULL.edges));
    for (const id of ['w', 'a1', 'c1']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    // Undo the note and an action: the picked pill goes back to Now, the Go disc goes.
    view.update(fifteen([node('w', 'reflect'), node('a2', 'action:2'), node('a3', 'action:3')]));
    for (const id of ['a1', 'c1']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(view.el.querySelector('[data-region="go"]')).toBeNull();
    expect(view.el.querySelector('[data-region="now"] [data-node="a2"]')).not.toBeNull();
    // Undo everything but the reflection: Now goes too.
    view.update(fifteen([node('w', 'reflect')]));
    expect(view.el.querySelector('[data-region="now"]')).toBeNull();
    expect(view.el.querySelectorAll('.ps-details').length).toBe(1);
  });

  // Tool-specific.
  it('renders actions in the Now region, alternating sides', () => {
    const view = createFifteenPercentView();
    view.update(fifteen(BASE));
    const now = view.el.querySelector('[data-region="now"]')!;
    expect(now.querySelectorAll('.ps-fifteen__pill').length).toBe(3);
    expect(pill(view, 'a1').parentElement!.classList.contains('ps-fifteen__lane--start')).toBe(true);
    expect(pill(view, 'a2').parentElement!.classList.contains('ps-fifteen__lane--end')).toBe(true);
    expect(pill(view, 'a3').parentElement!.classList.contains('ps-fifteen__lane--start')).toBe(true);
    expect(view.el.querySelector('[data-region="go"]')).toBeNull();
  });

  it('moves a picked action to Go as the same element, with the note as its details', () => {
    const view = createFifteenPercentView();
    view.update(fifteen(BASE));
    const a2 = pill(view, 'a2');
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(view.el.querySelector('[data-region="go"] [data-node="a2"]')).toBe(a2);
    expect(a2.classList.contains('is-picked')).toBe(true);
    expect(a2.getAttribute('data-fill')).toBe('blue');
    expect(a2.querySelector('.ps-fifteen__meta')!.textContent).toBe('From Saturday');
    pillButton(view, 'a2').click();
    const open = view.el.querySelector('.ps-details.is-open')!;
    expect(open.getAttribute('data-for')).toBe('c1');
    expect(open.textContent).toContain('Start on Saturday at opening.');
    expect(open.textContent).toContain('action:2 answer text');
    // The note undone: it rolls back beside Now, still the same element.
    view.update(fifteen(BASE));
    expect(view.el.querySelector('[data-region="now"] [data-node="a2"]')).toBe(a2);
    expect(a2.classList.contains('is-picked')).toBe(false);
  });

  it('rolls a picked pill by measured centres: a FLIP move and a quarter turn', () => {
    const animate = spyAnimate();
    const view = createFifteenPercentView();
    document.body.append(view.el);
    view.update(fifteen([]));
    view.update(fifteen(BASE));
    const a2 = pill(view, 'a2');
    let y = 100;
    vi.spyOn(a2, 'getBoundingClientRect').mockImplementation(() => {
      const top = y;
      y += 200;
      return { left: 300, top, width: 120, height: 44, right: 420, bottom: top + 44, x: 300, y: top, toJSON() {} } as DOMRect;
    });
    animate.mockClear();
    view.update(fifteen(FULL.nodes, FULL.edges));
    const calls = animate.mock.calls.map((call, i) => ({ target: animate.mock.contexts[i], frames: call[0] as Keyframe[] }));
    const move = calls.find((call) => call.target === a2);
    expect(move!.frames[0].transform).toBe('translate(0px, -200px)');
    const roll = calls.find((call) => call.target === a2.querySelector('.ps-fifteen__roll'));
    expect(roll!.frames[0].transform).toBe('rotate(-90deg)');
  });

  it('starts a roll from where an interrupted roll left the pill', () => {
    const animate = spyAnimate();
    const view = createFifteenPercentView();
    document.body.append(view.el);
    view.update(fifteen([]));
    view.update(fifteen(BASE));
    const a2 = pill(view, 'a2');
    // Layout y by disc row; a running move adds its offset (the pill is drawn where the move is).
    const Y: Record<string, number> = { now: 100, go: 300 };
    let offset = 0;
    const running = { cancel() { offset = 0; }, finish() {}, onfinish: null } as unknown as Animation;
    (a2 as unknown as { getAnimations(): Animation[] }).getAnimations = () => (offset ? [running] : []);
    vi.spyOn(a2, 'getBoundingClientRect').mockImplementation(() => {
      const top = Y[a2.closest('[data-region]')!.getAttribute('data-region')!] + offset;
      return { left: 300, top, width: 120, height: 44, right: 420, bottom: top + 44, x: 300, y: top, toJSON() {} } as DOMRect;
    });
    animate.mockImplementation(function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null) {
      const m = this === a2 ? /translate\([-\d.]+px, (-?[\d.]+)px/.exec(String((frames as Keyframe[])[0].transform)) : null;
      if (m) offset = Number(m[1]);
      return running;
    } as never);
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(offset).toBe(-200);
    animate.mockClear();
    // Undone at the roll's first frame: the pill is still drawn beside Now, where it is going.
    view.update(fifteen(BASE));
    expect(animate.mock.contexts.indexOf(a2)).toBe(-1);
  });

  it('keeps focus on a pill that rolls to Go', () => {
    const view = createFifteenPercentView();
    document.body.append(view.el);
    view.update(fifteen(BASE));
    pillButton(view, 'a2').focus();
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(document.activeElement).toBe(pillButton(view, 'a2'));
  });

  it('shows the task mark with its live status, and "Task removed" for a deleted task', () => {
    const view = createFifteenPercentView();
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(pill(view, 'a2').querySelector('.ps-fifteen__task')).toBeNull();
    view.setTasks([{ nodeId: 'c1', taskId: 't', status: 'in_progress' }]);
    const mark = pill(view, 'a2').querySelector('.ps-fifteen__task')!;
    expect(mark.textContent).toContain('Task');
    expect(mark.textContent).toContain('Doing');
    expect(pillButton(view, 'a2').getAttribute('aria-label')).toContain('task: Doing');
    view.setTasks([{ nodeId: 'c1', taskId: 't', status: 'done' }]);
    expect(pill(view, 'a2').querySelector('.ps-fifteen__task')).toBe(mark);
    expect(mark.textContent).toContain('Done');
    view.setTasks([{ nodeId: 'c1', taskId: 't', status: 'removed' }]);
    expect(mark.textContent).toBe('Task removed');
    view.setTasks([]);
    expect(pill(view, 'a2').querySelector('.ps-fifteen__task')).toBeNull();
    // Unpicked actions never carry a mark.
    view.setTasks([{ nodeId: 'a1', taskId: 'x', status: 'open' }]);
    expect(pill(view, 'a1').querySelector('.ps-fifteen__task')).toBeNull();
  });

  it('keeps task links given before the first update', () => {
    const view = createFifteenPercentView();
    view.setTasks([{ nodeId: 'c1', taskId: 't', status: 'open' }]);
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(pill(view, 'a2').textContent).toContain('To do');
  });

  it('draws the What disc only once reflect exists, with its title beside it', () => {
    const view = createFifteenPercentView();
    view.update(fifteen([node('a1', 'action:1')]));
    expect(view.el.querySelector('[data-region="what"]')).toBeNull();
    expect(view.el.querySelector('.ps-fifteen__disc--what')).toBeNull();
    view.update(fifteen([node('w', 'reflect', { title: 'My own desk' }), node('a1', 'action:1')]));
    const what = view.el.querySelector('[data-region="what"]')!;
    expect(what.querySelector('.ps-fifteen__disc--what')!.textContent).toBe('What');
    expect(what.querySelector('[data-node="w"] .ps-fifteen__title')!.textContent).toBe('My own desk');
    // The discs keep the book's order.
    expect([...view.el.querySelectorAll('[data-region]')].map((row) => row.getAttribute('data-region'))).toEqual(['what', 'now']);
  });

  it('shows a note that picks nothing yet beside Go', () => {
    const view = createFifteenPercentView();
    view.update(fifteen([...BASE, node('c1', 'chosen:1')]));
    expect(view.el.querySelector('[data-region="go"] [data-node="c1"]')).not.toBeNull();
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(view.el.querySelector('.ps-fifteen__pill[data-node="c1"]')).toBeNull();
    expect(view.el.querySelector('[data-region="go"] [data-node="a2"]')).not.toBeNull();
  });

  it('returns focus to the pill when Escape closes its card', () => {
    const view = createFifteenPercentView();
    document.body.append(view.el);
    view.update(fifteen(BASE));
    pillButton(view, 'a3').click();
    const open = view.el.querySelector<HTMLElement>('.ps-details.is-open')!;
    open.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
    expect(document.activeElement).toBe(pillButton(view, 'a3'));
  });

  it('does nothing after destroy', () => {
    const view = createFifteenPercentView();
    view.update(fifteen(BASE));
    view.destroy();
    view.update(fifteen(FULL.nodes, FULL.edges));
    view.setTasks([{ nodeId: 'c1', taskId: 't', status: 'open' }]);
    expect(view.el.querySelector('[data-region="go"]')).toBeNull();
  });

  it('uses no list roles', () => {
    const view = createFifteenPercentView();
    view.update(fifteen(FULL.nodes, FULL.edges));
    expect(view.el.querySelector('[role="list"], [role="listitem"]')).toBeNull();
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* 15% solutions');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z0-9][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: fifteen / inline-size');
    expect(section).toContain('@container fifteen (');
    expect(section).not.toMatch(/@container \(/);
  });
});
