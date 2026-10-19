import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProblemReductionView } from '../../../../packages/problem-solver/render/problem-reduction';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'problem_reduction', status: 'active', nodes, edges, ...extra });
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;

const problem = node('p', 'problem');
const subs = [node('s1', 'sub:1'), node('s2', 'sub:2'), node('s3', 'sub:3')];
const priority = node('o', 'priority', { text: '2, 3, 1', title: 'Impact first' });
const solutions = [node('v1', 'solution:1'), node('v2', 'solution:2'), node('v3', 'solution:3')];
const integrated = node('w', 'integrated');

describe('Problem reduction view', () => {
  it('renders no circles and no chart for an empty run', () => {
    const view = createProblemReductionView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-reduce__chart')).toBeNull();
    expect(view.el.querySelector('.ps-reduce__chevron')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Problem reduction');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createProblemReductionView();
    view.update(run([problem, ...subs]));
    const sub = view.el.querySelector('[data-node="s2"]');
    const circle = button(view, 's2');
    const chart = view.el.querySelector('.ps-reduce__chart');
    view.update(run([problem, ...subs, priority, ...solutions, integrated]));
    expect(view.el.querySelector('[data-node="s2"]')).toBe(sub);
    expect(button(view, 's2')).toBe(circle);
    expect(view.el.querySelector('.ps-reduce__chart')).toBe(chart);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createProblemReductionView();
    view.update(run([problem, node('s1', 'sub:1', { state: 'contested', objection: 'Is this two parts in one?' }), subs[1]]));
    const item = view.el.querySelector('[data-node="s1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(view.el.querySelector('[data-node="s2"]')!.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is this two parts in one?');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Is this two parts in one?');
  });

  it('opens one details card at a time', () => {
    const view = createProblemReductionView();
    view.update(run([problem, ...subs, priority]));
    button(view, 'p').click();
    expect(view.el.querySelector('[data-node="p"]')!.classList.contains('is-open')).toBe(true);
    button(view, 'o').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['o']);
    expect(button(view, 'p').getAttribute('aria-expanded')).toBe('false');
    expect(button(view, 'o').getAttribute('aria-expanded')).toBe('true');
    const card = view.el.querySelector(`#${button(view, 'o').getAttribute('aria-controls')}`)!;
    expect(card.classList.contains('is-open')).toBe(true);
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
  });

  it('shows the short title in the circle and the full answer only in details', () => {
    const view = createProblemReductionView();
    view.update(run([node('p', 'problem', { title: 'Slow repairs', text: 'Tenants wait weeks for small repairs to be booked.' })]));
    expect(view.el.querySelector('[data-node="p"] .ps-reduce__title')!.textContent).toBe('Slow repairs');
    expect(button(view, 'p').textContent).not.toContain('wait weeks');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('wait weeks'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('renders the sub-problems in the subs region', () => {
    const view = createProblemReductionView();
    view.update(run([problem, ...subs]));
    // Each sub sits in its own subs holder inside its lane, so the phone's tab order runs
    // sub, solution, next sub; the holders together make the subs region.
    const holders = [...view.el.querySelectorAll('[data-region="subs"]')];
    expect(holders.every((holder) => holder.getAttribute('aria-label'))).toBe(true);
    expect([...view.el.querySelectorAll('[data-region="subs"] [data-node]')].map((el) => el.getAttribute('data-node'))).toEqual(['s1', 's2', 's3']);
    expect(view.el.querySelector('[data-region="problem"] [data-node="p"]')).not.toBeNull();
    expect(view.el.querySelector('[data-region="solutions"] [data-node]')).toBeNull();
  });

  it('ranks and re-orders the sub-problems once the priority exists', () => {
    const view = createProblemReductionView();
    view.update(run([problem, ...subs]));
    expect(view.el.querySelector('[data-rank]')).toBeNull();
    expect(view.el.querySelector('[data-node="o"]')).toBeNull();
    view.update(run([problem, ...subs, priority, ...solutions]));
    const ranked = [...view.el.querySelectorAll('[data-rank]')];
    expect(ranked.map((el) => el.getAttribute('data-node'))).toEqual(['s2', 's3', 's1']);
    expect(ranked.map((el) => el.getAttribute('data-rank'))).toEqual(['1', '2', '3']);
    expect(ranked.map((el) => el.querySelector('.ps-reduce__rank')!.textContent)).toEqual(['1st', '2nd', '3rd']);
    // The DOM order of both rows follows the priority, so reading and tab order do too.
    const order = (region: string) => [...view.el.querySelectorAll(`[data-region="${region}"] [data-node]`)].map((el) => el.getAttribute('data-row'));
    expect(order('subs')).toEqual(['2', '3', '1']);
    expect(order('solutions')).toEqual(['2', '3', '1']);
    // The priority's details button sits before the subs.
    const prio = view.el.querySelector('[data-node="o"]')!;
    expect(prio.compareDocumentPosition(view.el.querySelector('[data-region="subs"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts each solution in the same row as its sub-problem', () => {
    const view = createProblemReductionView();
    view.update(run([problem, ...subs, priority, solutions[2], solutions[0]]));
    for (const i of [1, 3]) {
      const sub = view.el.querySelector(`[data-node="s${i}"]`) as HTMLElement;
      const sol = view.el.querySelector(`[data-node="v${i}"]`) as HTMLElement;
      expect(sol.getAttribute('data-row')).toBe(sub.getAttribute('data-row'));
      expect(sol.getAttribute('data-row')).toBe(String(i));
      expect(sol.style.getPropertyValue('--pos')).toBe(sub.style.getPropertyValue('--pos'));
    }
    // Chevrons join a sub to its solution only when both ends exist.
    expect(view.el.querySelector('.ps-reduce__chevron[data-to="v1"]')).not.toBeNull();
    expect(view.el.querySelector('.ps-reduce__chevron[data-to="v2"]')).toBeNull();
  });

  it('shows the integrated circle only with the integrated node', () => {
    const view = createProblemReductionView();
    view.update(run([problem, ...subs, priority, ...solutions]));
    expect(view.el.querySelector('[data-region="integrated"]')).toBeNull();
    expect(view.el.querySelector('.ps-reduce__chevron--out')).toBeNull();
    view.update(run([problem, ...subs, priority, ...solutions, integrated]));
    expect(view.el.querySelector('[data-region="integrated"] [data-node="w"]')).not.toBeNull();
    expect(view.el.querySelectorAll('.ps-reduce__chevron--out').length).toBe(3);
  });

  it('orders the DOM lane by lane: sub, then its solution, then the next sub', () => {
    const view = createProblemReductionView();
    view.update(run([problem, ...subs, priority, ...solutions]));
    const order = [...view.el.querySelectorAll('.ps-reduce__item--sub, .ps-reduce__item--solution')].map((el) => el.getAttribute('data-node'));
    expect(order).toEqual(['s2', 'v2', 's3', 'v3', 's1', 'v1']);
  });

  describe('FLIP', () => {
    // happy-dom has no Web Animations, so the fake is added for these tests and removed after.
    const proto = HTMLElement.prototype as unknown as { animate?: unknown };
    afterEach(() => {
      vi.restoreAllMocks();
      delete proto.animate;
    });

    /** Fake geometry: each lane element sits 60px lower once the Order pill is in the chart. */
    function fakeMotion() {
      const made: Array<{ el: Element; keyframes: Keyframe[]; cancel: ReturnType<typeof vi.fn> }> = [];
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const top = this.closest('.ps-reduce__chart')?.querySelector('.ps-reduce__item--priority') ? 60 : 0;
        return { left: 0, top, width: 100, height: 100, right: 100, bottom: top + 100, x: 0, y: top, toJSON() {} } as DOMRect;
      });
      proto.animate = () => null;
      vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(function (this: HTMLElement, keyframes) {
        const fake = { el: this, keyframes: keyframes as Keyframe[], cancel: vi.fn(), onfinish: null };
        made.push(fake);
        return fake as unknown as Animation;
      });
      return made;
    }

    it('moves the lanes when a priority that keeps the order pushes them down', () => {
      const made = fakeMotion();
      const view = createProblemReductionView();
      view.update(run([problem, ...subs]));
      made.length = 0;
      view.update(run([problem, ...subs, node('o', 'priority', { text: '1, 2, 3' })]));
      const flips = made.filter((a) => String(a.keyframes[0]?.transform ?? '').startsWith('translate('));
      expect(flips.map((a) => (a.el as HTMLElement).getAttribute('data-node') ?? a.el.className)).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
      expect(flips.every((a) => a.keyframes[0].transform === 'translate(0px, -60px)')).toBe(true);
    });

    it('cancels every in-flight flip before the next update writes', () => {
      const made = fakeMotion();
      const view = createProblemReductionView();
      view.update(run([problem, ...subs]));
      view.update(run([problem, ...subs, priority]));
      const flips = made.filter((a) => String(a.keyframes[0]?.transform ?? '').startsWith('translate('));
      expect(flips.length).toBeGreaterThan(0);
      view.update(run([problem, ...subs, priority, ...solutions]));
      expect(flips.every((a) => a.cancel.mock.calls.length === 1)).toBe(true);
    });
  });
});
