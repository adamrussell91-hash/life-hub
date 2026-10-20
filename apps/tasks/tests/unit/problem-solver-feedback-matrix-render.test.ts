import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { arcFacing, clusterReach, createFeedbackMatrixView, satelliteAngles } from '../../../../packages/problem-solver/render/feedback-matrix';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const fbm = (nodes: PsNode[], edges: PsEdge[] = []) => run('feedback_matrix', nodes, edges);
const of = (from: string, to: string): PsEdge => ({ id: `e-${from}`, from, to, kind: 'of' });

type View = ReturnType<typeof createFeedbackMatrixView>;
const quadrant = (view: View, q: string) => view.el.querySelector<HTMLElement>(`[data-quadrant="${q}"]`)!;
const pill = (view: View, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] .ps-fbm__pill`)!;
const cluster = (view: View, id: string) => view.el.querySelector<HTMLElement>(`.ps-fbm__cluster[data-node="${id}"]`)!;
const sat = (view: View, id: string) => view.el.querySelector<HTMLElement>(`.ps-fbm__sat[data-node="${id}"]`)!;

const S1 = node('s1', 'suggestion:1', { text: 'Send the agenda two days ahead so people can prepare.', title: 'Agenda two days ahead' });
const S2 = node('s2', 'suggestion:2', { title: 'Rotate the chair' });
const C1 = node('c1', 'compliment:1', { title: 'Started on time' });
const X1 = node('x1', 'change:1', { title: 'Drop the status round' });
const Q1 = node('q1', 'question:1', { title: 'Who owns the notes?' });
const T1 = node('t1', 'theme:1', { tag: 'do_more', title: 'Prepared meetings' });
const T2 = node('t2', 'theme:2', { tag: 'question', title: 'Note ownership' });
const T3 = node('t3', 'theme:3', { tag: 'change', title: 'Shorter rounds' });
const W1 = node('w1', 'why:1', { title: 'Saves the first ten minutes' });
const H1 = node('h1', 'how:1', { title: 'Agenda template' });
const W2 = node('w2', 'why:2', { title: 'Notes go missing' });
const H2 = node('h2', 'how:2', { title: 'Name a note taker' });
const H3 = node('h3', 'how:3', { title: 'Written updates instead' });
const A1 = node('a1', 'action:1', { title: 'Share an agenda template' });
const A2 = node('a2', 'action:2', { title: 'Add a note taker to the invite' });
const FULL_NODES = [S1, S2, C1, X1, Q1, T1, T2, T3, W1, H1, W2, H2, H3, A1, A2];
const FULL_EDGES = [of('w1', 't1'), of('h1', 't1'), of('w2', 't2'), of('h2', 't2'), of('h3', 't3')];
const FULL = () => fbm(FULL_NODES, FULL_EDGES);

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});
function spyAnimate() {
  proto.animate = () => null;
  return vi.spyOn(Element.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
}

describe('Feedback matrix view', () => {
  // Baseline 1-8 (adapted: the four quadrants and their discs are the tool, so they show before any node).
  it('draws no node and no part two for an empty run', () => {
    const view = createFeedbackMatrixView();
    view.update(fbm([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('[data-part="two"]')).toBeNull();
    expect(view.el.getAttribute('aria-label')).toBe('Feedback matrix');
  });

  it('keeps element identity across updates', () => {
    const view = createFeedbackMatrixView();
    view.update(fbm([S1, T1, H1], [of('h1', 't1')]));
    const p = view.el.querySelector('[data-node="s1"]');
    const c = cluster(view, 't1');
    const h = sat(view, 'h1');
    const grid = view.el.querySelector('.ps-fbm__grid');
    view.update(FULL());
    expect(view.el.querySelector('[data-node="s1"]')).toBe(p);
    expect(cluster(view, 't1')).toBe(c);
    expect(sat(view, 'h1')).toBe(h);
    expect(view.el.querySelector('.ps-fbm__grid')).toBe(grid);
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createFeedbackMatrixView();
    view.update(fbm([{ ...X1, state: 'contested', objection: 'Is that about the meeting or one person?' }]));
    const item = view.el.querySelector<HTMLElement>('[data-node="x1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that about the meeting or one person?');
    expect(pill(view, 'x1').getAttribute('aria-label')).toContain(', contested');
    pill(view, 'x1').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Is that about the meeting or one person?');
    view.update(fbm([X1]));
    expect(item.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')).toBeNull();
    expect(pill(view, 'x1').getAttribute('aria-label')).not.toContain('contested');
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')).toBeNull();
  });

  it('opens one details card at a time', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    pill(view, 's1').click();
    sat(view, 'h1').querySelector('button')!.click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(sat(view, 'h1').querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
    expect(pill(view, 's1').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the node title in the shape and the full answer only in the details', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    expect(pill(view, 's1').querySelector('.ps-fbm__title--pill')!.textContent).toBe('Agenda two days ahead');
    expect(cluster(view, 't1').querySelector('.ps-fbm__title--theme')!.textContent).toBe('Prepared meetings');
    expect(sat(view, 'h1').querySelector('.ps-fbm__title--sat')!.textContent).toBe('How');
    const full = 'Send the agenda two days ahead so people can prepare.';
    const holders = [...view.el.querySelectorAll('*')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.includes(full)));
    expect(holders.length).toBeGreaterThan(0);
    expect(holders.every((el) => el.closest('.ps-details'))).toBe(true);
  });

  it('starts no animation on a second identical update', () => {
    const animate = spyAnimate();
    const view = createFeedbackMatrixView();
    view.update(fbm([]));
    view.update(FULL());
    expect(animate).toHaveBeenCalled();
    animate.mockClear();
    view.update(FULL());
    expect(animate).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const animate = spyAnimate();
    const view = createFeedbackMatrixView();
    view.update(FULL());
    expect(animate).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    sat(view, 'h2').querySelector('button')!.click();
    for (const id of ['q1', 't2', 'h2', 'a2']) expect(view.el.querySelectorAll(`[data-node~="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBeGreaterThan(0);
    const keep = FULL_NODES.filter((n) => !['q1', 't2', 'w2', 'h2', 'a2'].includes(n.id));
    view.update(fbm(keep, FULL_EDGES.filter((e) => e.to !== 't2')));
    for (const id of ['q1', 't2', 'w2', 'h2', 'a2']) expect(view.el.querySelectorAll(`[data-node~="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
  });

  // Tool-specific.
  it('has the four quadrants and four symbol discs with no nodes', () => {
    const view = createFeedbackMatrixView();
    view.update(fbm([]));
    expect([...view.el.querySelectorAll('[data-quadrant]')].map((q) => q.getAttribute('data-quadrant'))).toEqual(['suggestion', 'compliment', 'change', 'question']);
    expect([...view.el.querySelectorAll('[data-quadrant] .ps-fbm__title--quadrant')].map((t) => t.textContent)).toEqual(['Suggestions', 'Compliments', 'Changes', 'Questions']);
    expect([...view.el.querySelectorAll('[data-quadrant]')].map((q) => q.getAttribute('data-fill'))).toEqual(['yellow', 'blue', 'red', 'yellow']);
    const discs = [...view.el.querySelectorAll('[data-disc]')];
    expect(discs.map((d) => d.getAttribute('data-disc'))).toEqual(['suggestion', 'compliment', 'change', 'question']);
    expect(discs.map((d) => d.getAttribute('data-tone'))).toEqual(['blue', 'yellow', 'yellow', 'blue']);
    expect(discs.every((d) => d.closest('[aria-hidden="true"]'))).toBe(true);
  });

  it('drops a change pill into the Changes quadrant', () => {
    const view = createFeedbackMatrixView();
    view.update(fbm([S1, X1]));
    expect(quadrant(view, 'change').querySelector('[data-node="x1"]')).not.toBeNull();
    expect(quadrant(view, 'suggestion').querySelector('[data-node="s1"]')).not.toBeNull();
    expect(quadrant(view, 'suggestion').querySelector('[data-node="x1"]')).toBeNull();
  });

  it('shows part two only once a theme exists', () => {
    const view = createFeedbackMatrixView();
    view.update(fbm([S1, C1, X1]));
    expect(view.el.querySelector('[data-part="two"]')).toBeNull();
    view.update(fbm([S1, C1, X1, T1]));
    const two = view.el.querySelector('[data-part="two"]')!;
    expect(two).not.toBeNull();
    expect(two.textContent).toContain('Part two');
    view.update(fbm([S1, C1, X1]));
    expect(view.el.querySelector('[data-part="two"]')).toBeNull();
  });

  it('hangs a linked how from its theme as a satellite with a line', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    const h = sat(view, 'h1');
    expect(h.getAttribute('data-for')).toBe('t1');
    expect(h.getAttribute('data-kind')).toBe('how');
    expect(cluster(view, 't1').contains(h)).toBe(true);
    expect(cluster(view, 't1').querySelector('[data-edge="h1>t1"]')).not.toBeNull();
    expect(cluster(view, 't2').contains(h)).toBe(false);
    expect(cluster(view, 't1').querySelectorAll('.ps-fbm__sat').length).toBe(2);
  });

  it('colours a question theme yellow with blue how satellites, and a do-more theme blue with yellow ones', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    const fill = (root: Element) => root.querySelector('[data-shape]')!.getAttribute('data-fill');
    expect(cluster(view, 't2').getAttribute('data-tag')).toBe('question');
    expect(fill(cluster(view, 't2').querySelector('.ps-fbm__theme')!)).toBe('yellow');
    expect(fill(sat(view, 'h2'))).toBe('blue');
    expect(fill(sat(view, 'w2'))).toBe('blue');
    expect(fill(cluster(view, 't1').querySelector('.ps-fbm__theme')!)).toBe('blue');
    expect(fill(sat(view, 'h1'))).toBe('yellow');
    expect(fill(sat(view, 'w1'))).toBe('blue');
    expect(fill(cluster(view, 't3').querySelector('.ps-fbm__theme')!)).toBe('red');
    expect(fill(sat(view, 'h3'))).toBe('yellow');
    expect(cluster(view, 't2').querySelector('.ps-fbm__meta')!.textContent).toBe('Question');
  });

  it('shows three pills in a quadrant and "+1 more" for the fourth, which opens a list of the rest', () => {
    const view = createFeedbackMatrixView();
    const four = [1, 2, 3, 4].map((i) => node(`s${i}`, `suggestion:${i}`, { title: `Idea ${i}` }));
    view.update(fbm(four.slice(0, 3)));
    const more = quadrant(view, 'suggestion').querySelector<HTMLButtonElement>('.ps-fbm__more')!;
    expect(more.hidden).toBe(true);
    view.update(fbm(four));
    expect(more.hidden).toBe(false);
    expect(more.textContent).toBe('+1 more');
    const shown = [...quadrant(view, 'suggestion').querySelectorAll<HTMLElement>('.ps-fbm__item')].filter((item) => !item.hidden);
    expect(shown.map((item) => item.getAttribute('data-node'))).toEqual(['s1', 's2', 's3']);
    more.click();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const list = view.el.querySelector(`[id="${more.getAttribute('aria-controls')}"]`)!;
    expect(list.classList.contains('is-open')).toBe(true);
    expect(list.querySelector('[data-for="s4"]')).not.toBeNull();
    view.update(fbm(four.slice(0, 3)));
    expect(more.hidden).toBe(true);
    expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
  });

  it('removes a theme\'s satellites and lines on undo of the theme', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    expect(view.el.querySelectorAll('.ps-fbm__sat[data-for="t1"]').length).toBe(2);
    expect(view.el.querySelectorAll('[data-edge*="t1"]').length).toBe(2);
    view.update(fbm(FULL_NODES.filter((n) => n.id !== 't1'), FULL_EDGES.filter((e) => e.to !== 't1')));
    expect(view.el.querySelectorAll('[data-for="t1"], [data-edge*="t1"], [data-node~="t1"]').length).toBe(0);
    expect(view.el.querySelector('.ps-fbm__sat[data-node="h1"]')).toBeNull();
    expect(view.el.querySelectorAll('.ps-fbm__cluster').length).toBe(2);
  });

  it('spreads satellites again when one is added, and the others glide to their new angles', () => {
    const animate = spyAnimate();
    const view = createFeedbackMatrixView();
    view.update(fbm([T1, W1], [of('w1', 't1')]));
    const w = sat(view, 'w1');
    const before = w.style.getPropertyValue('--a');
    animate.mockClear();
    // Each read lands somewhere new, so the measured move is never zero.
    let n = 0;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => {
      n += 1;
      return { left: n * 7, top: n * 3, width: 10, height: 10, right: n * 7 + 10, bottom: n * 3 + 10, x: n * 7, y: n * 3, toJSON() {} } as DOMRect;
    });
    view.update(fbm([T1, W1, H1], [of('w1', 't1'), of('h1', 't1')]));
    expect(sat(view, 'w1')).toBe(w);
    expect(w.style.getPropertyValue('--a')).not.toBe(before);
    expect(sat(view, 'h1').style.getPropertyValue('--a')).not.toBe(w.style.getPropertyValue('--a'));
    const glides = animate.mock.contexts.filter((target) => target === w);
    expect(glides.length).toBe(1);
    expect(JSON.stringify(animate.mock.calls[animate.mock.contexts.indexOf(w)][0])).toContain('translate');
    expect(animate.mock.contexts).toContain(w.closest('.ps-fbm__cluster')!.querySelector('[data-edge="w1>t1"]'));
  });

  it('lists the actions in order, each a card', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    const actions = view.el.querySelector('.ps-fbm__actions')!;
    expect(actions.querySelector('.ps-fbm__meta')!.textContent).toBe('Actions');
    const items = [...actions.querySelectorAll('[data-node]')];
    expect(items.map((item) => item.getAttribute('data-node'))).toEqual(['a1', 'a2']);
    expect(items[1].querySelector('.ps-fbm__num')!.textContent).toBe('2');
    expect(items[1].querySelector('[data-shape]')!.getAttribute('data-fill')).toBe('card');
  });

  it('keeps every list to list items and names every labelled container with a role', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    for (const list of view.el.querySelectorAll('[role="list"]')) expect([...list.children].every((child) => child.getAttribute('role') === 'listitem')).toBe(true);
    for (const named of view.el.querySelectorAll('[aria-label]')) {
      if (named.tagName === 'BUTTON') continue;
      expect(named.getAttribute('role')).toBeTruthy();
    }
  });

  it('has a phone key pairing each code with its heading, hidden from screen readers and never focusable', () => {
    const view = createFeedbackMatrixView();
    view.update(fbm([]));
    const key = view.el.querySelector('.ps-fbm__key')!;
    expect(key.getAttribute('aria-hidden')).toBe('true');
    expect([...key.querySelectorAll('.ps-fbm__key-code')].map((c) => c.textContent)).toEqual(['S', 'C', 'X', 'Q']);
    expect(key.querySelector('button, [tabindex]')).toBeNull();
    expect([...view.el.querySelectorAll('[data-quadrant] .ps-fbm__code')].map((c) => c.textContent)).toEqual(['S', 'C', 'X', 'Q']);
  });

  it('moves focus to "+N more" when the focused pill moves into it', () => {
    const view = createFeedbackMatrixView();
    document.body.append(view.el);
    const later = [2, 3, 4].map((i) => node(`s${i}`, `suggestion:${i}`, { title: `Idea ${i}` }));
    view.update(fbm(later));
    pill(view, 's4').focus();
    expect(document.activeElement).toBe(pill(view, 's4'));
    view.update(fbm([node('s1', 'suggestion:1', { title: 'Idea 1' }), ...later]));
    const more = quadrant(view, 'suggestion').querySelector<HTMLButtonElement>('.ps-fbm__more')!;
    expect(view.el.querySelector<HTMLElement>('[data-node="s4"]')!.hidden).toBe(true);
    expect(document.activeElement).toBe(more);
    view.el.remove();
  });

  it('keeps "+N more" cards only for the pills past the third', () => {
    const view = createFeedbackMatrixView();
    const four = [2, 3, 4, 5].map((i) => node(`s${i}`, `suggestion:${i}`, { title: `Idea ${i}` }));
    view.update(fbm(four));
    expect([...view.el.querySelectorAll('.ps-fbm__more-list [data-for]')].map((c) => c.getAttribute('data-for'))).toEqual(['s5']);
    view.update(fbm(four.slice(1)));
    expect(view.el.querySelectorAll('.ps-fbm__more-list [data-for]').length).toBe(0);
    view.update(fbm([node('s1', 'suggestion:1'), ...four.slice(1)]));
    expect([...view.el.querySelectorAll('.ps-fbm__more-list [data-for]')].map((c) => c.getAttribute('data-for'))).toEqual(['s5']);
  });

  it('hides the Part two heading and the clusters when only actions remain', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    view.update(fbm([S1, C1, X1, A1]));
    const two = view.el.querySelector<HTMLElement>('[data-part="two"]')!;
    expect((two.firstElementChild as HTMLElement).hidden).toBe(true);
    expect(two.querySelector<HTMLElement>('.ps-fbm__clusters')!.hidden).toBe(true);
    expect(two.querySelector<HTMLElement>('.ps-fbm__actions')!.hidden).toBe(false);
    view.update(FULL());
    expect((two.firstElementChild as HTMLElement).hidden).toBe(false);
  });

  it('draws a new line in along itself: the inner ink scales from the theme', () => {
    const animate = spyAnimate();
    const view = createFeedbackMatrixView();
    view.update(fbm([T1]));
    view.update(fbm([T1, H1], [of('h1', 't1')]));
    const ink = view.el.querySelector('[data-edge="h1>t1"] .ps-fbm__line-ink')!;
    const at = animate.mock.contexts.indexOf(ink);
    expect(at).toBeGreaterThan(-1);
    expect(animate.mock.calls[at][0]).toEqual([{ transform: 'scaleX(0)' }, { transform: 'none' }]);
    expect(animate.mock.contexts).not.toContain(view.el.querySelector('[data-edge="h1>t1"]'));
  });

  it('cuts each stage to the height its satellites reach, and lets an odd last cluster span both columns', () => {
    const view = createFeedbackMatrixView();
    view.update(FULL());
    const h = (id: string) => Number(cluster(view, id).querySelector<HTMLElement>('.ps-fbm__stage')!.style.getPropertyValue('--h'));
    expect(h('t1')).toBeLessThan(100);
    expect(h('t1')).toBeGreaterThan(32);
    expect(cluster(view, 't3').getAttribute('data-span')).toBe('both');
    expect(cluster(view, 't1').hasAttribute('data-span')).toBe(false);
    expect(clusterReach([270])).toEqual({ top: 50, bottom: 19 });
  });

  it('never faces a cluster\'s arc downwards', () => {
    for (let count = 1; count <= 6; count += 1) {
      for (let i = 0; i < count; i += 1) {
        const facing = arcFacing(i, count);
        expect(Math.sin((facing * Math.PI) / 180)).toBeLessThanOrEqual(1e-9);
      }
    }
    expect(arcFacing(0, 1)).toBe(270);
    expect(arcFacing(2, 3)).toBe(180);
    expect(satelliteAngles(1, 270)).toEqual([[270, 270]]);
  });

  it('does nothing after destroy', () => {
    const view = createFeedbackMatrixView();
    view.update(fbm([S1]));
    view.destroy();
    view.update(FULL());
    expect(view.el.querySelector('[data-node="c1"]')).toBeNull();
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* Feedback matrix');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: fbm / inline-size');
    expect(section).toContain('@container fbm (');
    expect(section).not.toMatch(/@container \(/);
  });
});
