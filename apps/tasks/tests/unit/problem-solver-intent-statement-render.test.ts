import { describe, expect, it } from 'vitest';
import { createIntentStatementView } from '../../../../packages/problem-solver/render/intent-statement';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'intent_statement', status: 'active', nodes, edges, ...extra });
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;

const PARTS = ['problem', 'stakeholders', 'failures', 'approach', 'opportunity', 'risk'];
const all = PARTS.map((part) => node(part[0] + part[1], part));

describe('Intent statement view', () => {
  it('renders no bands and no stack for an empty run', () => {
    const view = createIntentStatementView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-intent__stack')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Intent statement');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createIntentStatementView();
    view.update(run([node('pr', 'problem')]));
    const band = view.el.querySelector('[data-node="pr"]');
    const stack = view.el.querySelector('.ps-intent__stack');
    view.update(run(all));
    expect(view.el.querySelector('[data-node="pr"]')).toBe(band);
    expect(view.el.querySelector('.ps-intent__stack')).toBe(stack);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createIntentStatementView();
    view.update(run([node('pr', 'problem'), node('st', 'stakeholders', { state: 'contested', objection: 'Who actually signs this off?' })]));
    const item = view.el.querySelector('[data-node="st"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(view.el.querySelector('[data-node="pr"]')!.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Who actually signs this off?');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Who actually signs this off?');
  });

  it('opens one details card at a time', () => {
    const view = createIntentStatementView();
    view.update(run(all));
    button(view, 'pr').click();
    expect(view.el.querySelector('[data-node="pr"]')!.classList.contains('is-open')).toBe(true);
    button(view, 'ri').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['ri']);
    expect(button(view, 'pr').getAttribute('aria-expanded')).toBe('false');
    expect(button(view, 'ri').getAttribute('aria-expanded')).toBe('true');
    expect(view.el.querySelector(`#${button(view, 'ri').getAttribute('aria-controls')}`)).not.toBeNull();
  });

  it('shows the short title in the band and the full answer only in details', () => {
    const view = createIntentStatementView();
    view.update(run([node('pr', 'problem', { title: 'Slow repairs', text: 'Tenants wait weeks for small repairs to be booked.' })]));
    expect(view.el.querySelector('[data-node="pr"] .ps-intent__title')!.textContent).toBe('Slow repairs');
    expect(button(view, 'pr').textContent).not.toContain('wait weeks');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('wait weeks'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('renders the bands in fixed order whatever order the nodes arrive in', () => {
    const view = createIntentStatementView();
    view.update(run([all[5], all[2], all[0]]));
    view.update(run([all[5], all[2], all[0], all[4], all[1], all[3]]));
    expect([...view.el.querySelectorAll('[data-node]')].map((el) => el.getAttribute('data-part'))).toEqual(PARTS);
    const reversed = createIntentStatementView();
    reversed.update(run([...all].reverse()));
    expect([...reversed.el.querySelectorAll('[data-node]')].map((el) => el.getAttribute('data-part'))).toEqual(PARTS);
  });

  it('gives each band its data-part and heading', () => {
    const view = createIntentStatementView();
    view.update(run(all));
    const items = [...view.el.querySelectorAll('[data-node]')];
    expect(items.map((el) => el.getAttribute('data-part'))).toEqual(PARTS);
    expect(items.map((el) => el.querySelector('.ps-intent__heading')!.textContent)).toEqual(['Problem', 'Stakeholders', 'Failures', 'Approach', 'Opportunity', 'Risk']);
    expect(items.every((el) => el.getAttribute('role') === 'listitem')).toBe(true);
  });

  it('colours the bands red, yellow, blue in book order', () => {
    const view = createIntentStatementView();
    view.update(run(all));
    const colour = (el: Element) => ['is-red', 'is-yellow', 'is-blue'].filter((c) => el.classList.contains(c));
    expect([...view.el.querySelectorAll('[data-node]')].map(colour)).toEqual([['is-red'], ['is-yellow'], ['is-blue'], ['is-red'], ['is-yellow'], ['is-blue']]);
  });
});
