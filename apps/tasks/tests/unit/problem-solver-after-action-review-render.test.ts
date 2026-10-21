import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAfterActionReviewView } from '../../../../packages/problem-solver/render/after-action-review';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const aar = (nodes: PsNode[]) => run('after_action_review', nodes);

type View = ReturnType<typeof createAfterActionReviewView>;
const bar = (view: View, slot: string) => view.el.querySelector<HTMLElement>(`[data-bar="${slot}"]`)!;
const button = (view: View, slot: string) => bar(view, slot).querySelector<HTMLButtonElement>('button')!;
const filled = (view: View) => [...view.el.querySelectorAll<HTMLElement>('[data-bar]')].map((item) => item.getAttribute('data-filled'));

// Word counts: 4 + 3 + 4 + 12 = 23, so learned is 12 / 23 = 52%.
const FULL = [
  node('i', 'intended', { text: 'Serve lunch by noon.' }),
  node('a', 'achieved', { text: 'Served at 12.30.' }),
  node('d', 'differences', { text: 'The oven warmed late.' }),
  node('l', 'learned', { text: 'Light the oven first, check it at ten, and keep a spare.' })
];

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

describe('After action review view', () => {
  // Baseline 1-8 (adapted: the four bars are the tool, so they show before any node).
  it('draws no node and no gauge for an empty run', () => {
    const view = createAfterActionReviewView();
    view.update(aar([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('[data-share]')).toBeNull();
    expect(view.el.querySelectorAll('.ps-aar__fill').length).toBe(4);
    expect(view.el.querySelectorAll('.ps-aar__bar.is-filled').length).toBe(0);
  });

  it('keeps element identity across updates', () => {
    const view = createAfterActionReviewView();
    view.update(aar([FULL[0]]));
    const before = view.el.querySelector('[data-node="i"]');
    const bars = [...view.el.querySelectorAll('[data-bar]')];
    view.update(aar(FULL));
    expect(view.el.querySelector('[data-node="i"]')).toBe(before);
    expect([...view.el.querySelectorAll('[data-bar]')]).toEqual(bars);
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createAfterActionReviewView();
    view.update(aar([FULL[0], node('a', 'achieved', { state: 'contested', objection: 'Is that the measure you set?' })]));
    const item = bar(view, 'achieved');
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that the measure you set?');
    expect(button(view, 'achieved').getAttribute('aria-label')).toContain(', contested');
    button(view, 'achieved').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Is that the measure you set?');
    view.update(aar([FULL[0], node('a', 'achieved')]));
    expect(item.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'achieved').getAttribute('aria-label')).not.toContain('contested');
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')).toBeNull();
  });

  it('opens one details card at a time', () => {
    const view = createAfterActionReviewView();
    view.update(aar(FULL));
    button(view, 'intended').click();
    button(view, 'learned').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'learned').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 'intended').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the heading and the clamped answer in the bar, the title in its label and the full answer in the details', () => {
    const view = createAfterActionReviewView();
    view.update(aar(FULL));
    const item = bar(view, 'differences');
    expect(item.querySelector('.ps-aar__title')!.textContent).toBe('Why the difference');
    expect(item.querySelector('.ps-aar__answer')!.textContent).toBe('The oven warmed late.');
    expect(button(view, 'differences').getAttribute('aria-label')).toContain('Differences title');
    expect(item.querySelector('.ps-details .ps-details__text')!.textContent).toBe('The oven warmed late.');
  });

  it('starts no animation on a second identical update', () => {
    const animate = spyAnimate();
    const view = createAfterActionReviewView();
    view.update(aar([]));
    view.update(aar(FULL));
    expect(animate).toHaveBeenCalled();
    animate.mockClear();
    view.update(aar(FULL));
    expect(animate).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const animate = spyAnimate();
    const view = createAfterActionReviewView();
    view.update(aar(FULL));
    expect(animate).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createAfterActionReviewView();
    view.update(aar(FULL));
    button(view, 'learned').click();
    for (const id of ['d', 'l']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(aar(FULL.slice(0, 2)));
    for (const id of ['d', 'l']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(view.el.querySelector('[data-share]')).toBeNull();
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
    expect(bar(view, 'learned').getAttribute('data-filled')).toBe('false');
    expect(bar(view, 'learned').querySelector('.ps-aar__answer')!.textContent).toBe('');
    expect(button(view, 'learned').disabled).toBe(true);
  });

  // Tool-specific.
  it('has the four bars before any node, in order, none filled', () => {
    const view = createAfterActionReviewView();
    expect([...view.el.querySelectorAll('[data-bar]')].map((item) => item.getAttribute('data-bar'))).toEqual(['intended', 'achieved', 'differences', 'learned']);
    expect(filled(view)).toEqual(['false', 'false', 'false', 'false']);
    view.update(aar([]));
    expect(filled(view)).toEqual(['false', 'false', 'false', 'false']);
    expect([...view.el.querySelectorAll('[data-bar] .ps-aar__title')].map((title) => title.textContent)).toEqual(['Set out to achieve', 'Achieved', 'Why the difference', 'Learned']);
    expect([...view.el.querySelectorAll('.ps-aar__bar')].map((shape) => shape.getAttribute('data-tone'))).toEqual(['yellow', 'yellow', 'red', 'blue']);
  });

  it('fills bar 2 only when achieved is placed, in its own colour', () => {
    const view = createAfterActionReviewView();
    view.update(aar([node('a', 'achieved')]));
    expect(filled(view)).toEqual(['false', 'true', 'false', 'false']);
    const shape = bar(view, 'achieved').querySelector('.ps-aar__bar')!;
    expect(shape.getAttribute('data-fill')).toBe('yellow');
    expect(bar(view, 'intended').querySelector('.ps-aar__bar')!.getAttribute('data-fill')).toBe('paper');
    expect(bar(view, 'achieved').getAttribute('data-node')).toBe('a');
    expect(button(view, 'achieved').disabled).toBe(false);
    expect(button(view, 'intended').disabled).toBe(true);
    view.update(aar(FULL));
    expect([...view.el.querySelectorAll('.ps-aar__bar')].map((item) => item.getAttribute('data-fill'))).toEqual(['yellow', 'yellow', 'red', 'blue']);
  });

  it('shows the learning gauge only once learned exists, with the rounded share, and keeps it on change', () => {
    const view = createAfterActionReviewView();
    view.update(aar(FULL.slice(0, 3)));
    expect(view.el.querySelector('[data-share]')).toBeNull();
    view.update(aar(FULL));
    const gauge = view.el.querySelector<HTMLElement>('[data-share]')!;
    expect(gauge.getAttribute('data-share')).toBe('52');
    expect(gauge.textContent).toContain('Time on learning: 52% (aim for half)');
    view.update(aar([...FULL.slice(0, 3), node('l', 'learned', { text: 'Light the oven first.' })]));
    expect(view.el.querySelector('[data-share]')).toBe(gauge);
    // 4 + 3 + 4 + 4 = 15 words; 4 / 15 = 27%.
    expect(gauge.getAttribute('data-share')).toBe('27');
    expect(gauge.textContent).toContain('27%');
  });

  it('morphs the gauge when the share changes, and only then', () => {
    const animate = spyAnimate();
    const view = createAfterActionReviewView();
    view.update(aar(FULL));
    view.update(aar([...FULL.slice(0, 3), node('l', 'learned', { text: 'Light the oven first.' })]));
    const fill = view.el.querySelector('.ps-aar__share-fill')!;
    expect(animate.mock.contexts).toContain(fill);
  });

  it('shows the contested tag on bar 3 for a contested differences', () => {
    const view = createAfterActionReviewView();
    view.update(aar([FULL[0], FULL[1], node('d', 'differences', { state: 'contested', objection: 'Is that a person or a process?' })]));
    expect(bar(view, 'differences').querySelector('.ps-objection')).not.toBeNull();
    for (const slot of ['intended', 'achieved', 'learned']) expect(bar(view, slot).querySelector('.ps-objection')).toBeNull();
  });

  it('keeps the list to list items: the gauge lies outside it', () => {
    const view = createAfterActionReviewView();
    view.update(aar(FULL));
    const list = view.el.querySelector('[role="list"]')!;
    expect(list.getAttribute('aria-label')).toBeTruthy();
    expect([...list.children].every((child) => child.getAttribute('role') === 'listitem')).toBe(true);
    expect(view.el.querySelectorAll('[role="list"]').length).toBe(1);
  });

  it('returns focus to the bar when Escape closes its card', () => {
    const view = createAfterActionReviewView();
    document.body.append(view.el);
    view.update(aar(FULL));
    button(view, 'differences').click();
    const open = view.el.querySelector<HTMLElement>('.ps-details.is-open')!;
    open.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
    expect(document.activeElement).toBe(button(view, 'differences'));
    view.el.remove();
  });

  it('does nothing after destroy', () => {
    const view = createAfterActionReviewView();
    view.update(aar(FULL.slice(0, 1)));
    view.destroy();
    view.update(aar(FULL));
    expect(filled(view)).toEqual(['true', 'false', 'false', 'false']);
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* After action review');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: aar / inline-size');
    expect(section).toContain('@container aar (');
    expect(section).not.toMatch(/@container \(/);
  });
});
