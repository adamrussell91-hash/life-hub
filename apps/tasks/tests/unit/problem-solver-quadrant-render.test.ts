import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImpactEffortView } from '../../../../packages/problem-solver/render/impact-effort';
import { createStakeholderMapView } from '../../../../packages/problem-solver/render/stakeholder-map';
import { createAssumptionsMapView } from '../../../../packages/problem-solver/render/assumptions-map';
import { createRoseThornBudView } from '../../../../packages/problem-solver/render/rose-thorn-bud';
import { createEisenhowerView } from '../../../../packages/problem-solver/render/eisenhower';
import type { PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, index: number, tag: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot: `item:${index}`, text: `answer ${id}`, title: `Title ${id}`, tag, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[]): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges: [] });

type Case = { name: string; tool: PsToolRun['tool']; make: () => ReturnType<typeof createImpactEffortView>; tags: string[]; label: string; words: string[]; headings: string[] };
const CASES: Case[] = [
  { name: 'Impact vs Effort', tool: 'impact_effort', make: createImpactEffortView, tags: ['quick_win', 'big_bet', 'fill_in', 'drop'], label: 'Impact vs Effort', words: ['Low effort', 'High effort', 'High impact', 'Low impact'], headings: ['Quick wins', 'Big bets', 'Fill-ins', 'Drop'] },
  { name: 'Stakeholder map', tool: 'stakeholder_map', make: createStakeholderMapView, tags: ['keep_satisfied', 'manage_closely', 'monitor', 'keep_informed'], label: 'Stakeholder map', words: ['Low interest', 'High interest', 'High power', 'Low power'], headings: ['Keep satisfied', 'Manage closely', 'Monitor', 'Keep informed'] },
  { name: 'Assumptions map', tool: 'assumptions_map', make: createAssumptionsMapView, tags: ['test_first', 'act_on', 'watch', 'park'], label: 'Assumptions map', words: ['Not yet known', 'Known', 'Important', 'Less important'], headings: ['Test first', 'Act on', 'Watch', 'Park'] }
];

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
  document.body.replaceChildren();
});

const item = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLElement>(`.ps-eisen__item[data-node="${id}"]`)!;
const button = (view: { el: HTMLElement }, id: string) => item(view, id).querySelector<HTMLButtonElement>('button')!;
const quadrantOf = (view: { el: HTMLElement }, id: string) => item(view, id).closest('[data-quadrant]')!.getAttribute('data-quadrant');

describe.each(CASES)('$name view', (c) => {
  const nodes = c.tags.map((tag, i) => node(`n${i + 1}`, i + 1, tag));

  it('draws nothing for an empty run, then a grid with a labelled group per quadrant', () => {
    const view = c.make();
    view.update(run(c.tool, []));
    expect(view.el.querySelector('.ps-eisen__chart')).toBeNull();
    expect(view.el.getAttribute('aria-label')).toBe(c.label);
    view.update(run(c.tool, nodes));
    const groups = [...view.el.querySelectorAll('[data-quadrant]')];
    expect(groups.map((g) => g.getAttribute('data-quadrant'))).toEqual(c.tags);
    for (const g of groups) expect(g.getAttribute('role')).toBe('group');
    expect([...view.el.querySelectorAll('.ps-eisen__heading')].map((h) => h.textContent)).toEqual(c.headings);
    expect([...view.el.querySelectorAll('.ps-eisen__band-word')].map((w) => w.textContent).filter(Boolean).sort()).toEqual([...c.words].sort());
    expect(view.el.querySelectorAll('.ps-eisen__icon').length).toBe(4);
  });

  it('puts each item in the quadrant its tag names, and an unknown tag in the first', () => {
    const view = c.make();
    view.update(run(c.tool, [...nodes, node('odd', 9, 'nonsense')]));
    nodes.forEach((n, i) => expect(quadrantOf(view, n.id)).toBe(c.tags[i]));
    expect(quadrantOf(view, 'odd')).toBe(c.tags[0]);
  });

  it('gives every item a labelled, keyboard-reachable button that opens one details card', () => {
    const view = c.make();
    view.update(run(c.tool, nodes));
    const b1 = button(view, 'n1');
    expect(b1.tagName).toBe('BUTTON');
    expect(b1.getAttribute('aria-label')).toContain('Title n1');
    expect(b1.getAttribute('aria-expanded')).toBe('false');
    b1.click();
    button(view, 'n2').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'n2').getAttribute('aria-expanded')).toBe('true');
  });

  it('moves an item to its new quadrant as the same element', () => {
    const view = c.make();
    view.update(run(c.tool, nodes));
    const before = item(view, 'n1');
    view.update(run(c.tool, nodes.map((n) => (n.id === 'n1' ? { ...n, tag: c.tags[3] } : n))));
    expect(item(view, 'n1')).toBe(before);
    expect(quadrantOf(view, 'n1')).toBe(c.tags[3]);
  });

  it('tags a linked task and marks a pending proposal', () => {
    const view = c.make();
    view.update(run(c.tool, nodes));
    view.setTasks([{ nodeId: 'n1', taskId: 'task-1', status: 'in_progress' }]);
    expect(item(view, 'n1').classList.contains('is-task')).toBe(true);
    view.setProposed(['n2']);
    expect(button(view, 'n2').getAttribute('aria-label')).toContain('proposed task');
    view.setTasks([{ nodeId: 'n1', taskId: 'task-1', status: 'removed' }]);
    expect(item(view, 'n1').classList.contains('is-removed')).toBe(true);
  });

  it('removes the items and the grid with the last item', () => {
    const view = c.make();
    view.update(run(c.tool, nodes));
    view.update(run(c.tool, []));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-eisen__chart')).toBeNull();
  });
});

describe('Rose, Thorn, Bud view', () => {
  const nodes = [node('r1', 1, 'rose'), node('r2', 2, 'thorn'), node('r3', 3, 'bud'), node('r4', 4, 'rose')];

  it('draws three side-by-side lists with no bands', () => {
    const view = createRoseThornBudView();
    view.update(run('rose_thorn_bud', nodes));
    expect(view.el.getAttribute('aria-label')).toBe('Rose, Thorn, Bud');
    expect(view.el.classList.contains('ps-eisen--lists')).toBe(true);
    expect([...view.el.querySelectorAll('[data-quadrant]')].map((g) => g.getAttribute('data-quadrant'))).toEqual(['rose', 'thorn', 'bud']);
    expect(view.el.querySelectorAll('.ps-eisen__band, .ps-eisen__side, .ps-eisen__corner').length).toBe(0);
    expect(view.el.querySelector('[data-quadrant="rose"]')!.getAttribute('aria-label')).toBe('Rose');
    expect(quadrantOf(view, 'r4')).toBe('rose');
    expect(quadrantOf(view, 'r3')).toBe('bud');
  });

  it('shows a bud as a task once linked, and lists items in slot order', () => {
    const view = createRoseThornBudView();
    view.update(run('rose_thorn_bud', nodes));
    view.setTasks([{ nodeId: 'r3', taskId: 'task-3', status: 'open' }]);
    expect(item(view, 'r3').getAttribute('data-task-status')).toBe('open');
    const rose = view.el.querySelector('[data-quadrant="rose"] .ps-eisen__items')!;
    expect([...rose.children].map((c) => c.getAttribute('data-node'))).toEqual(['r1', 'r4']);
  });

  it('keeps button labels and starts no animation on a second identical update', () => {
    proto.animate = () => null;
    const spy = vi.spyOn(Element.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
    const view = createRoseThornBudView();
    view.update(run('rose_thorn_bud', nodes));
    view.update(run('rose_thorn_bud', [...nodes, node('r5', 5, 'bud')]));
    const calls = spy.mock.calls.length;
    view.update(run('rose_thorn_bud', nodes));
    expect(spy.mock.calls.length).toBe(calls);
    expect(button(view, 'r2').getAttribute('aria-label')).toContain('Thorn item 2: Title r2');
  });
});

describe('Eisenhower wrapper', () => {
  it('still draws the book labels over the shared view', () => {
    const view = createEisenhowerView();
    view.update(run('eisenhower', [node('e1', 1, 'do'), node('e2', 2, 'eliminate')]));
    expect(view.el.querySelector('.ps-eisen__band--urgent')!.textContent).toBe('Urgent');
    expect(view.el.querySelector('.ps-eisen__side--not-important')!.textContent).toBe('Not important');
  });
});
