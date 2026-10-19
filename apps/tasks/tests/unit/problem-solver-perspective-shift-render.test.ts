import { describe, expect, it } from 'vitest';
import { createPerspectiveShiftView } from '../../../../packages/problem-solver/render/perspective-shift';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'perspective_shift', status: 'active', nodes, edges, ...extra });
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
const pageOf = (view: { el: HTMLElement }, id: string) => view.el.querySelector(`[data-node="${id}"]`)!.closest<HTMLElement>('[data-page]')!;

const four = [node('s1', 'stakeholder:1'), node('s2', 'stakeholder:2'), node('s3', 'stakeholder:3'), node('s4', 'stakeholder:4')];

describe('Perspective shift view', () => {
  it('renders no shapes and no frame for an empty run', () => {
    const view = createPerspectiveShiftView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('[data-quadrant]')).toBeNull();
    expect(view.el.querySelector('.ps-persp__stage')).toBeNull();
    expect(view.el.querySelector('.ps-persp__centre')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Perspective shift');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createPerspectiveShiftView();
    view.update(run([node('s1', 'stakeholder:1'), node('v1', 'view:1')]));
    const stakeholder = view.el.querySelector('[data-node="s1"]');
    const viewItem = view.el.querySelector('[data-node="v1"]');
    const quadrant = view.el.querySelector('[data-quadrant="top"]');
    view.update(run([...four, node('v1', 'view:1'), node('n1', 'insight:1'), node('r', 'reframe')]));
    expect(view.el.querySelector('[data-node="s1"]')).toBe(stakeholder);
    expect(view.el.querySelector('[data-node="v1"]')).toBe(viewItem);
    expect(view.el.querySelector('[data-quadrant="top"]')).toBe(quadrant);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createPerspectiveShiftView();
    view.update(run([node('s1', 'stakeholder:1', { state: 'contested', objection: 'That is a group, not a person.' })]));
    const item = view.el.querySelector('[data-node="s1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('That is a group, not a person.');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('That is a group, not a person.');
  });

  it('opens one details card at a time', () => {
    const view = createPerspectiveShiftView();
    view.update(run([...four, node('n2', 'insight:2')]));
    const card = (id: string) => view.el.querySelector(`#${button(view, id).getAttribute('aria-controls')}`)!;
    button(view, 's1').click();
    expect(view.el.querySelector('[data-node="s1"]')!.classList.contains('is-open')).toBe(true);
    expect(card('s1').classList.contains('is-open')).toBe(true);
    button(view, 'n2').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['n2']);
    expect(card('s1').classList.contains('is-open')).toBe(false);
    expect(card('n2').classList.contains('is-open')).toBe(true);
    expect(button(view, 's1').getAttribute('aria-expanded')).toBe('false');
    expect(button(view, 'n2').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the short title in the shape and the full answer only in details', () => {
    const view = createPerspectiveShiftView();
    view.update(run([node('s1', 'stakeholder:1', { title: 'Night porter', text: 'The night porter who covers the front desk alone after ten.' })]));
    expect(view.el.querySelector('[data-node="s1"] .ps-persp__title')!.textContent).toBe('Night porter');
    expect(button(view, 's1').textContent).not.toContain('front desk alone');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('front desk alone'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('fills the triangles top, right, bottom, left with a perspective letter and prompt', () => {
    const view = createPerspectiveShiftView();
    view.update(run([node('s3', 'stakeholder:3'), node('s1', 'stakeholder:1'), node('s2', 'stakeholder:2'), node('s4', 'stakeholder:4')]));
    expect(view.el.querySelector('[data-quadrant="top"] [data-node="s1"]')).not.toBeNull();
    expect(view.el.querySelector('[data-quadrant="right"] [data-node="s2"]')).not.toBeNull();
    expect(view.el.querySelector('[data-quadrant="bottom"] [data-node="s3"]')).not.toBeNull();
    expect(view.el.querySelector('[data-quadrant="left"] [data-node="s4"]')).not.toBeNull();
    expect(view.el.querySelector('[data-quadrant="right"] .ps-persp__meta')!.textContent).toBe('Perspective B');
    expect(view.el.querySelector('[data-quadrant="right"] .ps-persp__prompt')!.textContent).toBe('Why is…');
    expect(view.el.querySelector('[data-quadrant="right"]')!.getAttribute('aria-label')).toBe('Perspective B');
  });

  it('draws a triangle only for a stakeholder that exists, and the centre dot with the first', () => {
    const view = createPerspectiveShiftView();
    view.update(run([node('s1', 'stakeholder:1')]));
    expect(view.el.querySelectorAll('[data-quadrant]').length).toBe(1);
    expect(view.el.querySelector('.ps-persp__centre')).not.toBeNull();
  });

  it('puts a stakeholder\'s view and insight inside its triangle', () => {
    const view = createPerspectiveShiftView();
    view.update(run([node('s1', 'stakeholder:1'), node('s2', 'stakeholder:2'), node('v1', 'view:1'), node('v2', 'view:2'), node('n1', 'insight:1')]));
    const top = view.el.querySelector('[data-quadrant="top"]')!;
    expect(top.querySelector('[data-node="n1"] .ps-persp__title')!.textContent).toBe('Insight:1 title');
    expect(top.querySelector('[data-node="v1"] .ps-persp__dot')).not.toBeNull();
    expect(view.el.querySelector('[data-quadrant="right"] [data-node="v2"] .ps-persp__dot')).not.toBeNull();
    expect(view.el.querySelector('[data-quadrant="right"] .ps-persp__item--insight')).toBeNull();
    expect(button(view, 'v1').getAttribute('aria-label')).toContain('View:1 title');
  });

  it('waits for the stakeholder before drawing their view or insight', () => {
    const view = createPerspectiveShiftView();
    view.update(run([node('s1', 'stakeholder:1'), node('n2', 'insight:2')]));
    expect(view.el.querySelector('[data-node="n2"]')).toBeNull();
    view.update(run([node('s1', 'stakeholder:1'), node('s2', 'stakeholder:2'), node('n2', 'insight:2')]));
    expect(view.el.querySelector('[data-quadrant="right"] [data-node="n2"]')).not.toBeNull();
  });

  it('shows the reframe card with the full text once the reframe exists', () => {
    const view = createPerspectiveShiftView();
    view.update(run(four));
    expect(view.el.querySelector('.ps-persp__reframe')).toBeNull();
    view.update(run([...four, node('r', 'reframe', { text: 'How might the late shift hand over without anyone staying past the end of it?' })]));
    const card = view.el.querySelector('[data-node="r"]')!;
    expect(card.classList.contains('ps-persp__reframe')).toBe(true);
    expect(card.querySelector('.ps-persp__reframe-text')!.textContent).toBe('How might the late shift hand over without anyone staying past the end of it?');
    expect(card.querySelector('button')!.getAttribute('aria-controls')).toBeTruthy();
    expect(view.el.querySelector('.ps-persp__centre')!.classList.contains('is-reframed')).toBe(true);
  });

  it('pages stakeholders in sets of four and shows the set with the newest', () => {
    const view = createPerspectiveShiftView();
    view.update(run(four));
    expect(view.el.querySelector('.ps-persp__pager')).toBeNull();
    view.update(run([...four, node('s5', 'stakeholder:5')]));
    const pages = [...view.el.querySelectorAll<HTMLButtonElement>('.ps-persp__pager button')];
    expect(pages.length).toBe(2);
    expect(pages.map((b) => b.textContent)).toEqual(['1–4', '5–8']);
    expect(view.el.querySelector('[data-quadrant="top"] [data-node="s1"]')).not.toBeNull();
    expect(pageOf(view, 's5').querySelector('[data-quadrant="top"] [data-node="s5"]')).not.toBeNull();
    expect(pageOf(view, 's5').hidden).toBe(false);
    expect(pageOf(view, 's1').hidden).toBe(true);
    expect(pages[1].getAttribute('aria-current')).toBe('true');
    pages[0].click();
    expect(pageOf(view, 's1').hidden).toBe(false);
    expect(pageOf(view, 's5').hidden).toBe(true);
    expect(pages[0].getAttribute('aria-current')).toBe('true');
    expect(pages[1].hasAttribute('aria-current')).toBe(false);
  });

  it('keeps the chosen set when an update adds no stakeholder, and closes a card on a hidden set', () => {
    const view = createPerspectiveShiftView();
    const five = [...four, node('s5', 'stakeholder:5')];
    view.update(run(five));
    button(view, 's5').click();
    view.el.querySelectorAll<HTMLButtonElement>('.ps-persp__pager button')[0].click();
    expect(view.el.querySelector('[data-node="s5"]')!.classList.contains('is-open')).toBe(false);
    view.update(run([...five, node('v1', 'view:1')]));
    expect(pageOf(view, 's1').hidden).toBe(false);
  });
});
