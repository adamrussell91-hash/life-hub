import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axisTop, createParetoView, formatTick } from '../../../../packages/problem-solver/render/pareto';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
type Snap = { at: string; counts: number[] };
const snap = (counts: number[], at = 'a'): Snap => ({ at, counts });
const chart = (nodes: PsNode[], snapshots: Snap[] = []) => run('pareto', nodes, [], snapshots.length ? { scores: { snapshots } } : {});

const four = [node('t', 'target'), node('i1', 'item:1'), node('i2', 'item:2'), node('i3', 'item:3'), node('i4', 'item:4')];
/** The tool test's sample: figures 10, 45, 30, 15 → ranked item:2, item:3, item:4, item:1; vital 90%. */
const SAMPLE = snap([10, 45, 30, 15], 't1');
const item = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLElement>(`[data-node="${id}"]`)!;
const fill = (view: { el: HTMLElement }, id: string) => item(view, id).querySelector<HTMLButtonElement>('.ps-pareto__fill')!;
const barsInOrder = (view: { el: HTMLElement }) => [...view.el.querySelectorAll<HTMLElement>('.ps-pareto__bar')];

// happy-dom has no Web Animations: a fake is installed for the motion tests and removed after.
const proto = HTMLElement.prototype as unknown as { animate?: unknown };
const svgProto = SVGElement.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete proto.animate;
  delete svgProto.animate;
});
function spyAnimate() {
  const fake = () => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation;
  proto.animate = fake;
  svgProto.animate = fake;
  const html = vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(fake);
  const svg = vi.spyOn(SVGElement.prototype as unknown as { animate: () => Animation }, 'animate').mockImplementation(fake);
  return { calls: () => html.mock.calls.length + svg.mock.calls.length, clear: () => (html.mockClear(), svg.mockClear()) };
}

describe('Pareto view', () => {
  // Baseline 1-8.
  it('renders nothing for an empty run', () => {
    const view = createParetoView();
    view.update(chart([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-pareto__field')).toBeNull();
    expect(view.el.querySelector('.ps-pareto__data')).toBeNull();
  });

  it('keeps element identity across updates', () => {
    const view = createParetoView();
    view.update(chart(four.slice(0, 3)));
    const bar = item(view, 'i1');
    const target = item(view, 't');
    view.update(chart(four));
    expect(item(view, 'i1')).toBe(bar);
    expect(item(view, 't')).toBe(target);
  });

  it('marks a contested node and carries the objection, and follows a later change of state', () => {
    const view = createParetoView();
    view.update(chart([node('t', 'target'), node('i1', 'item:1', { state: 'contested', objection: 'Is that at the same level?' })]));
    const bar = item(view, 'i1');
    const key = view.el.querySelector<HTMLElement>('.ps-pareto__key-row[data-for="i1"]')!;
    expect(bar.classList.contains('is-contested')).toBe(true);
    expect(key.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that at the same level?');
    expect(fill(view, 'i1').getAttribute('aria-label')).toContain(', contested');
    fill(view, 'i1').click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Is that at the same level?');
    // Addendum 11: an existing node's state change updates the tag and label.
    view.update(chart([node('t', 'target', { state: 'contested', objection: 'Over what period?' }), node('i1', 'item:1')]));
    expect(bar.classList.contains('is-contested')).toBe(false);
    expect(key.querySelector('.ps-objection')).toBeNull();
    expect(fill(view, 'i1').getAttribute('aria-label')).not.toContain('contested');
    expect(item(view, 't').querySelector('.ps-objection')).not.toBeNull();
  });

  it('opens one details card at a time', () => {
    const view = createParetoView();
    view.update(chart(four));
    fill(view, 'i1').click();
    fill(view, 'i2').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(fill(view, 'i2').getAttribute('aria-expanded')).toBe('true');
    expect(fill(view, 'i1').getAttribute('aria-expanded')).toBe('false');
    // The key row mirrors its bar.
    expect(view.el.querySelector('.ps-pareto__key-row[data-for="i2"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows titles in the key and the full answer only in the details', () => {
    const view = createParetoView();
    view.update(chart([node('t', 'target'), node('i1', 'item:1', { title: 'Long queue' })]));
    expect(view.el.querySelector('.ps-pareto__key-row[data-for="i1"] .ps-pareto__key-title')!.textContent).toBe('Long queue');
    for (const shape of view.el.querySelectorAll('.ps-pareto__fill, .ps-pareto__key-row')) expect(shape.textContent).not.toContain('answer text');
    expect([...view.el.querySelectorAll('.ps-details')].some((card) => card.textContent!.includes('item:1 answer text'))).toBe(true);
  });

  it('starts no animation on a second identical update', () => {
    const animate = spyAnimate();
    const view = createParetoView();
    view.update(chart([]));
    view.update(chart([...four, node('ch', 'choice')], [SAMPLE]));
    expect(animate.calls()).toBeGreaterThan(0);
    animate.clear();
    view.update(chart([...four, node('ch', 'choice')], [SAMPLE]));
    expect(animate.calls()).toBe(0);
  });

  it('draws a saved run still: no animation on the first update', () => {
    const animate = spyAnimate();
    const view = createParetoView();
    view.update(chart([...four, node('ch', 'choice')], [SAMPLE]));
    expect(animate.calls()).toBe(0);
    expect(view.el.querySelector('[data-summary]')).not.toBeNull();
  });

  it('removes every element that carries a removed node id', () => {
    const view = createParetoView();
    const five = [...four, node('i5', 'item:5'), node('ch', 'choice')];
    view.update(chart(five, [snap([10, 45, 30, 15, 5])]));
    for (const id of ['i5', 'ch', 't']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"]`).length).toBeGreaterThan(0);
    view.update(chart(four.filter((n) => n.id !== 't'), [SAMPLE]));
    for (const id of ['i5', 'ch', 't']) expect(view.el.querySelectorAll(`[data-node="${id}"], [data-for="${id}"], [data-edge*="${id}"]`).length).toBe(0);
  });

  // Tool-specific.
  it('before data: bars at zero in slot order, the key list and the waiting note', () => {
    const view = createParetoView();
    view.update(chart(four));
    const bars = barsInOrder(view);
    expect(bars.map((b) => b.dataset.node)).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(bars.every((b) => Number(b.dataset.barHeight) === 0)).toBe(true);
    expect(view.el.querySelectorAll('.ps-pareto__key-row').length).toBe(4);
    expect([...view.el.querySelectorAll('.ps-pareto__code')].map((c) => c.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(view.el.querySelector('.ps-pareto__note')!.textContent).toBe('Waiting for the figures');
    expect(view.el.querySelector('[data-cut]')).toBeNull();
    expect(view.el.querySelector('.ps-pareto__dot')).toBeNull();
    expect(view.el.querySelector('[data-summary]')).toBeNull();
  });

  it('shows the target as a card above the chart, with its full text', () => {
    const view = createParetoView();
    view.update(chart([node('t', 'target', { text: 'Late returns, counted over the spring term.' })]));
    const card = item(view, 't');
    expect(card.querySelector('.ps-pareto__card-text')!.textContent).toBe('Late returns, counted over the spring term.');
    expect(view.el.querySelector('.ps-pareto__field')).toBeNull();
    view.update(chart(four));
    expect(view.el.firstElementChild).toBe(card);
  });

  it('after the sample: largest first, codes follow rank, vital few marked, values and axis', () => {
    const view = createParetoView();
    view.update(chart(four, [SAMPLE]));
    const bars = barsInOrder(view);
    expect(bars.map((b) => b.dataset.node)).toEqual(['i2', 'i3', 'i4', 'i1']);
    expect(bars.map((b) => b.dataset.vital)).toEqual(['true', 'true', 'true', 'false']);
    expect(view.el.querySelector('.ps-pareto__code[data-for="i2"]')!.textContent).toBe('A');
    expect(view.el.querySelector('.ps-pareto__code[data-for="i1"]')!.textContent).toBe('D');
    expect(fill(view, 'i2').querySelector('.ps-pareto__value')!.textContent).toBe('45');
    // Axis top: 45 rounds up to 50 in ten steps of 5.
    expect(Number(item(view, 'i2').dataset.barHeight)).toBe(90);
    expect([...view.el.querySelectorAll('.ps-pareto__axis--count .ps-pareto__tick')].map((t) => t.textContent)).toEqual(['5', '10', '15', '20', '25', '30', '35', '40', '45', '50']);
    expect(view.el.querySelectorAll('.ps-pareto__dot').length).toBe(4);
    expect(view.el.querySelector('.ps-pareto__note')!.textContent).toBe('');
    const key = [...view.el.querySelectorAll('.ps-pareto__key-row')].map((r) => [r.querySelector('.ps-pareto__key-code')!.textContent, r.querySelector('.ps-pareto__key-figure')!.textContent, r.querySelector('.ps-pareto__key-share')!.textContent]);
    expect(key).toEqual([['A', '45', '45%'], ['B', '30', '30%'], ['C', '15', '15%'], ['D', '10', '10%']]);
  });

  it('drops the 80% guide where the line reaches 80%, onto the last vital bar (the picture, not the plan text)', () => {
    const view = createParetoView();
    view.update(chart(four, [SAMPLE]));
    const centres = barsInOrder(view).map((b) => Number(b.dataset.center));
    const cut = Number(view.el.querySelector<HTMLElement>('[data-cut]')!.dataset.cut);
    // 75% at the second dot, 90% at the third: the line meets 80% a third of the way between
    // them, so the guide drops there (the plan's test said between the third and fourth
    // centres, which no reading of the line gives; the book drops it where the line meets 80%).
    expect(cut).toBeGreaterThan(centres[1]);
    expect(cut).toBeLessThan(centres[2]);
    expect(cut).toBeCloseTo(centres[1] + (centres[2] - centres[1]) / 3, 1);
    expect(view.el.querySelector<SVGPolylineElement>('[data-cumulative-line]')!.getAttribute('points')!.split(' ').length).toBe(4);
  });

  it('keeps bar elements identical across a second snapshot, re-ordering them', () => {
    const view = createParetoView();
    view.update(chart(four, [SAMPLE]));
    const before = ['i1', 'i2', 'i3', 'i4'].map((id) => item(view, id));
    view.update(chart(four, [SAMPLE, snap([50, 20, 20, 10], 't2')]));
    ['i1', 'i2', 'i3', 'i4'].forEach((id, i) => expect(item(view, id)).toBe(before[i]));
    expect(barsInOrder(view).map((b) => b.dataset.node)).toEqual(['i1', 'i2', 'i3', 'i4']);
  });

  it('grows and glides the bars and redraws the line only on a new snapshot after the first paint', () => {
    const animate = spyAnimate();
    const view = createParetoView();
    view.update(chart(four, [SAMPLE]));
    expect(animate.calls()).toBe(0);
    view.update(chart(four, [SAMPLE, snap([50, 20, 20, 10], 't2')]));
    expect(animate.calls()).toBeGreaterThan(0);
  });

  it('puts a short bar’s figure on top of it, and a tall one’s inside', () => {
    const view = createParetoView();
    view.update(chart(four, [snap([100, 3, 50, 40])]));
    expect(fill(view, 'i1').querySelector('.ps-pareto__value')).not.toBeNull();
    const short = [...item(view, 'i2').children].find((child) => child.classList.contains('ps-pareto__value')) as HTMLElement;
    expect(short.classList.contains('is-above')).toBe(true);
    expect(short.textContent).toBe('3');
  });

  it('treats figures that no longer cover the items as waiting', () => {
    const view = createParetoView();
    view.update(chart(four, [SAMPLE]));
    view.update(chart([...four, node('i5', 'item:5')], [SAMPLE]));
    expect(view.el.querySelector('[data-cut]')).toBeNull();
    expect(barsInOrder(view).every((b) => Number(b.dataset.barHeight) === 0)).toBe(true);
    expect(view.el.querySelector('.ps-pareto__note')!.textContent).toBe('Waiting for the figures');
  });

  it('the 80/20 square shows the vital share and how many of all', () => {
    const view = createParetoView();
    view.update(chart(four, [SAMPLE]));
    const summary = view.el.querySelector<HTMLElement>('[data-summary]')!;
    expect(summary.querySelector('.ps-pareto__share')!.textContent).toBe('90%');
    expect(summary.querySelector('.ps-pareto__few')!.textContent).toBe('3 of 4');
    expect(summary.textContent).toContain('The vital few');
  });

  it('picks a tidy axis top', () => {
    expect(axisTop(95)).toBe(100);
    expect(axisTop(45)).toBe(50);
    expect(axisTop(7)).toBe(10);
    expect(axisTop(230)).toBe(250);
    expect(axisTop(1234)).toBe(2000);
  });

  describe('data form', () => {
    const open = (view: ReturnType<typeof createParetoView>) => {
      view.el.querySelector<HTMLButtonElement>('.ps-pareto__data')!.click();
      return view.el.querySelector<HTMLFormElement>('.ps-pareto__form')!;
    };
    const input = (form: HTMLElement, title: string) => form.querySelector<HTMLInputElement>(`input[aria-label="Figure for ${title}"]`)!;
    const type = (target: HTMLInputElement, value: string) => {
      target.value = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    };

    it('appears with three items, reading Add the data, then Update the data after a snapshot', () => {
      const view = createParetoView();
      view.update(chart(four.slice(0, 3)));
      expect(view.el.querySelector('.ps-pareto__data')).toBeNull();
      view.update(chart(four));
      expect(view.el.querySelector('.ps-pareto__data')!.textContent).toBe('Add the data');
      view.update(chart(four, [SAMPLE]));
      expect(view.el.querySelector('.ps-pareto__data')!.textContent).toBe('Update the data');
    });

    it('submits { counts } in slot order; a negative value disables Save', () => {
      const view = createParetoView();
      const got: unknown[] = [];
      view.onScore((scores) => got.push(scores));
      view.update(chart(four));
      const form = open(view);
      expect(form.hidden).toBe(false);
      const save = form.querySelector<HTMLButtonElement>('.ps-pareto__save')!;
      expect(save.disabled).toBe(true);
      ['10', '45', '30', '15'].forEach((v, i) => type(input(form, `Item:${i + 1} title`), v));
      expect(save.disabled).toBe(false);
      type(input(form, 'Item:2 title'), '-3');
      expect(save.disabled).toBe(true);
      expect(form.querySelector('.ps-pareto__message')!.textContent).toBe('Figures are zero or more.');
      type(input(form, 'Item:2 title'), '45');
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(got).toEqual([{ counts: [10, 45, 30, 15] }]);
      expect(form.hidden).toBe(true);
    });

    it('refills from the latest snapshot when reopened, in slot order', () => {
      const view = createParetoView();
      view.update(chart(four, [SAMPLE]));
      const form = open(view);
      expect(['Item:1 title', 'Item:2 title', 'Item:3 title', 'Item:4 title'].map((t) => input(form, t).value)).toEqual(['10', '45', '30', '15']);
    });

    it('closes on Escape first, and stops the key there', () => {
      const view = createParetoView();
      view.update(chart(four));
      const form = open(view);
      const outer = vi.fn();
      view.el.addEventListener('keydown', outer);
      input(form, 'Item:1 title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(form.hidden).toBe(true);
      expect(outer).not.toHaveBeenCalled();
    });

    it('rebuilds an open form when an item arrives, keeping what was typed', () => {
      const view = createParetoView();
      view.update(chart(four));
      const form = open(view);
      type(input(form, 'Item:1 title'), '70');
      view.update(chart([...four, node('i5', 'item:5')]));
      expect(input(form, 'Item:1 title').value).toBe('70');
      expect(input(form, 'Item:5 title')).not.toBeNull();
    });
  });

  describe('chosen option', () => {
    it('is absent until the choice exists, then shows its full text; removing the node removes the card', () => {
      const view = createParetoView();
      view.update(chart(four, [SAMPLE]));
      expect(view.el.querySelector('[data-choice]')).toBeNull();
      view.update(chart([...four, node('ch', 'choice', { text: 'Tackle the queue first with a second till at lunch.', state: 'contested', objection: 'Is there room for a second till?' })], [SAMPLE]));
      const card = view.el.querySelector<HTMLElement>('[data-choice]')!;
      expect(card.querySelector('.ps-choice__text')!.textContent).toBe('Tackle the queue first with a second till at lunch.');
      expect(card.querySelector('.ps-objection')).not.toBeNull();
      view.update(chart(four, [SAMPLE]));
      expect(view.el.querySelector('[data-choice]')).toBeNull();
    });
  });

  it('a full undo leaves nothing of the chart behind', () => {
    const view = createParetoView();
    view.update(chart([...four, node('ch', 'choice')], [SAMPLE]));
    view.update(chart([]));
    expect(view.el.children.length).toBe(0);
    expect(view.el.querySelectorAll('[data-node], [data-for]').length).toBe(0);
  });

  it('is a list of bars, not of its key, square and form', () => {
    const view = createParetoView();
    view.update(chart([...four, node('ch', 'choice')], [SAMPLE]));
    expect(view.el.getAttribute('role')).toBe('group');
    const list = view.el.querySelector('[role="list"]')!;
    expect([...list.children].every((child) => child.getAttribute('role') === 'listitem')).toBe(true);
    expect(view.el.querySelectorAll('[role="list"]').length).toBe(1);
  });

  it('stops listening after destroy: a resize and a click on the form toggle do nothing', () => {
    let fire: (() => void) | null = null;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          fire = cb;
        }
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = disconnect;
      }
    );
    const view = createParetoView();
    view.update(chart(four, [snap([100, 3, 50, 40])]));
    const field = view.el.querySelector<HTMLElement>('.ps-pareto__field')!;
    const rect = vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({ height: 400, width: 380 } as DOMRect);
    view.destroy();
    expect(disconnect).toHaveBeenCalled();
    (fire as unknown as () => void)();
    expect(rect).not.toHaveBeenCalled();
    view.el.querySelector<HTMLButtonElement>('.ps-pareto__data')!.click();
    expect(view.el.querySelector<HTMLFormElement>('.ps-pareto__form')!.hidden).toBe(true);
  });

  describe('review fixes', () => {
    it('closes an open bar card when its node is removed (no orphaned details)', () => {
      const view = createParetoView();
      view.update(chart(four, [SAMPLE]));
      fill(view, 'i4').click();
      expect(view.el.querySelector('.ps-details.is-open')).not.toBeNull();
      view.update(chart(four.filter((n) => n.id !== 'i4')));
      expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
    });

    it('formats axis ticks with the decimals the step needs, so no two ticks read the same', () => {
      expect(formatTick(0.05, 0.05)).toBe('0.05');
      expect(formatTick(0.1, 0.05)).toBe('0.1');
      expect(formatTick(7.5, 2.5)).toBe('7.5');
      expect(formatTick(20000, 2000)).toBe('20k');
      expect(formatTick(12500, 2500)).toBe('12.5k');
      const view = createParetoView();
      view.update(chart(four, [snap([0.2, 0.3, 0.4, 0.1])]));
      const ticks = [...view.el.querySelectorAll('.ps-pareto__axis--count .ps-pareto__tick')].map((t) => t.textContent);
      expect(new Set(ticks).size).toBe(10);
      expect(ticks[0]).toBe('0.05');
    });

    it('hides in-chart figures too wide for their bar; the key still carries them', () => {
      const ctx = { font: '', measureText: (text: string) => ({ width: text.length * 8 }) };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
      const many = [node('t', 'target'), ...Array.from({ length: 12 }, (_, i) => node(`i${i + 1}`, `item:${i + 1}`))];
      const counts = [4200, 3100, 2600, 1900, 1500, 1200, 900, 650, 400, 300, 9, 2];
      const view = createParetoView();
      view.update(chart(many, [snap(counts)]));
      vi.spyOn(view.el.querySelector<HTMLElement>('.ps-pareto__field')!, 'getBoundingClientRect').mockReturnValue({ width: 280, height: 300, left: 0, top: 0 } as DOMRect);
      view.update(chart(many, [snap(counts, 'b')]));
      // A bar is 280 / 12 * 0.84 ≈ 19.6px wide: "4200" (32px) does not fit, "9" (8px) does.
      const value = (id: string) => view.el.querySelector<HTMLElement>(`[data-node="${id}"] .ps-pareto__value`)!;
      expect(value('i1').classList.contains('is-hidden')).toBe(true);
      expect(value('i11').classList.contains('is-hidden')).toBe(false);
      expect(view.el.querySelector('.ps-pareto__key-row[data-for="i1"] .ps-pareto__key-figure')!.textContent).toBe('4200');
    });

    it('moves a shrinking bar’s figure only after its height animation ends', () => {
      const anims: Array<{ onfinish: (() => void) | null }> = [];
      const make = () => {
        const a = { cancel() {}, finish() {}, onfinish: null as (() => void) | null };
        anims.push(a);
        return a as unknown as Animation;
      };
      proto.animate = make;
      svgProto.animate = make;
      const view = createParetoView();
      view.update(chart(four, [snap([10, 45, 30, 15])]));
      const inFill = () => fill(view, 'i1').querySelector('.ps-pareto__value') !== null;
      expect(inFill()).toBe(true);
      // i1 drops from 10 of 50 to 1 of 50: too short to hold its figure, but only once it has shrunk.
      view.update(chart(four, [snap([10, 45, 30, 15]), snap([1, 45, 30, 15], 'b')]));
      expect(inFill()).toBe(true);
      for (const a of anims) a.onfinish?.();
      expect(inFill()).toBe(false);
    });

    it('Escape returns focus to the key row that opened the card, from the row or from the card', () => {
      const view = createParetoView();
      document.body.append(view.el);
      view.update(chart(four, [SAMPLE]));
      const key = view.el.querySelector<HTMLButtonElement>('.ps-pareto__key-row[data-for="i2"]')!;
      key.click();
      expect(key.getAttribute('aria-expanded')).toBe('true');
      key.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
      expect(document.activeElement).toBe(key);
      key.click();
      const card = view.el.querySelector<HTMLElement>('.ps-details.is-open .ps-details__text')!;
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(view.el.querySelector('.ps-details.is-open')).toBeNull();
      expect(document.activeElement).toBe(key);
      // Opened from the bar, it returns to the bar.
      fill(view, 'i2').click();
      view.el.querySelector<HTMLElement>('.ps-details.is-open .ps-details__text')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.activeElement).toBe(fill(view, 'i2'));
      view.el.remove();
    });

    it('moves focus somewhere sensible when an undo takes the focused form away', () => {
      const view = createParetoView();
      document.body.append(view.el);
      view.update(chart(four));
      view.el.querySelector<HTMLButtonElement>('.ps-pareto__data')!.click();
      const input = view.el.querySelector<HTMLInputElement>('.ps-pareto__form input')!;
      input.focus();
      expect(document.activeElement).toBe(input);
      view.update(chart(four.slice(0, 3)));
      expect(view.el.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).toBe(item(view, 't').querySelector('.ps-pareto__more'));
      view.el.remove();
    });

    it('gives the cut segments and dots a paper edge on the red', () => {
      const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
      const section = css.slice(css.indexOf('/* Pareto analysis'));
      expect(section).toMatch(/\.ps-pareto__dot \{[^}]*box-shadow: 0 0 0 2px var\(--ps-paper\)/);
      expect(section).toMatch(/\.ps-pareto__cut \{[^}]*background: var\(--ps-paper\)/);
    });
  });

  it('names its container in every phone rule', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/problem-solver/problem-solver.css'), 'utf8');
    const start = css.indexOf('/* Pareto analysis');
    const rest = css.slice(start + 1);
    const next = rest.search(/\n\/\* [A-Z][a-z]+ [a-z]+ \(toolkit/);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    expect(start).toBeGreaterThan(-1);
    expect(section).toContain('container: pareto / inline-size');
    expect(section).toContain('@container pareto (');
    expect(section).not.toMatch(/@container \(/);
  });
});
