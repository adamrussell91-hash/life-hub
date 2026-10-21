// The contract every Decision Book chart keeps, run against each family's sample tool and its
// empty, partial and full runs (packages/decision-book/fixtures.mjs).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARTS, createChartFor } from './helpers/decision-book-charts';
import { runFor } from '../../../../packages/decision-book/fixtures.mjs';
import type { DmToolRun } from '../../../../packages/decision-book/render/core';

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
  document.body.replaceChildren();
});
function spyAnimate() {
  proto.animate = () => null;
  return vi.spyOn(Element.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
}

const run = (key: string, stage: 'empty' | 'partial' | 'full') => runFor(key, stage) as DmToolRun;
const entry = (root: Element, id: string) => root.querySelector<HTMLElement>(`.dm-entry[data-node="${id}"]`)!;
const pill = (root: Element, id: string) => entry(root, id).querySelector<HTMLButtonElement>('button')!;

describe.each(CHARTS)('%s chart', (key) => {
  it('draws its frame and says Empty for an empty run', () => {
    const view = createChartFor(key);
    view.update(run(key, 'empty'));
    expect(view.el.getAttribute('data-state')).toBe('empty');
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Empty');
    expect(view.el.querySelector('.dm-chart__frame')!.children.length).toBeGreaterThan(0);
    expect(view.el.querySelectorAll('.dm-entry').length).toBe(0);
  });

  it('draws one entry per node, says In progress, and Completed once the run is done', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    expect(view.el.getAttribute('data-state')).toBe('populated');
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('In progress');
    for (const node of full.nodes) expect(entry(view.el, node.id), node.id).not.toBeNull();
    view.update({ ...full, status: 'done' });
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Completed');
  });

  it('keeps element identity across updates', () => {
    const view = createChartFor(key);
    const partial = run(key, 'partial');
    view.update(partial);
    const first = partial.nodes[0];
    if (!first) return;
    const before = entry(view.el, first.id);
    view.update(run(key, 'full'));
    expect(entry(view.el, first.id)).toBe(before);
  });

  it('marks the contested entry with words and its objection, and follows a later change', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    const node = full.nodes.find((n) => n.state === 'contested')!;
    view.update(full);
    const item = entry(view.el, node.id);
    expect(item.getAttribute('data-state')).toBe('contested');
    expect(item.querySelector('.ps-objection')!.textContent).toBe('Contested');
    expect(pill(view.el, node.id).getAttribute('aria-label')).toContain(', contested');
    pill(view.el, node.id).click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain(node.objection);
    view.update({ ...full, nodes: full.nodes.map((n) => (n.id === node.id ? { ...n, state: 'accepted' as const, objection: undefined } : n)) });
    expect(item.querySelector('.ps-objection')).toBeNull();
    expect(pill(view.el, node.id).getAttribute('aria-label')).not.toContain('contested');
  });

  it('opens one details card at a time and marks the open entry Selected', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    const [a, b] = full.nodes;
    pill(view.el, a.id).click();
    expect(entry(view.el, a.id).getAttribute('data-state')).toBe('selected');
    pill(view.el, b.id).click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(entry(view.el, b.id).classList.contains('is-selected')).toBe(true);
    expect(entry(view.el, a.id).classList.contains('is-selected')).toBe(false);
  });

  it('shows titles in pills and the full answer only in details', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    const node = full.nodes[0];
    expect(entry(view.el, node.id).querySelector('.dm-entry__title')!.textContent!.length).toBeGreaterThan(0);
    const card = view.el.querySelector(`.ps-details[data-for="${node.id}"]`)!;
    expect(card.textContent).toContain(node.text);
  });

  it('animates only after the first paint, and never on an identical update', () => {
    const animate = spyAnimate();
    const view = createChartFor(key);
    document.body.append(view.el);
    view.update(run(key, 'full'));
    expect(animate).not.toHaveBeenCalled();
    view.update(run(key, 'full'));
    expect(animate).not.toHaveBeenCalled();
    const second = createChartFor(key);
    document.body.append(second.el);
    second.update(run(key, 'empty'));
    second.update(run(key, 'full'));
    expect(animate).toHaveBeenCalled();
  });

  it('drops every element of a removed node', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    const gone = full.nodes.at(-1)!;
    view.update({ ...full, nodes: full.nodes.slice(0, -1), edges: full.edges.filter((e) => e.from !== gone.id && e.to !== gone.id) });
    expect(view.el.querySelectorAll(`[data-node="${gone.id}"], [data-for="${gone.id}"]`).length).toBe(0);
  });

  it('shows a task tag with its live status, and a proposal', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    const node = full.nodes[0];
    view.setProposed([node.id]);
    expect(entry(view.el, node.id).querySelector<HTMLElement>('.dm-entry__proposed')!.hidden).toBe(false);
    view.setTasks([{ nodeId: node.id, taskId: 't1', status: 'in_progress' }]);
    expect(entry(view.el, node.id).querySelector('.dm-entry__task')!.textContent).toBe('TaskDoing');
    expect(pill(view.el, node.id).getAttribute('aria-label')).toContain('task: Doing');
  });

  it('does nothing after destroy', () => {
    const view = createChartFor(key);
    view.update(run(key, 'partial'));
    view.destroy();
    view.update(run(key, 'full'));
    const extra = run(key, 'full').nodes.find((n) => !run(key, 'partial').nodes.some((p) => p.id === n.id));
    if (extra) expect(entry(view.el, extra.id)).toBeNull();
  });

  it('uses no list roles and has no unlabelled buttons', () => {
    const view = createChartFor(key);
    view.update(run(key, 'full'));
    expect(view.el.querySelector('[role="list"], [role="listitem"]')).toBeNull();
    for (const button of view.el.querySelectorAll('button')) expect(button.getAttribute('aria-label') || button.textContent!.trim(), button.outerHTML).toBeTruthy();
  });
});
