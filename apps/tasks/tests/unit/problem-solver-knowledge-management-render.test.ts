import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKnowledgeManagementView } from '../../../../packages/problem-solver/render/knowledge-management';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const km = (nodes: PsNode[]) => run('knowledge_management', nodes);

type View = ReturnType<typeof createKnowledgeManagementView>;
const block = (view: View, b: string) => view.el.querySelector<HTMLElement>(`[data-block="${b}"]`)!;
const button = (view: View, b: string) => block(view, b).querySelector<HTMLButtonElement>('.ps-km__button')!;
const filled = (view: View) => [...view.el.querySelectorAll('[data-block]')].map((b) => b.getAttribute('data-filled'));
const pillsOf = (view: View, list: string) => [...view.el.querySelectorAll<HTMLElement>(`[data-list="${list}"] .ps-km__pill`)];

const C = node('c', 'consider', { text: 'The rota is saved, but not why swaps go through one sheet.', title: 'Why swaps use one sheet' });
const E1 = node('e1', 'explicit:1', { title: 'Swap sheet how-to' });
const E2 = node('e2', 'explicit:2', { title: 'Rota calendar' });
const T1 = node('t1', 'tacit:1', { title: 'Spotting a clash early' });
const T2 = node('t2', 'tacit:2', { title: 'Settling a swap dispute' });
const S = node('s', 'share', { title: 'Linked from the noticeboard' });
const R = node('r', 'review', { title: 'Every spring' });
const FULL = [C, E1, E2, T1, T2, S, R];

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});
function spyAnimate() {
  proto.animate = () => null;
  return vi.spyOn(Element.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
}

describe('Knowledge management view', () => {
  // Baseline 1-8 (adapted: the four squares are the tool, so they show, faint, before any node).
  it('draws no node and no filled square for an empty run', () => {
    const view = createKnowledgeManagementView();
    view.update(km([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelectorAll('.ps-km__square.is-filled').length).toBe(0);
    expect(view.el.getAttribute('aria-label')).toBe('Knowledge management');
  });

  it('keeps element identity across updates', () => {
    const view = createKnowledgeManagementView();
    view.update(km([C, E1]));
    const before = view.el.querySelector('[data-node="c"]');
    const pill = view.el.querySelector('.ps-km__pill[data-node="e1"]');
    view.update(km(FULL));
    expect(view.el.querySelector('[data-node="c"]')).toBe(before);
    expect(view.el.querySelector('.ps-km__pill[data-node="e1"]')).toBe(pill);
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createKnowledgeManagementView();
    view.update(km([C, node('s', 'share', { state: 'contested', objection: 'Who reads the noticeboard?' })]));
    const item = block(view, 'share');
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Who reads the noticeboard?');
    expect(button(view, 'share').getAttribute('aria-label')).toContain(', contested');
    button(view, 'share').click();
    expect(item.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Who reads the noticeboard?');
    view.update(km([C, S]));
    expect(item.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'share').getAttribute('aria-label')).not.toContain('contested');
    expect(item.querySelector('.ps-details.is-open .ps-details__note')).toBeNull();
  });

  it('opens one details card at a time', () => {
    const view = createKnowledgeManagementView();
    view.update(km(FULL));
    button(view, 'consider').click();
    button(view, 'review').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'review').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 'consider').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the node title beside the square and the full answer only in the details', () => {
    const view = createKnowledgeManagementView();
    view.update(km(FULL));
    const item = block(view, 'consider');
    expect(item.querySelector('.ps-km__answer-title')!.textContent).toBe('Why swaps use one sheet');
    expect(item.querySelector('.ps-km__row')!.textContent).not.toContain('The rota is saved');
    expect(item.querySelector('.ps-details .ps-details__text')!.textContent).toBe('The rota is saved, but not why swaps go through one sheet.');
    expect(pillsOf(view, 'explicit').map((p) => p.textContent)).toEqual(['Swap sheet how-to', 'Rota calendar']);
  });

  it('starts no animation on a second identical update', () => {
    const spy = spyAnimate();
    const view = createKnowledgeManagementView();
    view.update(km([]));
    view.update(km(FULL));
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    view.update(km(FULL));
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const spy = spyAnimate();
    const view = createKnowledgeManagementView();
    view.update(km(FULL));
    expect(spy).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createKnowledgeManagementView();
    view.update(km(FULL));
    button(view, 'capture').click();
    for (const id of ['t2', 'r']) expect(view.el.querySelectorAll(`[data-node~="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(km([C, E1, E2, T1, S]));
    for (const id of ['t2', 'r']) expect(view.el.querySelectorAll(`[data-node~="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(block(view, 'capture').getAttribute('data-node')).toBe('e1 e2 t1');
    expect(block(view, 'review').getAttribute('data-filled')).toBe('false');
    expect(button(view, 'review').disabled).toBe(true);
  });

  // Tool-specific.
  it('has four faint squares before any node', () => {
    const view = createKnowledgeManagementView();
    const blocks = [...view.el.querySelectorAll<HTMLElement>('[data-block]')];
    expect(blocks.map((b) => b.getAttribute('data-block'))).toEqual(['consider', 'capture', 'share', 'review']);
    expect(filled(view)).toEqual(['false', 'false', 'false', 'false']);
    expect(blocks.map((b) => b.querySelector('.ps-km__title')!.textContent)).toEqual(['Consider', 'Capture', 'Share', 'Review']);
    expect(view.el.querySelectorAll('[data-shape][data-fill="paper"]').length).toBeGreaterThanOrEqual(4);
  });

  it('fills Capture and lists one explicit item when explicit:1 is placed', () => {
    const view = createKnowledgeManagementView();
    view.update(km([E1]));
    expect(filled(view)).toEqual(['false', 'true', 'false', 'false']);
    expect(pillsOf(view, 'explicit').length).toBe(1);
    expect(pillsOf(view, 'tacit').length).toBe(0);
    expect(block(view, 'capture').querySelector('.ps-km__square')!.getAttribute('data-fill')).toBe('yellow');
    expect(block(view, 'capture').querySelector('.ps-km__band')!.getAttribute('data-fill')).toBe('red');
    const list = view.el.querySelector('[data-list="explicit"]')!;
    expect(list.getAttribute('role')).toBe('list');
    expect(list.getAttribute('aria-label')).toBe('Explicit');
  });

  it('lists both tacit items', () => {
    const view = createKnowledgeManagementView();
    view.update(km([C, E1, T1, T2]));
    expect(pillsOf(view, 'tacit').map((p) => p.getAttribute('data-node'))).toEqual(['t1', 't2']);
    const cards = [...block(view, 'capture').querySelectorAll('.ps-details__card')].map((c) => c.getAttribute('data-for'));
    expect(cards).toEqual(['e1', 't1', 't2']);
  });

  it('fills Share only when share is placed', () => {
    const view = createKnowledgeManagementView();
    view.update(km([S]));
    expect(filled(view)).toEqual(['false', 'false', 'true', 'false']);
    expect(button(view, 'consider').disabled).toBe(true);
  });

  it('shows the contested tag on Review for a contested review', () => {
    const view = createKnowledgeManagementView();
    view.update(km([C, E1, T1, node('r', 'review', { state: 'contested', objection: 'Who will remember in spring?' })]));
    expect(block(view, 'review').querySelector('.ps-objection')).not.toBeNull();
    for (const b of ['consider', 'capture', 'share']) expect(block(view, b).querySelector('.ps-objection')).toBeNull();
  });

  it('puts a contested capture entry\'s tag on its pill', () => {
    const view = createKnowledgeManagementView();
    view.update(km([E1, node('t1', 'tacit:1', { state: 'contested', objection: 'Shadowing once is not enough.' })]));
    const pill = view.el.querySelector<HTMLElement>('[data-list="tacit"] [data-node="t1"]')!;
    expect(pill.classList.contains('is-contested')).toBe(true);
    expect(pill.querySelector('.ps-objection')).not.toBeNull();
    expect(block(view, 'capture').classList.contains('is-contested')).toBe(true);
    expect(button(view, 'capture').getAttribute('aria-label')).toContain(', contested');
  });

  it('removes the pill on undo of tacit:1 and empties Capture when it was the only entry, staying still', () => {
    const spy = spyAnimate();
    const view = createKnowledgeManagementView();
    view.update(km([C]));
    view.update(km([C, T1]));
    expect(pillsOf(view, 'tacit').length).toBe(1);
    spy.mockClear();
    view.update(km([C]));
    expect(pillsOf(view, 'tacit').length).toBe(0);
    expect(view.el.querySelectorAll('[data-node~="t1"]').length).toBe(0);
    expect(block(view, 'capture').getAttribute('data-filled')).toBe('false');
    expect(block(view, 'capture').querySelector('.ps-km__square')!.classList.contains('is-filled')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws the mark in when a block first fills and drops new pills in', () => {
    const spy = spyAnimate();
    const view = createKnowledgeManagementView();
    view.update(km([C]));
    view.update(km([C, E1, S, R]));
    const targets = spy.mock.contexts as Element[];
    expect(targets.some((t) => t.classList?.contains('ps-km__band'))).toBe(true);
    expect(targets.some((t) => t.classList?.contains('ps-km__frame-line'))).toBe(true);
    expect(targets.some((t) => t.classList?.contains('ps-km__disc'))).toBe(true);
    expect(targets.some((t) => t.classList?.contains('ps-km__pill'))).toBe(true);
    expect(targets.some((t) => t.classList?.contains('ps-km__triangle'))).toBe(false);
    spy.mockClear();
    view.update(km([C, E1, E2, S, R]));
    const again = spy.mock.contexts as Element[];
    expect(again.length).toBe(1);
    expect(again[0].getAttribute('data-node')).toBe('e2');
  });

  it('gives every named container a role', () => {
    const view = createKnowledgeManagementView();
    view.update(km(FULL));
    for (const named of view.el.querySelectorAll('[aria-label]')) {
      if (named.tagName === 'BUTTON') continue;
      expect(named.getAttribute('role')).toBeTruthy();
    }
    for (const list of view.el.querySelectorAll('[role="list"]')) {
      expect([...list.children].every((child) => child.getAttribute('role') === 'listitem')).toBe(true);
    }
  });

  it('does nothing after destroy', () => {
    const view = createKnowledgeManagementView();
    view.update(km([C]));
    view.destroy();
    view.update(km(FULL));
    expect(block(view, 'capture').hasAttribute('data-node')).toBe(false);
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* Knowledge management');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z0-9][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: km / inline-size');
    expect(section).toContain('@container km (');
    expect(section).not.toMatch(/@container \(/);
  });
});
