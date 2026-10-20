import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFiveCsView } from '../../../../packages/problem-solver/render/five-cs';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const cs = (nodes: PsNode[]) => run('five_cs', nodes);

type View = ReturnType<typeof createFiveCsView>;
const slice = (view: View, c: string) => view.el.querySelector<HTMLElement>(`[data-slice="${c}"]`)!;
const button = (view: View, c: string) => slice(view, c).querySelector<HTMLButtonElement>('.ps-fivecs__button')!;
const rule = (view: View, id: string) => view.el.querySelector<HTMLElement>(`[data-rule="${id}"]`)!;
const oks = (view: View) => [...view.el.querySelectorAll<HTMLElement>('[data-rule]')].map((row) => row.getAttribute('data-ok'));

const NAME = 'Kitchen rota case file 20261020 v1 Final';
const X = node('x', 'contextualise', { text: 'So the next rota lead knows why it changed.', title: 'For the next rota lead' });
const G = node('g', 'categorise', { title: 'Shared kitchen folder' });
const D1 = node('d1', 'condense:1', { text: 'Swaps go through one sheet.', title: 'One swap sheet' });
const D2 = node('d2', 'condense:2', { text: 'The rota goes out on Thursday.', title: 'Out on Thursday' });
const R = node('r', 'correct', { title: 'Nothing to correct' });
const N = node('n', 'correspond', { text: NAME, title: 'Kitchen rota case file' });
const FULL = [X, G, D1, D2, R, N];

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});
function spyAnimate() {
  const made: Array<{ cancel: ReturnType<typeof vi.fn> }> = [];
  proto.animate = () => null;
  const spy = vi.spyOn(Element.prototype, 'animate').mockImplementation(() => {
    const anim = { cancel: vi.fn(), finish() {}, onfinish: null };
    made.push(anim);
    return anim as unknown as Animation;
  });
  return { spy, made };
}

describe('5 Cs view', () => {
  // Baseline 1-8 (adapted: the five slices and the rules card are the tool, so they show before any node).
  it('draws no node and no case file for an empty run', () => {
    const view = createFiveCsView();
    view.update(cs([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('[data-casefile]')).toBeNull();
    expect(view.el.querySelectorAll('.ps-fivecs__shape.is-filled').length).toBe(0);
    expect(view.el.getAttribute('aria-label')).toBe('5 Cs documentation');
  });

  it('keeps element identity across updates', () => {
    const view = createFiveCsView();
    view.update(cs([X]));
    const before = view.el.querySelector('[data-node="x"]');
    const rows = [...view.el.querySelectorAll('[data-rule]')];
    view.update(cs(FULL));
    expect(view.el.querySelector('[data-node="x"]')).toBe(before);
    expect([...view.el.querySelectorAll('[data-rule]')]).toEqual(rows);
    const card = view.el.querySelector('[data-casefile]');
    view.update(cs(FULL));
    expect(view.el.querySelector('[data-casefile]')).toBe(card);
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createFiveCsView();
    view.update(cs([X, node('g', 'categorise', { state: 'contested', objection: 'Who else can open that folder?' })]));
    const item = slice(view, 'categorise');
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Who else can open that folder?');
    expect(button(view, 'categorise').getAttribute('aria-label')).toContain(', contested');
    button(view, 'categorise').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Who else can open that folder?');
    view.update(cs([X, G]));
    expect(item.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'categorise').getAttribute('aria-label')).not.toContain('contested');
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')).toBeNull();
  });

  it('opens one details card at a time', () => {
    const view = createFiveCsView();
    view.update(cs(FULL));
    button(view, 'contextualise').click();
    button(view, 'correct').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'correct').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 'contextualise').getAttribute('aria-expanded')).toBe('false');
    expect(slice(view, 'correct').classList.contains('is-open')).toBe(true);
    expect(slice(view, 'contextualise').classList.contains('is-open')).toBe(false);
  });

  it('shows the node title in the slice and the full answer only in the details', () => {
    const view = createFiveCsView();
    view.update(cs(FULL));
    const item = slice(view, 'contextualise');
    expect(item.querySelector('.ps-fivecs__title')!.textContent).toBe('For the next rota lead');
    expect(item.textContent).not.toContain('So the next rota lead knows why it changed.');
    const texts = [...view.el.querySelectorAll('.ps-details .ps-details__text')].map((t) => t.textContent);
    expect(texts).toContain('So the next rota lead knows why it changed.');
  });

  it('starts no animation on a second identical update', () => {
    const { spy } = spyAnimate();
    const view = createFiveCsView();
    view.update(cs([]));
    view.update(cs(FULL));
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    view.update(cs(FULL));
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const { spy } = spyAnimate();
    const view = createFiveCsView();
    view.update(cs(FULL));
    expect(spy).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createFiveCsView();
    view.update(cs(FULL));
    button(view, 'condense').click();
    for (const id of ['d2', 'n']) expect(view.el.querySelectorAll(`[data-node~="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(cs([X, G, D1, R]));
    for (const id of ['d2', 'n']) expect(view.el.querySelectorAll(`[data-node~="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(slice(view, 'condense').getAttribute('data-node')).toBe('d1');
    expect(slice(view, 'correspond').getAttribute('data-filled')).toBe('false');
    expect(button(view, 'correspond').disabled).toBe(true);
  });

  // Tool-specific.
  it('has five faint slices and eight rule rows before any node', () => {
    const view = createFiveCsView();
    const slices = [...view.el.querySelectorAll<HTMLElement>('[data-slice]')];
    expect(slices.map((s) => s.getAttribute('data-slice'))).toEqual(['contextualise', 'categorise', 'condense', 'correct', 'correspond']);
    expect(slices.every((s) => s.getAttribute('data-filled') === 'false')).toBe(true);
    expect(view.el.querySelectorAll('[data-rule]').length).toBe(8);
    expect(oks(view).every((ok) => ok === null)).toBe(true);
    expect([...view.el.querySelectorAll('.ps-fivecs__slice')].map((g) => g.getAttribute('data-tone'))).toEqual(['yellow', 'blue', 'yellow', 'red', 'blue']);
    const list = view.el.querySelector('[aria-label="Naming rules"]')!;
    expect(list.getAttribute('role')).toBe('list');
    expect([...list.children].every((row) => row.getAttribute('role') === 'listitem')).toBe(true);
    expect(rule(view, 'private').getAttribute('data-kind')).toBe('dont');
    expect(rule(view, 'date').getAttribute('data-kind')).toBe('do');
  });

  it('fills the categorise slice only when categorise is placed', () => {
    const view = createFiveCsView();
    view.update(cs([G]));
    const filled = [...view.el.querySelectorAll('[data-slice]')].map((s) => s.getAttribute('data-filled'));
    expect(filled).toEqual(['false', 'true', 'false', 'false', 'false']);
    expect(slice(view, 'categorise').querySelector('[data-shape]')!.getAttribute('data-fill')).toBe('blue');
    expect(view.el.querySelector('.ps-fivecs__slice[data-art="categorise"]')!.getAttribute('data-filled')).toBe('true');
    expect(view.el.querySelector('.ps-fivecs__slice[data-art="condense"]')!.getAttribute('data-filled')).toBe('false');
    expect(button(view, 'contextualise').disabled).toBe(true);
  });

  it('shows the latest condense item and "+1", with both in its details card', () => {
    const view = createFiveCsView();
    view.update(cs([X, G, D1, D2]));
    const item = slice(view, 'condense');
    expect(item.querySelector('.ps-fivecs__title')!.textContent).toBe('Out on Thursday');
    expect(item.querySelector('.ps-fivecs__count')!.textContent).toBe('+1');
    expect(item.getAttribute('data-node')).toBe('d1 d2');
    const details = view.el.querySelector('[data-slice-for="condense"]')!;
    const texts = [...details.querySelectorAll('.ps-details__text')].map((t) => t.textContent);
    expect(texts).toEqual(['Swaps go through one sheet.', 'The rota goes out on Thursday.']);
    expect(button(view, 'condense').getAttribute('aria-label')).toContain('2 entries');
  });

  it('ticks every strict rule and leaves three to the coach for a good name, shown in the chip', () => {
    const view = createFiveCsView();
    view.update(cs([N]));
    const strict = ['date', 'length', 'version', 'final', 'characters'];
    for (const id of strict) expect(rule(view, id).getAttribute('data-ok')).toBe('true');
    for (const id of ['meaningful', 'private', 'consistent']) {
      expect(rule(view, id).getAttribute('data-ok')).toBe('coach');
      expect(rule(view, id).querySelector('.ps-fivecs__coach')!.textContent).toBe('coach');
    }
    const chip = view.el.querySelector<HTMLElement>('.ps-fivecs__name')!;
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe(NAME);
  });

  it('crosses a strict rule the name breaks', () => {
    const view = createFiveCsView();
    view.update(cs([node('n', 'correspond', { text: 'Kitchen rota 20261020 Final' })]));
    expect(rule(view, 'version').getAttribute('data-ok')).toBe('false');
    expect(rule(view, 'date').getAttribute('data-ok')).toBe('true');
  });

  it('ticks the marks in one after another when the name arrives', () => {
    const { spy } = spyAnimate();
    const view = createFiveCsView();
    view.update(cs([X]));
    view.update(cs([X, N]));
    const marks = spy.mock.contexts.filter((ctx) => (ctx as Element).classList?.contains('ps-fivecs__mark'));
    expect(marks.length).toBe(8);
    const delays = spy.mock.calls.filter((_, i) => marks.includes(spy.mock.contexts[i])).map((call) => (call[1] as KeyframeAnimationOptions).delay);
    expect(delays).toEqual([0, 80, 160, 240, 320, 400, 480, 560]);
  });

  it('shows the contested tag on the Correspond slice for a contested name', () => {
    const view = createFiveCsView();
    view.update(cs([node('n', 'correspond', { text: 'Rota KR 20261020 v1 Final', state: 'contested', objection: 'Would anyone new know what KR means?' })]));
    expect(slice(view, 'correspond').querySelector('.ps-objection')).not.toBeNull();
    for (const c of ['contextualise', 'categorise', 'condense', 'correct']) expect(slice(view, c).querySelector('.ps-objection')).toBeNull();
    expect(rule(view, 'private').getAttribute('data-ok')).toBe('coach');
  });

  it('shows the case file preview only once the run is complete, with the name', () => {
    const view = createFiveCsView();
    view.update(cs([X, G, D1, R]));
    expect(view.el.querySelector('[data-casefile]')).toBeNull();
    view.update(cs(FULL));
    const card = view.el.querySelector<HTMLElement>('[data-casefile]')!;
    expect(card.textContent).toContain(NAME);
    expect(card.textContent).toContain('Purpose');
    expect(card.textContent).toContain('For the next rota lead');
    expect(card.textContent).toContain('2 kept, first: One swap sheet');
    expect(card.textContent).toContain('Nothing to correct');
  });

  it('returns the rows to neutral and drops the preview on undo of correspond, leaving no animation running', () => {
    const { made } = spyAnimate();
    const view = createFiveCsView();
    view.update(cs(FULL.slice(0, 5)));
    view.update(cs(FULL));
    const marks = made.length;
    expect(marks).toBeGreaterThan(0);
    view.update(cs(FULL.slice(0, 5)));
    expect(oks(view).every((ok) => ok === null)).toBe(true);
    expect(view.el.querySelectorAll('.ps-fivecs__mark svg, .ps-fivecs__coach').length).toBe(0);
    expect(view.el.querySelector<HTMLElement>('.ps-fivecs__name')!.hidden).toBe(true);
    expect(view.el.querySelector('[data-casefile]')).toBeNull();
    const ruleAnims = made.filter((_, i) => i < marks);
    // Every mark's tick-in was cancelled.
    expect(ruleAnims.filter((anim) => anim.cancel.mock.calls.length > 0).length).toBeGreaterThanOrEqual(8);
  });

  it('has a key pairing each number with its heading, which opens and focuses the slice', () => {
    const view = createFiveCsView();
    view.update(cs([X, G, D1, D2]));
    const key = view.el.querySelector('.ps-fivecs__key')!;
    expect(key.getAttribute('aria-hidden')).toBe('true');
    const items = [...key.querySelectorAll<HTMLButtonElement>('.ps-fivecs__key-item')];
    expect(items.map((item) => item.querySelector('.ps-fivecs__key-code')!.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(items[2].querySelector('.ps-fivecs__key-title')!.textContent).toBe('Out on Thursday (+1)');
    expect(items[3].disabled).toBe(true);
    expect(items.every((item) => item.tabIndex === -1)).toBe(true);
    document.body.append(view.el);
    items[1].click();
    expect(button(view, 'categorise').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(button(view, 'categorise'));
    expect(items[1].classList.contains('is-open')).toBe(true);
    view.el.remove();
  });

  it('gives every named container a role', () => {
    const view = createFiveCsView();
    view.update(cs(FULL));
    for (const named of view.el.querySelectorAll('[aria-label]')) {
      if (named.tagName === 'BUTTON') continue;
      expect(named.getAttribute('role')).toBeTruthy();
    }
    for (const list of view.el.querySelectorAll('[role="list"]')) {
      expect([...list.children].every((child) => child.getAttribute('role') === 'listitem')).toBe(true);
    }
  });

  it('does nothing after destroy', () => {
    const view = createFiveCsView();
    view.update(cs([X]));
    view.destroy();
    view.update(cs(FULL));
    expect(slice(view, 'categorise').hasAttribute('data-node')).toBe(false);
    expect(view.el.querySelector('[data-casefile]')).toBeNull();
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* 5 Cs documentation');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z0-9][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: fivecs / inline-size');
    expect(section).toContain('@container fivecs (');
    expect(section).not.toMatch(/@container \(/);
  });
});
