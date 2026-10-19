import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDecisionMatrixView } from '../../../../packages/problem-solver/render/decision-matrix';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
type Snap = { at: string; mode: 'percent' | 'rank'; weights: number[]; ratings: number[][] };
const snap = (mode: Snap['mode'], weights: number[], ratings: number[][], at = 'a'): Snap => ({ at, mode, weights, ratings });
const matrix = (nodes: PsNode[], snapshots: Snap[] = []) => run('decision_matrix', nodes, [], snapshots.length ? { scores: { snapshots } } : {});

const two = [node('c1', 'criterion:1'), node('c2', 'criterion:2'), node('o1', 'option:1'), node('o2', 'option:2')];
/** The tool test's sample: percent 60/40, ratings [[8, 5], [6, 9]] → totals 6.8 and 7.2. */
const SAMPLE = snap('percent', [60, 40], [[8, 5], [6, 9]], 't1');
const item = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const button = (view: { el: HTMLElement }, id: string) => item(view, id).querySelector<HTMLButtonElement>('button')!;
const totals = (view: { el: HTMLElement }) => [...view.el.querySelectorAll('[data-total] .ps-matrix__total-value')].map((el) => el.textContent);
const cell = (view: { el: HTMLElement }, opt: string, crit: string, kind: 'rating' | 'score') => item(view, opt).querySelector(`[data-cell="${kind}"][data-for="${crit}"]`)!;

// happy-dom has no Web Animations: a fake is installed for the motion tests and removed after.
const proto = HTMLElement.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete proto.animate;
});
function spyAnimate() {
  proto.animate = () => null;
  return vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
}

describe('Decision matrix view', () => {
  // Baseline 1-8.
  it('renders nothing for an empty run', () => {
    const view = createDecisionMatrixView();
    view.update(matrix([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-matrix__grid')).toBeNull();
    expect(view.el.querySelector('.ps-matrix__dome')).toBeNull();
    expect(view.el.querySelector('.ps-matrix__score')).toBeNull();
  });

  it('keeps element identity across updates', () => {
    const view = createDecisionMatrixView();
    view.update(matrix([node('c1', 'criterion:1'), node('o1', 'option:1')]));
    const row = item(view, 'c1');
    const col = item(view, 'o1');
    view.update(matrix(two));
    expect(item(view, 'c1')).toBe(row);
    expect(item(view, 'o1')).toBe(col);
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createDecisionMatrixView();
    view.update(matrix([node('c1', 'criterion:1', { state: 'contested', objection: 'Can that be measured?' }), node('o1', 'option:1')]));
    const row = item(view, 'c1');
    expect(row.classList.contains('is-contested')).toBe(true);
    expect(row.querySelector('.ps-objection')!.getAttribute('title')).toBe('Can that be measured?');
    expect(button(view, 'c1').getAttribute('aria-label')).toContain(', contested');
    button(view, 'c1').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Can that be measured?');
    // Addendum 11: an existing node's state change updates the tag and label.
    view.update(matrix([node('c1', 'criterion:1'), node('o1', 'option:1', { state: 'contested', objection: 'Is that really open?' })]));
    expect(row.classList.contains('is-contested')).toBe(false);
    expect(row.querySelector('.ps-objection')).toBeNull();
    expect(button(view, 'c1').getAttribute('aria-label')).not.toContain('contested');
    expect(item(view, 'o1').querySelector('.ps-matrix__head .ps-objection')).not.toBeNull();
    expect(button(view, 'o1').getAttribute('aria-label')).toContain(', contested');
  });

  it('opens one details card at a time', () => {
    const view = createDecisionMatrixView();
    view.update(matrix(two));
    button(view, 'c1').click();
    button(view, 'o2').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button(view, 'o2').getAttribute('aria-expanded')).toBe('true');
    expect(button(view, 'c1').getAttribute('aria-expanded')).toBe('false');
    expect(view.el.querySelector(`#${button(view, 'o2').getAttribute('aria-controls')}`)!.classList.contains('is-open')).toBe(true);
  });

  it('shows titles in the shapes and the full answer only in the details', () => {
    const view = createDecisionMatrixView();
    view.update(matrix([node('c1', 'criterion:1', { title: 'Weekly cost' }), node('o1', 'option:1', { title: 'Scout hut' })]));
    expect(item(view, 'c1').querySelector('.ps-matrix__title')!.textContent).toBe('Weekly cost');
    expect(item(view, 'o1').querySelector('.ps-matrix__head .ps-matrix__title')!.textContent).toBe('Scout hut');
    for (const shape of view.el.querySelectorAll('[data-node] button')) expect(shape.textContent).not.toContain('answer text');
    expect([...view.el.querySelectorAll('.ps-details')].some((card) => card.textContent!.includes('criterion:1 answer text'))).toBe(true);
  });

  it('starts no animation on a second identical update', () => {
    const animate = spyAnimate();
    const view = createDecisionMatrixView();
    view.update(matrix([]));
    view.update(matrix([...two, node('ch', 'choice')], [SAMPLE]));
    expect(animate).toHaveBeenCalled();
    animate.mockClear();
    view.update(matrix([...two, node('ch', 'choice')], [SAMPLE]));
    expect(animate).not.toHaveBeenCalled();
  });

  it('draws a saved run still: no animation and no count-up on the first update', () => {
    const animate = spyAnimate();
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    const view = createDecisionMatrixView();
    view.update(matrix([...two, node('ch', 'choice')], [SAMPLE]));
    expect(animate).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
    expect(totals(view)).toEqual(['6.8', '7.2']);
  });

  it('removes every element that carries a removed node id', () => {
    const view = createDecisionMatrixView();
    view.update(matrix([...two, node('o3', 'option:3'), node('c3', 'criterion:3'), node('ch', 'choice')], [snap('percent', [50, 30, 20], [[8, 5, 4], [6, 9, 3], [5, 5, 5]])]));
    for (const id of ['o3', 'c3', 'ch']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(matrix(two, [SAMPLE]));
    for (const id of ['o3', 'c3', 'ch']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
  });

  // Tool-specific.
  it('renders criteria as [data-row] and options as [data-option], in slot order', () => {
    const view = createDecisionMatrixView();
    view.update(matrix([node('o2', 'option:2'), node('c2', 'criterion:2'), node('o1', 'option:1'), node('c1', 'criterion:1')]));
    const rows = [...view.el.querySelectorAll<HTMLElement>('[data-row]')];
    expect(rows.map((r) => [r.dataset.node, r.dataset.row])).toEqual([['c1', '1'], ['c2', '2']]);
    const cols = [...view.el.querySelectorAll<HTMLElement>('[data-option]')];
    expect(cols.map((c) => [c.dataset.node, c.dataset.option])).toEqual([['o1', '1'], ['o2', '2']]);
    // Criteria carry letter codes, options numbers, as in the book.
    expect(rows.map((r) => r.querySelector('.ps-matrix__code')!.textContent)).toEqual(['A', 'B']);
    expect(cols.map((c) => c.querySelector('.ps-matrix__meta')!.textContent)).toEqual(['Option 1', 'Option 2']);
  });

  it('draws the frame with the first criterion or option, each row with its tab', () => {
    const view = createDecisionMatrixView();
    view.update(matrix([node('o1', 'option:1')]));
    expect(view.el.querySelectorAll('.ps-matrix__dome').length).toBe(2);
    expect(view.el.querySelector('.ps-matrix__band--criteria')!.textContent).toBe('Criteria');
    expect(item(view, 'o1').querySelectorAll('.ps-matrix__band').length).toBe(2);
    view.update(matrix([node('c1', 'criterion:1'), node('o1', 'option:1')]));
    expect(item(view, 'c1').querySelector('.ps-matrix__row-tab')).not.toBeNull();
    expect(cell(view, 'o1', 'c1', 'rating')).not.toBeNull();
  });

  it('shows dashes and no totals before scoring', () => {
    const view = createDecisionMatrixView();
    view.update(matrix(two));
    expect(view.el.querySelector('[data-total]')).toBeNull();
    for (const value of view.el.querySelectorAll('.ps-matrix__value')) expect(value.textContent).toBe('');
    expect(view.el.querySelector('.is-leading')).toBeNull();
  });

  it('fills weights, ratings, scores and totals from the snapshot, and lifts the leader', () => {
    const view = createDecisionMatrixView();
    view.update(matrix(two, [SAMPLE]));
    expect(totals(view)).toEqual(['6.8', '7.2']);
    expect(item(view, 'o2').classList.contains('is-leading')).toBe(true);
    expect(item(view, 'o1').classList.contains('is-leading')).toBe(false);
    expect(item(view, 'c1').querySelector('.ps-matrix__cell--weight')!.textContent).toBe('60%');
    expect(cell(view, 'o1', 'c1', 'rating').textContent).toBe('8');
    expect(cell(view, 'o1', 'c1', 'score').textContent).toBe('4.8');
    expect(cell(view, 'o2', 'c2', 'score').textContent).toBe('3.6');
    expect(view.el.querySelector('.ps-matrix__note')!.textContent).toBe('');
  });

  it('shows ranks and raw sums in rank mode, and a tie lifts no column and says so', () => {
    const view = createDecisionMatrixView();
    view.update(matrix(two, [snap('rank', [1, 2], [[8, 5], [6, 6]])]));
    expect(item(view, 'c2').querySelector('.ps-matrix__cell--weight')!.textContent).toBe('Rank 2');
    expect(cell(view, 'o1', 'c2', 'score').textContent).toBe('10.0');
    expect(totals(view)).toEqual(['18', '18']);
    expect(view.el.querySelector('.is-leading')).toBeNull();
    expect(view.el.querySelector('.ps-matrix__note')!.textContent).toBe('Tied at the top');
  });

  it('keeps rows, columns and totals identical across a second snapshot', () => {
    const view = createDecisionMatrixView();
    view.update(matrix(two, [SAMPLE]));
    const before = ['c1', 'c2', 'o1', 'o2'].map((id) => item(view, id));
    const tags = [...view.el.querySelectorAll('[data-total]')];
    view.update(matrix(two, [SAMPLE, snap('percent', [30, 70], [[8, 5], [6, 9]], 't2')]));
    expect(['c1', 'c2', 'o1', 'o2'].map((id) => item(view, id))).toEqual(before);
    ['c1', 'c2', 'o1', 'o2'].forEach((id, i) => expect(item(view, id)).toBe(before[i]));
    [...view.el.querySelectorAll('[data-total]')].forEach((tag, i) => expect(tag).toBe(tags[i]));
    expect(totals(view)).toEqual(['5.9', '8.1']);
  });

  it('counts the totals up from the last snapshot only after the first paint', () => {
    spyAnimate();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const view = createDecisionMatrixView();
    view.update(matrix(two, [SAMPLE]));
    expect(frames.length).toBe(0);
    view.update(matrix(two, [SAMPLE, snap('percent', [30, 70], [[8, 5], [6, 9]], 't2')]));
    expect(frames.length).toBe(1);
    const t0 = performance.now();
    frames.shift()!(t0 + 300);
    const mid = totals(view).map(Number);
    expect(mid[0]).toBeLessThan(6.8);
    expect(mid[0]).toBeGreaterThan(5.9);
    frames.shift()!(t0 + 10_000);
    expect(totals(view)).toEqual(['5.9', '8.1']);
  });

  it('treats a snapshot that no longer covers the matrix as unscored', () => {
    const view = createDecisionMatrixView();
    view.update(matrix(two, [SAMPLE]));
    view.update(matrix([...two, node('c3', 'criterion:3')], [SAMPLE]));
    expect(view.el.querySelector('[data-total]')).toBeNull();
    expect(cell(view, 'o1', 'c1', 'rating').textContent).toBe('');
  });

  describe('score form', () => {
    const open = (view: ReturnType<typeof createDecisionMatrixView>) => {
      view.el.querySelector<HTMLButtonElement>('.ps-matrix__score')!.click();
      return view.el.querySelector<HTMLFormElement>('.ps-matrix__form')!;
    };
    const input = (form: HTMLElement, label: string) => form.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    const type = (el: HTMLInputElement, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    it('appears once there are two criteria and two options', () => {
      const view = createDecisionMatrixView();
      view.update(matrix([node('c1', 'criterion:1'), node('o1', 'option:1'), node('o2', 'option:2')]));
      expect(view.el.querySelector('.ps-matrix__score')).toBeNull();
      view.update(matrix(two));
      expect(view.el.querySelector('.ps-matrix__score')!.textContent).toBe('Score the options');
    });

    it('disables Save with the message while percent weights add up to 90, and submits a valid form in slot order', () => {
      const view = createDecisionMatrixView();
      const got: unknown[] = [];
      view.onScore((scores) => got.push(scores));
      view.update(matrix(two));
      const form = open(view);
      expect(form.hidden).toBe(false);
      const save = form.querySelector<HTMLButtonElement>('.ps-matrix__save')!;
      type(input(form, 'Weight for Criterion:1 title'), '50');
      type(input(form, 'Weight for Criterion:2 title'), '40');
      ['Option:1 title', 'Option:2 title'].forEach((opt, j) =>
        ['Criterion:1 title', 'Criterion:2 title'].forEach((crit, i) => type(input(form, `Rating for ${opt} on ${crit}`), String([[8, 5], [6, 9]][j][i])))
      );
      expect(form.querySelector('.ps-matrix__sum')!.textContent).toBe('Adds up to 90 of 100');
      expect(save.disabled).toBe(true);
      expect(form.querySelector('.ps-matrix__message')!.textContent).toBe('Percentage weights must add up to 100.');
      type(input(form, 'Weight for Criterion:2 title'), '50');
      expect(save.disabled).toBe(false);
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(got).toEqual([{ mode: 'percent', weights: [50, 50], ratings: [[8, 5], [6, 9]] }]);
      expect(form.hidden).toBe(true);
    });

    it('switches to ranks with its own hint, and refills from the latest snapshot when reopened', () => {
      const view = createDecisionMatrixView();
      view.update(matrix(two, [SAMPLE, snap('rank', [2, 1], [[3, 4], [5, 6]], 'b')]));
      const form = open(view);
      expect(form.querySelector<HTMLInputElement>('input[value="rank"]')!.checked).toBe(true);
      expect(form.querySelector('.ps-matrix__sum')!.textContent).toBe('Use 1 to 2 once each');
      expect(input(form, 'Weight for Criterion:1 title').value).toBe('2');
      expect(input(form, 'Rating for Option:2 title on Criterion:2 title').value).toBe('6');
      const percent = form.querySelector<HTMLInputElement>('input[value="percent"]')!;
      percent.checked = true;
      percent.dispatchEvent(new Event('change', { bubbles: true }));
      expect(form.querySelector('.ps-matrix__sum')!.textContent).toBe('Adds up to 3 of 100');
    });

    it('closes on Escape first, and stops the key there', () => {
      const view = createDecisionMatrixView();
      view.update(matrix(two));
      const form = open(view);
      const outer = vi.fn();
      view.el.addEventListener('keydown', outer);
      input(form, 'Weight for Criterion:1 title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(form.hidden).toBe(true);
      expect(outer).not.toHaveBeenCalled();
    });

    it('rebuilds an open form when a criterion arrives, keeping what was typed', () => {
      const view = createDecisionMatrixView();
      view.update(matrix(two));
      const form = open(view);
      type(input(form, 'Weight for Criterion:1 title'), '70');
      view.update(matrix([...two, node('c3', 'criterion:3')]));
      expect(input(form, 'Weight for Criterion:1 title').value).toBe('70');
      expect(input(form, 'Weight for Criterion:3 title')).not.toBeNull();
    });
  });

  describe('phone', () => {
    it('layout(360) shows one option at a time with tabs, and tab 2 shows option 2', () => {
      const view = createDecisionMatrixView();
      view.update(matrix(two, [SAMPLE]));
      view.layout(360);
      expect(view.el.getAttribute('data-compact')).toBe('true');
      const tabs = [...view.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      expect(view.el.querySelector<HTMLElement>('.ps-matrix__tabs')!.hidden).toBe(false);
      expect(tabs.map((t) => t.querySelector('.ps-matrix__tab-code')!.textContent)).toEqual(['1', '2']);
      // The leader shows first after a snapshot; picking tab 1 then tab 2 follows the person.
      expect(item(view, 'o2').hidden).toBe(false);
      tabs[0].click();
      expect(item(view, 'o1').hidden).toBe(false);
      expect(item(view, 'o2').hidden).toBe(true);
      tabs[1].click();
      expect(item(view, 'o2').hidden).toBe(false);
      expect(item(view, 'o1').hidden).toBe(true);
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
      expect(cell(view, 'o2', 'c1', 'rating').textContent).toBe('6');
      // The strip lists every option with its total.
      const strip = [...view.el.querySelectorAll('.ps-matrix__strip-item')].map((el) => el.textContent);
      expect(strip).toEqual(['1Option:1 title6.8', '2Option:2 title7.2']);
      view.layout(900);
      expect(view.el.getAttribute('data-compact')).toBe('false');
      expect(item(view, 'o1').hidden).toBe(false);
      expect(view.el.querySelector<HTMLElement>('.ps-matrix__tabs')!.hidden).toBe(true);
    });

    it('follows the leader after a new snapshot only until the person picks a tab', () => {
      const view = createDecisionMatrixView();
      view.layout(360);
      view.update(matrix(two, [SAMPLE]));
      expect(item(view, 'o2').hidden).toBe(false);
      view.update(matrix(two, [SAMPLE, snap('percent', [90, 10], [[8, 5], [6, 9]], 'b')]));
      expect(item(view, 'o1').hidden).toBe(false);
      view.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
      view.update(matrix(two, [SAMPLE, snap('percent', [90, 10], [[8, 5], [6, 9]], 'b'), snap('percent', [80, 20], [[8, 5], [6, 9]], 'c')]));
      expect(item(view, 'o2').hidden).toBe(false);
    });

    it('closes an open option card when its column is hidden by a tab change', () => {
      const view = createDecisionMatrixView();
      view.update(matrix(two));
      view.layout(360);
      button(view, 'o1').click();
      expect(view.el.querySelector('.ps-details.is-open')).not.toBeNull();
      view.el.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
      expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
    });

    it('removing an option removes its column, tab and total', () => {
      const view = createDecisionMatrixView();
      const three = [...two, node('o3', 'option:3')];
      view.update(matrix(three, [snap('percent', [60, 40], [[8, 5], [6, 9], [5, 5]])]));
      view.layout(360);
      expect(view.el.querySelectorAll('[role="tab"]').length).toBe(3);
      expect(view.el.querySelectorAll('[data-total]').length).toBe(3);
      view.update(matrix(two, [SAMPLE]));
      expect(view.el.querySelector('[data-node="o3"]')).toBeNull();
      expect(view.el.querySelectorAll('[role="tab"]').length).toBe(2);
      expect(view.el.querySelectorAll('[data-total]').length).toBe(2);
      expect(view.el.querySelectorAll('[data-for="o3"]').length).toBe(0);
    });
  });

  describe('chosen option', () => {
    it('is absent until the choice exists, then shows its full text; removing the node removes the card', () => {
      const view = createDecisionMatrixView();
      view.update(matrix(two, [SAMPLE]));
      expect(view.el.querySelector('[data-choice]')).toBeNull();
      view.update(matrix([...two, node('ch', 'choice', { text: 'Take option two, the scout hut, on Thursdays.', state: 'contested', objection: 'Is Thursday free?' })], [SAMPLE]));
      const card = view.el.querySelector<HTMLElement>('[data-choice]')!;
      expect(card.getAttribute('data-node')).toBe('ch');
      expect(card.querySelector('.ps-choice__text')!.textContent).toBe('Take option two, the scout hut, on Thursdays.');
      expect(card.querySelector('.ps-objection')).not.toBeNull();
      card.querySelector<HTMLButtonElement>('.ps-choice__more')!.click();
      expect(card.classList.contains('is-open')).toBe(true);
      view.update(matrix(two, [SAMPLE]));
      expect(view.el.querySelector('[data-choice]')).toBeNull();
    });
  });

  it('stops listening after destroy: a resize does nothing', () => {
    let fire: (() => void) | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          fire = cb;
        }
        observe = observe;
        disconnect = disconnect;
      }
    );
    const view = createDecisionMatrixView();
    view.update(matrix(two));
    vi.spyOn(view.el, 'getBoundingClientRect').mockReturnValue({ width: 360 } as DOMRect);
    view.destroy();
    expect(disconnect).toHaveBeenCalled();
    expect(fire).not.toBeNull();
    (fire as unknown as () => void)();
    expect(view.el.getAttribute('data-compact')).toBe('false');
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* Decision matrix');
    const end = css.indexOf('/* Chosen option');
    const section = css.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(section).toContain('container: matrix / inline-size');
    expect(section).toContain('@container matrix (');
    expect(section).not.toMatch(/@container \(/);
  });
});
