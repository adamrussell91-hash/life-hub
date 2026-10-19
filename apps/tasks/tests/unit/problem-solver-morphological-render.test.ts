import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMorphologicalView } from '../../../../packages/problem-solver/render/morphological';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const edge = (from: string, to: string, kind: string): PsEdge => ({ from, to, kind });
const morph = (nodes: PsNode[], edges: PsEdge[] = []) => run('morphological', nodes, edges);

/** Three subjects with two or three attributes; one contradiction (a12 with a21); two scenarios. */
const GRID = [
  node('p', 'problem', { text: 'Plan a weekend repair stall.' }),
  node('s1', 'subject:1', { title: 'Place' }),
  node('s2', 'subject:2', { title: 'Staff' }),
  node('s3', 'subject:3', { title: 'Price' }),
  node('a11', 'attribute:1', { title: 'Library' }),
  node('a12', 'attribute:2', { title: 'Market' }),
  node('a21', 'attribute:3', { title: 'Volunteers' }),
  node('a22', 'attribute:4', { title: 'Paid fixer' }),
  node('a23', 'attribute:5', { title: 'Students' }),
  node('a31', 'attribute:6', { title: 'Free' }),
  node('a32', 'attribute:7', { title: 'Donation' })
];
const GRID_EDGES = [edge('a11', 's1', 'of'), edge('a12', 's1', 'of'), edge('a21', 's2', 'of'), edge('a22', 's2', 'of'), edge('a23', 's2', 'of'), edge('a31', 's3', 'of'), edge('a32', 's3', 'of')];
const CONTRA = [node('c1', 'contradiction:1', { title: 'No market volunteers' })];
const CONTRA_EDGES = [edge('c1', 'a12', 'pair'), edge('c1', 'a21', 'pair')];
const picks = (sc: string, ids: string[]) => ids.map((id) => edge(sc, id, 'picks'));
/** Scenario 1 is consistent; scenario 2 picks the clashing pair. */
const SCEN = [node('sc1', 'scenario:1'), node('sc2', 'scenario:2')];
const SCEN_EDGES = [...picks('sc1', ['a11', 'a22', 'a31']), ...picks('sc2', ['a12', 'a21', 'a32'])];
const FULL = [...GRID, ...CONTRA, ...SCEN, node('ev', 'evaluation'), node('ch', 'choice')];
const FULL_EDGES = [...GRID_EDGES, ...CONTRA_EDGES, ...SCEN_EDGES];

const q = (view: { el: HTMLElement }, sel: string) => view.el.querySelector<HTMLElement>(sel);
const item = (view: { el: HTMLElement }, id: string) => q(view, `[data-node="${id}"]`)!;
const button = (view: { el: HTMLElement }, id: string) => {
  const host = item(view, id);
  return host.matches('button') ? (host as HTMLButtonElement) : host.querySelector<HTMLButtonElement>('button')!;
};
const pickedIds = (view: { el: HTMLElement }) => [...view.el.querySelectorAll<HTMLElement>('.ps-morph__cell.is-picked')].map((el) => el.dataset.node);
const tabs = (view: { el: HTMLElement }) => [...view.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

const proto = HTMLElement.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
});
function spyAnimate() {
  proto.animate = () => null;
  return vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
}

describe('Morphological analysis view', () => {
  // Baseline 1-8.
  it('renders nothing for an empty run', () => {
    const view = createMorphologicalView();
    view.update(morph([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(q(view, '.ps-morph__grid')).toBeNull();
    expect(q(view, '[data-scenario-line]')).toBeNull();
  });

  it('keeps element identity across updates', () => {
    const view = createMorphologicalView();
    view.update(morph(GRID, GRID_EDGES));
    const before = ['p', 's1', 'a11', 'a23'].map((id) => item(view, id));
    view.update(morph(FULL, FULL_EDGES));
    ['p', 's1', 'a11', 'a23'].forEach((id, i) => expect(item(view, id)).toBe(before[i]));
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createMorphologicalView();
    const contested = GRID.map((n) => (n.id === 'a22' ? { ...n, state: 'contested' as const, objection: 'Is there budget for a fixer?' } : n));
    view.update(morph(contested, GRID_EDGES));
    const cell = item(view, 'a22');
    expect(cell.classList.contains('is-contested')).toBe(true);
    expect(cell.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is there budget for a fixer?');
    expect(button(view, 'a22').getAttribute('aria-label')).toContain(', contested');
    button(view, 'a22').click();
    expect(q(view, '.ps-details.is-open .ps-details__note')!.textContent).toContain('Is there budget for a fixer?');
    view.update(morph(GRID, GRID_EDGES));
    expect(cell.classList.contains('is-contested')).toBe(false);
    expect(cell.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'a22').getAttribute('aria-label')).not.toContain('contested');
  });

  it('opens one details card at a time', () => {
    const view = createMorphologicalView();
    view.update(morph(FULL, FULL_EDGES));
    button(view, 's1').click();
    button(view, 'a21').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'a21').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 's1').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows titles in the shapes and the full answer only in the details', () => {
    const view = createMorphologicalView();
    view.update(morph(FULL, FULL_EDGES));
    expect(item(view, 'a23').querySelector('.ps-morph__title')!.textContent).toBe('Students');
    for (const shape of view.el.querySelectorAll('[data-shape]')) expect(shape.textContent).not.toContain('answer text');
    expect([...view.el.querySelectorAll('.ps-details')].some((card) => card.textContent!.includes('attribute:5 answer text'))).toBe(true);
  });

  it('starts no animation on a second identical update', () => {
    const animate = spyAnimate();
    const view = createMorphologicalView();
    view.update(morph([]));
    view.update(morph(FULL, FULL_EDGES));
    expect(animate).toHaveBeenCalled();
    animate.mockClear();
    view.update(morph(FULL, FULL_EDGES));
    expect(animate).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation on the first update', () => {
    const animate = spyAnimate();
    const view = createMorphologicalView();
    view.update(morph(FULL, FULL_EDGES));
    expect(animate).not.toHaveBeenCalled();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createMorphologicalView();
    view.layout(360);
    view.update(morph(FULL, FULL_EDGES));
    const gone = ['s2', 'a21', 'a22', 'a23', 'c1', 'sc2', 'ev', 'ch'];
    for (const id of gone) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    const keep = FULL.filter((n) => !gone.includes(n.id));
    const keepEdges = FULL_EDGES.filter((e) => !gone.includes(e.from) && !gone.includes(e.to));
    view.update(morph(keep, keepEdges));
    for (const id of gone) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
    expect(view.el.querySelectorAll('[data-subject]').length).toBe(2);
    expect(q(view, '.ps-morph__notch')).toBeNull();
    expect(q(view, '.ps-morph__clashes')).toBeNull();
  });

  // Tool-specific.
  it('renders an attribute linked to subject 2 in subject 2’s column, in edge order', () => {
    const view = createMorphologicalView();
    view.update(morph(GRID, GRID_EDGES));
    const col = q(view, '[data-subject="2"]')!;
    expect(item(view, 'a22').closest('[data-subject]')).toBe(col);
    expect([...col.querySelectorAll<HTMLElement>('[data-attribute]')].map((el) => el.dataset.node)).toEqual(['a21', 'a22', 'a23']);
    expect(q(view, '[data-subject="1"] .ps-morph__head .ps-morph__title')!.textContent).toBe('Place');
    // Shorter columns are carried to the foot with empty cells.
    expect(q(view, '[data-subject="1"]')!.querySelectorAll('.ps-morph__filler').length).toBe(1);
  });

  it('marks exactly one picked cell per subject for the selected scenario', () => {
    const view = createMorphologicalView();
    view.update(morph([...GRID, SCEN[0]], [...GRID_EDGES, ...picks('sc1', ['a11', 'a22', 'a31'])]));
    expect(pickedIds(view)).toEqual(['a11', 'a22', 'a31']);
    for (const col of view.el.querySelectorAll('[data-subject]')) expect(col.querySelectorAll('.is-picked').length).toBe(1);
    expect(item(view, 'a22').querySelector('[data-shape]')!.getAttribute('data-fill')).toBe('blue');
    expect(item(view, 'a21').querySelector('[data-shape]')!.getAttribute('data-fill')).toBe('yellow');
  });

  it('draws the scenario line only once a scenario exists', () => {
    const view = createMorphologicalView();
    view.update(morph(GRID, GRID_EDGES));
    expect(q(view, '[data-scenario-line]')).toBeNull();
    view.update(morph([...GRID, SCEN[0]], [...GRID_EDGES, ...picks('sc1', ['a11', 'a22', 'a31'])]));
    expect(q(view, '[data-scenario-line]')).not.toBeNull();
    view.update(morph(GRID, GRID_EDGES));
    expect(q(view, '[data-scenario-line]')).toBeNull();
  });

  it('dashes a clashing scenario with a cross, and says so on its tab', () => {
    const view = createMorphologicalView();
    view.update(morph(FULL, FULL_EDGES));
    // The newest scenario (2) shows by default, and it clashes.
    expect(q(view, '[data-scenario-line]')!.getAttribute('data-consistent')).toBe('false');
    expect(q(view, '[data-clash-marker]')).not.toBeNull();
    const [one, two] = tabs(view);
    expect(two.querySelector<HTMLElement>('.ps-morph__clash-tag')!.hidden).toBe(false);
    expect(one.querySelector<HTMLElement>('.ps-morph__clash-tag')!.hidden).toBe(true);
    one.click();
    expect(q(view, '[data-scenario-line]')!.getAttribute('data-consistent')).toBe('true');
    expect(q(view, '[data-clash-marker]')).toBeNull();
  });

  it('moves the picks to the other tab without replacing cells, and closes an open card', () => {
    const view = createMorphologicalView();
    view.update(morph(FULL, FULL_EDGES));
    const before = [...view.el.querySelectorAll('.ps-morph__cell')];
    expect(pickedIds(view)).toEqual(['a12', 'a21', 'a32']);
    button(view, 'sc2').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    tabs(view)[0].click();
    expect(pickedIds(view)).toEqual(['a11', 'a22', 'a31']);
    expect([...view.el.querySelectorAll('.ps-morph__cell')]).toEqual(before);
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(0);
    expect(tabs(view)[0].getAttribute('aria-selected')).toBe('true');
    // A picked tab sticks through later updates.
    view.update(morph([...FULL, node('sc3', 'scenario:3')], [...FULL_EDGES, ...picks('sc3', ['a12', 'a23', 'a31'])]));
    expect(pickedIds(view)).toEqual(['a11', 'a22', 'a31']);
  });

  it('names both attributes on the contradiction chip and notches both cells', () => {
    const view = createMorphologicalView();
    view.update(morph([...GRID, ...CONTRA], [...GRID_EDGES, ...CONTRA_EDGES]));
    expect(item(view, 'c1').textContent).toContain('Market cannot go with Volunteers');
    expect(item(view, 'a12').querySelector('.ps-morph__notch')).not.toBeNull();
    expect(item(view, 'a21').querySelector('.ps-morph__notch')).not.toBeNull();
    expect(item(view, 'a11').querySelector('.ps-morph__notch')).toBeNull();
    item(view, 'c1').dispatchEvent(new Event('mouseenter'));
    expect(item(view, 'a12').classList.contains('is-flagged')).toBe(true);
    expect(item(view, 'a21').classList.contains('is-flagged')).toBe(true);
    item(view, 'c1').dispatchEvent(new Event('mouseleave'));
    expect(item(view, 'a12').classList.contains('is-flagged')).toBe(false);
  });

  it('shows codes and a key grouped by subject when compact; key items open the cell’s card', () => {
    const view = createMorphologicalView();
    view.update(morph(FULL, FULL_EDGES));
    expect(view.el.getAttribute('data-compact')).toBe('false');
    expect(q(view, '.ps-morph__key')!.hidden).toBe(true);
    view.layout(360);
    expect(view.el.getAttribute('data-compact')).toBe('true');
    const key = q(view, '.ps-morph__key')!;
    expect(key.hidden).toBe(false);
    expect(item(view, 'a22').querySelector('.ps-morph__code')!.textContent).toBe('S2·2');
    expect(q(view, '[data-subject="3"] .ps-morph__head .ps-morph__code')!.textContent).toBe('S3');
    const group = key.querySelector('[data-for="s2"]')!;
    expect(group.querySelector('.ps-morph__key-head')!.textContent).toBe('S2Staff');
    expect([...group.querySelectorAll('.ps-morph__key-row')].map((r) => r.textContent)).toEqual(['S2·1Volunteers', 'S2·2Paid fixer', 'S2·3Students']);
    const row = key.querySelector<HTMLButtonElement>('[data-for="a22"]')!;
    row.click();
    expect(button(view, 'a22').getAttribute('aria-expanded')).toBe('true');
    expect(row.getAttribute('aria-expanded')).toBe('true');
    button(view, 's1').click();
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the problem above the grid and the evaluation below it', () => {
    const view = createMorphologicalView();
    view.update(morph(FULL.map((n) => (n.id === 'ev' ? { ...n, text: 'Library with paid fixer holds together.' } : n)), FULL_EDGES));
    const children = [...view.el.children];
    const problem = item(view, 'p');
    const evaluation = item(view, 'ev');
    expect(children.indexOf(problem)).toBeLessThan(children.indexOf(q(view, '.ps-morph__chart')!));
    expect(q(view, '.ps-morph__chart')!.compareDocumentPosition(evaluation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(problem.querySelector('.ps-morph__card-text')!.textContent).toBe('Plan a weekend repair stall.');
    expect(evaluation.querySelector('.ps-morph__card-text')!.textContent).toBe('Library with paid fixer holds together.');
  });

  describe('chosen option', () => {
    it('is absent until the choice exists, then shows its full text; removing the node removes the card', () => {
      const view = createMorphologicalView();
      const base = FULL.filter((n) => n.id !== 'ch');
      view.update(morph(base, FULL_EDGES));
      expect(q(view, '[data-choice]')).toBeNull();
      view.update(morph([...base, node('ch', 'choice', { text: 'Run the library stall with a paid fixer.' })], FULL_EDGES));
      expect(q(view, '[data-choice] .ps-choice__text')!.textContent).toBe('Run the library stall with a paid fixer.');
      view.update(morph(base, FULL_EDGES));
      expect(q(view, '[data-choice]')).toBeNull();
    });
  });

  it('does nothing after destroy', () => {
    const view = createMorphologicalView();
    view.update(morph(FULL, FULL_EDGES));
    view.destroy();
    tabs(view)[0].click();
    expect(pickedIds(view)).toEqual(['a12', 'a21', 'a32']);
    view.update(morph([]));
    expect(q(view, '.ps-morph__grid')).not.toBeNull();
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* Morphological analysis');
    expect(start).toBeGreaterThan(-1);
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z][^\n]*\(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(section).toContain('container: morph / inline-size');
    expect(section).toContain('@container morph (');
    expect(section).not.toMatch(/@container \(/);
  });
});
