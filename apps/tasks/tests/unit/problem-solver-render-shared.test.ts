// apps/tasks/tests/unit/problem-solver-render-shared.test.ts
// Shared renderer behaviour checked once across every renderer: a node whose state changes
// after it was drawn updates its contested marks in place, and views with observers or
// frame loops let go of them on destroy().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalogicalReasoningView } from '../../../../packages/problem-solver/render/analogical-reasoning';
import { createCausalMapView } from '../../../../packages/problem-solver/render/causal-map';
import { createConceptMapView } from '../../../../packages/problem-solver/render/concept-map';
import { createContradictionView } from '../../../../packages/problem-solver/render/contradiction';
import { createDunckerView } from '../../../../packages/problem-solver/render/duncker';
import { createFiveWhysView } from '../../../../packages/problem-solver/render/five-whys';
import { createForceFieldView } from '../../../../packages/problem-solver/render/force-field';
import { createFromToView } from '../../../../packages/problem-solver/render/from-to';
import { createGapBasicView } from '../../../../packages/problem-solver/render/gap-basic';
import { createGapRadarView } from '../../../../packages/problem-solver/render/gap-radar';
import { createIntentStatementView } from '../../../../packages/problem-solver/render/intent-statement';
import { createLotusBlossomView } from '../../../../packages/problem-solver/render/lotus-blossom';
import { createPerspectiveShiftView } from '../../../../packages/problem-solver/render/perspective-shift';
import { createProblemReductionView } from '../../../../packages/problem-solver/render/problem-reduction';
import { createProblemStatementView } from '../../../../packages/problem-solver/render/problem-statement';
import { createProblemTreeView } from '../../../../packages/problem-solver/render/problem-tree';
import { createRadialTreeView } from '../../../../packages/problem-solver/render/radial-tree';
import { createSmartView } from '../../../../packages/problem-solver/render/smart';
import { createSolutionTreeView } from '../../../../packages/problem-solver/render/solution-tree';
import type { PsEdge, PsNode, PsToolId, PsToolRun } from '../../../../packages/problem-solver/types';

type View = { el: HTMLElement; update(run: PsToolRun): void; destroy?(): void };
type State = Pick<PsNode, 'state' | 'objection'>;

const ACCEPTED: State = { state: 'accepted', objection: undefined };
const CONTESTED: State = { state: 'contested', objection: 'Is that really the cause?' };

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, state: 'accepted', skills: [], turnId: 't', ...extra });

/** One case per drawn shape: the renderer, its tool, the nodes (target last) and the target id. */
type Case = { name: string; make: () => View; tool: PsToolId; nodes: (target: State) => PsNode[]; edges?: PsEdge[]; target: string };

const CASES: Case[] = [
  { name: 'five whys', make: () => createFiveWhysView(), tool: 'five_whys', target: 'w1', nodes: (s) => [node('p', 'problem'), node('w1', 'why:1', s)] },
  { name: 'problem tree', make: () => createProblemTreeView(), tool: 'problem_tree', target: 'c1', nodes: (s) => [node('t', 'trunk'), node('c1', 'cause:1', s)] },
  { name: 'concept map', make: () => createConceptMapView(), tool: 'concept_map', target: 'a', nodes: (s) => [node('t', 'theme'), node('a', 'concept:1', s)] },
  { name: 'problem statement block', make: () => createProblemStatementView(), tool: 'problem_statement', target: 'i', nodes: (s) => [node('p', 'problem'), node('i', 'impact', s)] },
  { name: 'problem statement sentence', make: () => createProblemStatementView(), tool: 'problem_statement', target: 'st', nodes: (s) => [node('p', 'problem'), node('st', 'statement', s)] },
  { name: 'gap basic', make: () => createGapBasicView(), tool: 'gap_basic', target: 'o', nodes: (s) => [node('c', 'current'), node('o', 'objective', s)] },
  { name: 'gap radar', make: () => createGapRadarView(), tool: 'gap_radar', target: 'c', nodes: (s) => [node('o', 'objective'), node('c', 'current', s)] },
  { name: 'smart', make: () => createSmartView(), tool: 'smart', target: 'm', nodes: (s) => [node('p', 'problem'), node('m', 'm', s)] },
  { name: 'causal map', make: () => createCausalMapView(), tool: 'causal_map', target: 'c1', nodes: (s) => [node('p', 'problem'), node('c1', 'cause:1', s)] },
  { name: 'perspective shift', make: () => createPerspectiveShiftView(), tool: 'perspective_shift', target: 's1', nodes: (s) => [node('s1', 'stakeholder:1', s)] },
  { name: 'radial tree', make: () => createRadialTreeView(), tool: 'radial_tree', target: 'root', nodes: (s) => [node('root', 'root', s)] },
  { name: 'force field bar', make: () => createForceFieldView(), tool: 'force_field', target: 'goal', nodes: (s) => [node('cur', 'current'), node('goal', 'goal', s)] },
  { name: 'force field arrow', make: () => createForceFieldView(), tool: 'force_field', target: 'f1', nodes: (s) => [node('cur', 'current'), node('goal', 'goal'), node('f1', 'for:1', s)] },
  { name: 'from to', make: () => createFromToView(), tool: 'from_to', target: 'a1', nodes: (s) => [node('a1', 'aspect:1', s)] },
  { name: 'intent statement', make: () => createIntentStatementView(), tool: 'intent_statement', target: 'pr', nodes: (s) => [node('pr', 'problem', s)] },
  { name: 'problem reduction', make: () => createProblemReductionView(), tool: 'problem_reduction', target: 'p', nodes: (s) => [node('p', 'problem', s)] },
  { name: 'analogical reasoning', make: () => createAnalogicalReasoningView(), tool: 'analogical_reasoning', target: 's', nodes: (s) => [node('s', 'source', s)] },
  { name: 'solution tree', make: () => createSolutionTreeView(), tool: 'solution_tree', target: 'a', nodes: (s) => [node('a', 'aim', s)] },
  { name: 'lotus blossom', make: () => createLotusBlossomView(), tool: 'lotus_blossom', target: 'p', nodes: (s) => [node('p', 'problem', s)] },
  { name: 'duncker', make: () => createDunckerView(), tool: 'duncker', target: 'p', nodes: (s) => [node('p', 'problem', s)] },
  { name: 'contradiction', make: () => createContradictionView(), tool: 'contradiction', target: 'w', nodes: (s) => [node('i', 'improving'), node('w', 'worsening', s)] },
  { name: 'contradiction sentence', make: () => createContradictionView(), tool: 'contradiction', target: 's', nodes: (s) => [node('i', 'improving'), node('w', 'worsening'), node('s', 'statement', s)] }
];

const runOf = (c: Case, state: State): PsToolRun => ({ id: 'r', tool: c.tool, status: 'active', nodes: c.nodes(state), edges: c.edges ?? [], ...(c.tool === 'gap_radar' ? { radar: { snapshots: [] } } : {}) });

function itemOf(view: View, id: string): HTMLElement {
  const item = view.el.querySelector<HTMLElement>(`[data-node~="${id}"]`);
  if (!item) throw new Error(`no item for ${id}`);
  return item;
}

/** The button that opens the target's details: the item itself, or the one inside it. */
function buttonOf(item: HTMLElement): HTMLElement {
  return item.matches('button[aria-controls]') ? item : item.querySelector<HTMLElement>('button[aria-controls]')!;
}

function noteOf(view: View, button: HTMLElement): Element | null {
  const card = view.el.querySelector(`[id="${button.getAttribute('aria-controls')}"]`);
  return card?.querySelector('.ps-details__note') ?? null;
}

describe('contested state changes after a node is drawn', () => {
  it.each(CASES)('$name: the tag, class, label and note follow the state, in place', (c) => {
    const view = c.make();
    view.update(runOf(c, ACCEPTED));
    const item = itemOf(view, c.target);
    const button = buttonOf(item);
    // The solution tree's aim keeps a hidden measuring copy of its words; that copy is not counted.
    const tags = () => [...item.querySelectorAll('.ps-objection')].filter((tag) => !tag.closest('.is-probe')).length;
    expect(item.classList.contains('is-contested')).toBe(false);
    expect(tags()).toBe(0);
    expect(button.getAttribute('aria-label') ?? '').not.toContain('contested');
    expect(noteOf(view, button)).toBeNull();

    view.update(runOf(c, CONTESTED));
    expect(itemOf(view, c.target)).toBe(item);
    expect(buttonOf(item)).toBe(button);
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(tags()).toBe(1);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that really the cause?');
    if (button.hasAttribute('aria-label')) expect(button.getAttribute('aria-label')).toContain(', contested');
    expect(noteOf(view, button)?.textContent).toContain('Is that really the cause?');

    view.update(runOf(c, CONTESTED));
    expect(tags()).toBe(1);

    view.update(runOf(c, ACCEPTED));
    expect(itemOf(view, c.target)).toBe(item);
    expect(buttonOf(item)).toBe(button);
    expect(item.classList.contains('is-contested')).toBe(false);
    expect(tags()).toBe(0);
    expect(button.getAttribute('aria-label') ?? '').not.toContain('contested');
    expect(noteOf(view, button)).toBeNull();
  });
});

describe('destroy', () => {
  const observers: StubObserver[] = [];
  class StubObserver {
    observed: Element[] = [];
    disconnected = false;
    constructor(public callback: ResizeObserverCallback) {
      observers.push(this);
    }
    observe(el: Element) {
      this.observed.push(el);
    }
    unobserve() {}
    disconnect() {
      this.disconnected = true;
    }
  }

  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal('ResizeObserver', StubObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  const WATCHED = ['problem tree', 'causal map', 'radial tree', 'intent statement', 'analogical reasoning', 'solution tree', 'duncker', 'contradiction'];

  it.each(CASES.filter((c) => WATCHED.includes(c.name)))('$name: disconnects every size watch it started', (c) => {
    const view = c.make();
    view.update(runOf(c, CONTESTED));
    expect(observers.length).toBeGreaterThan(0);
    expect(observers.some((o) => o.observed.length > 0)).toBe(true);
    expect(view.destroy).toBeTypeOf('function');
    view.destroy!();
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });

  it.each(['force field arrow', 'gap radar', 'causal map', 'radial tree'])('%s: cancels a running frame loop', (name) => {
    const c = CASES.find((x) => x.name === name)!;
    // Let motion run: element animation exists, and every frame request stays pending.
    const fake = { cancel: vi.fn(), finished: Promise.resolve(), onfinish: null };
    const proto = Element.prototype as Element & { animate?: unknown };
    const had = Object.prototype.hasOwnProperty.call(proto, 'animate');
    const before = proto.animate;
    proto.animate = vi.fn(() => fake);
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
    vi.stubGlobal('cancelAnimationFrame', cancel);
    try {
      const view = c.make();
      view.update(runOf(c, ACCEPTED));
      if (name === 'gap radar') view.update({ ...runOf(c, ACCEPTED), nodes: [...runOf(c, ACCEPTED).nodes, node('x1', 'axis:1'), node('x2', 'axis:2'), node('x3', 'axis:3')], radar: { snapshots: [{ at: 'now', current: [1, 2, 3], objective: [3, 4, 5] }] } });
      if (name === 'force field arrow') view.update({ ...runOf(c, ACCEPTED), scores: { snapshots: [{ at: 'now', for: [3], against: [] }] } } as PsToolRun);
      expect(requestAnimationFrame).toHaveBeenCalled();
      view.destroy!();
      expect(cancel).toHaveBeenCalledWith(42);
    } finally {
      if (had) proto.animate = before;
      else delete proto.animate;
    }
  });

  it('cancels animations still running inside the view', () => {
    const c = CASES.find((x) => x.name === 'intent statement')!;
    const view = c.make();
    view.update(runOf(c, ACCEPTED));
    const cancel = vi.fn();
    (view.el as HTMLElement & { getAnimations: unknown }).getAnimations = () => [{ cancel }, { cancel }];
    view.destroy!();
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
