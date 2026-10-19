import { describe, expect, it } from 'vitest';
import { createLotusBlossomView } from '../../../../packages/problem-solver/render/lotus-blossom';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool: 'lotus_blossom', status: 'active', nodes, edges, ...extra });
const button = (view: { el: HTMLElement }, id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
const petal = (from: string, to: string): PsEdge => ({ from, to, kind: 'petal' });
const marks = (from: string, to: string): PsEdge => ({ from, to, kind: 'marks' });

const problem = node('p', 'problem');
const solutions = Array.from({ length: 8 }, (_, i) => node(`s${i + 1}`, `solution:${i + 1}`));
const ideas = [node('i1', 'idea:1'), node('i2', 'idea:2', { title: 'Shared bikes' }), node('i3', 'idea:3')];
const ideaEdges = [petal('i1', 's3'), petal('i2', 's3'), petal('i3', 's5')];

describe('Lotus blossom view', () => {
  it('renders no shapes and no frame for an empty run', () => {
    const view = createLotusBlossomView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-lotus__stage')).toBeNull();
    expect(view.el.getAttribute('role')).toBe('list');
    expect(view.el.getAttribute('aria-label')).toBe('Lotus blossom');
  });

  it('keeps the element for an existing node identical across updates', () => {
    const view = createLotusBlossomView();
    view.update(run([problem, ...solutions.slice(0, 3), ideas[0]], [petal('i1', 's3')]));
    const item = view.el.querySelector('[data-node="s2"]');
    const shape = button(view, 's2');
    const idea = view.el.querySelector('[data-node="i1"]');
    const flower = view.el.querySelector('[data-flower="s3"]');
    const stage = view.el.querySelector('.ps-lotus__stage');
    view.update(run([problem, ...solutions, ...ideas], ideaEdges));
    expect(view.el.querySelector('[data-node="s2"]')).toBe(item);
    expect(button(view, 's2')).toBe(shape);
    expect(view.el.querySelector('[data-node="i1"]')).toBe(idea);
    expect(view.el.querySelector('[data-flower="s3"]')).toBe(flower);
    expect(view.el.querySelector('.ps-lotus__stage')).toBe(stage);
  });

  it('marks a contested node and shows the objection in its tag and details', () => {
    const view = createLotusBlossomView();
    view.update(run([problem, node('s1', 'solution:1', { state: 'contested', objection: 'Is this a solution or a wish?' }), solutions[1]]));
    const item = view.el.querySelector('[data-node="s1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(view.el.querySelector('[data-node="s2"]')!.classList.contains('is-contested')).toBe(false);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is this a solution or a wish?');
    expect(view.el.querySelector('.ps-details__note')!.textContent).toContain('Is this a solution or a wish?');
  });

  it('opens one details card at a time', () => {
    const view = createLotusBlossomView();
    view.update(run([problem, ...solutions.slice(0, 2)]));
    button(view, 'p').click();
    expect(view.el.querySelector('[data-node="p"]')!.classList.contains('is-open')).toBe(true);
    button(view, 's2').click();
    expect([...view.el.querySelectorAll('[data-node].is-open')].map((n) => n.getAttribute('data-node'))).toEqual(['s2']);
    expect(button(view, 'p').getAttribute('aria-expanded')).toBe('false');
    expect(button(view, 's2').getAttribute('aria-expanded')).toBe('true');
    const card = view.el.querySelector(`#${button(view, 's2').getAttribute('aria-controls')}`)!;
    expect(card.classList.contains('is-open')).toBe(true);
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
  });

  it('shows the short title in the shape and the full answer only in details', () => {
    const view = createLotusBlossomView();
    view.update(run([node('p', 'problem', { title: 'Noisy stairwell', text: 'Residents complain the stairwell echoes late every night.' })]));
    expect(view.el.querySelector('[data-node="p"] .ps-lotus__title')!.textContent).toBe('Noisy stairwell');
    expect(button(view, 'p').textContent).not.toContain('echoes late');
    const holders = [...view.el.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent?.includes('echoes late'));
    expect(holders.length).toBe(1);
    expect(holders[0].closest('.ps-details')).not.toBeNull();
  });

  it('draws eight solution petals for eight solutions', () => {
    const view = createLotusBlossomView();
    view.update(run([problem, ...solutions]));
    expect(view.el.querySelectorAll('[data-petal]').length).toBe(8);
    expect([...view.el.querySelectorAll('[data-petal]')].map((el) => el.getAttribute('data-petal'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    // No flower until a solution has an idea.
    expect(view.el.querySelector('[data-flower]')).toBeNull();
  });

  it('puts an idea inside the flower of the solution it grows from', () => {
    const view = createLotusBlossomView();
    view.update(run([problem, ...solutions, ...ideas], ideaEdges));
    expect(view.el.querySelector('[data-flower="s3"] [data-node="i1"]')).not.toBeNull();
    expect(view.el.querySelector('[data-flower="s3"] [data-node="i2"]')).not.toBeNull();
    expect(view.el.querySelector('[data-flower="s5"] [data-node="i3"]')).not.toBeNull();
    expect(view.el.querySelector('[data-flower="s3"] [data-node="i3"]')).toBeNull();
    expect(view.el.querySelectorAll('[data-flower]').length).toBe(2);
  });

  it('lists ideas with no petal link as unplaced', () => {
    const view = createLotusBlossomView();
    view.update(run([problem, ...solutions, ...ideas, node('i4', 'idea:4')], ideaEdges));
    const orphans = view.el.querySelector('.ps-lotus__orphans')!;
    expect(orphans).not.toBeNull();
    expect(orphans.querySelector('[data-node="i4"]')).not.toBeNull();
    expect(orphans.querySelector('[data-node="i1"]')).toBeNull();
    expect(view.el.querySelector('[data-flower] [data-node="i4"]')).toBeNull();
  });

  it('zooms into a flower and back out', () => {
    const view = createLotusBlossomView();
    document.body.append(view.el);
    view.update(run([problem, ...solutions, ...ideas], ideaEdges));
    expect(view.el.hasAttribute('data-zoom')).toBe(false);
    const back = view.el.querySelector<HTMLButtonElement>('.ps-lotus__back')!;
    expect(back.hidden).toBe(true);
    // Overview: ideas are not tab stops; the flower is.
    expect(button(view, 'i1').tabIndex).toBe(-1);
    view.el.querySelector<HTMLButtonElement>('[data-flower="s3"] .ps-lotus__bloom')!.click();
    expect(view.el.getAttribute('data-zoom')).toBe('s3');
    expect(back.hidden).toBe(false);
    expect(button(view, 'i1').tabIndex).toBe(0);
    expect(button(view, 'i3').tabIndex).toBe(-1);
    expect(document.activeElement).toBe(button(view, 'i1'));
    back.click();
    expect(view.el.hasAttribute('data-zoom')).toBe(false);
    expect(back.hidden).toBe(true);
    expect(button(view, 'i1').tabIndex).toBe(-1);
    expect(document.activeElement).toBe(view.el.querySelector('[data-flower="s3"] .ps-lotus__bloom'));
    view.el.remove();
  });

  it('frames every flower with eight slots, ghosts where no idea has grown', () => {
    const view = createLotusBlossomView();
    view.update(run([problem, ...solutions, ...ideas], ideaEdges));
    const flower = view.el.querySelector('[data-flower="s3"]')!;
    const ghosts = flower.querySelector('.ps-lotus__ghosts')!;
    expect(ghosts.getAttribute('aria-hidden')).toBe('true');
    expect(ghosts.querySelectorAll('.ps-lotus__ghost').length).toBe(8);
    expect(ghosts.querySelector('button, [role="listitem"], [data-node]')).toBeNull();
    // Each idea sits on its slot: the same direction as the ghost with its petal number.
    const idea = flower.querySelector<HTMLElement>('[data-node="i2"]')!;
    const slot = ghosts.querySelector<HTMLElement>('[data-slot="2"]')!;
    expect(idea.style.getPropertyValue('--dx')).toBe(slot.style.getPropertyValue('--dx'));
    expect(idea.style.getPropertyValue('--dy')).toBe(slot.style.getPropertyValue('--dy'));
  });

  it('closes a card opened inside a flower when zooming out', () => {
    const view = createLotusBlossomView();
    document.body.append(view.el);
    view.update(run([problem, ...solutions, ...ideas], ideaEdges));
    view.el.querySelector<HTMLButtonElement>('[data-flower="s3"] .ps-lotus__bloom')!.click();
    button(view, 'i2').click();
    expect(view.el.querySelector('[data-node="i2"]')!.classList.contains('is-open')).toBe(true);
    view.el.querySelector<HTMLButtonElement>('.ps-lotus__back')!.click();
    expect(view.el.querySelector('[data-node="i2"]')!.classList.contains('is-open')).toBe(false);
    expect(button(view, 'i2').getAttribute('aria-expanded')).toBe('false');
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(0);
    // A card opened outside the flower (a solution) is left alone.
    view.el.querySelector<HTMLButtonElement>('[data-flower="s3"] .ps-lotus__bloom')!.click();
    view.el.querySelector<HTMLButtonElement>('[data-key="s1"]')!.click();
    view.el.querySelector<HTMLButtonElement>('.ps-lotus__back')!.click();
    expect(view.el.querySelector('[data-node="s1"]')!.classList.contains('is-open')).toBe(true);
    view.el.remove();
  });

  it('zooms out on Escape', () => {
    const view = createLotusBlossomView();
    document.body.append(view.el);
    view.update(run([problem, ...solutions, ...ideas], ideaEdges));
    view.el.querySelector<HTMLButtonElement>('[data-flower="s5"] .ps-lotus__bloom')!.click();
    expect(view.el.getAttribute('data-zoom')).toBe('s5');
    button(view, 'i3').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(view.el.hasAttribute('data-zoom')).toBe(false);
    expect(document.activeElement).toBe(view.el.querySelector('[data-flower="s5"] .ps-lotus__bloom'));
    view.el.remove();
  });

  it('rings a preferred idea and lists the pick under the chart', () => {
    const view = createLotusBlossomView();
    const pick = node('f1', 'preferred:1', { title: 'Cheap and quick', text: 'This one costs least and can start next week.' });
    view.update(run([problem, ...solutions, ...ideas, pick], [...ideaEdges, marks('f1', 'i2')]));
    expect(view.el.querySelector('[data-node="i2"]')!.classList.contains('is-preferred')).toBe(true);
    expect(view.el.querySelector('[data-node="i1"]')!.classList.contains('is-preferred')).toBe(false);
    const card = view.el.querySelector('.ps-lotus__picks [data-node="f1"]')!;
    expect(card.textContent).toContain('Shared bikes');
    card.dispatchEvent(new MouseEvent('mouseenter'));
    expect(view.el.querySelector('[data-node="i2"]')!.classList.contains('is-highlit')).toBe(true);
    card.dispatchEvent(new MouseEvent('mouseleave'));
    expect(view.el.querySelector('[data-node="i2"]')!.classList.contains('is-highlit')).toBe(false);
    button(view, 'f1').click();
    expect(view.el.querySelector('[data-node="f1"]')!.classList.contains('is-open')).toBe(true);
  });

  it('does not highlight an idea in a flower dimmed by another zoom', () => {
    const view = createLotusBlossomView();
    document.body.append(view.el);
    const pick = node('f1', 'preferred:1');
    view.update(run([problem, ...solutions, ...ideas, pick], [...ideaEdges, marks('f1', 'i3')]));
    view.el.querySelector<HTMLButtonElement>('[data-flower="s3"] .ps-lotus__bloom')!.click();
    const card = view.el.querySelector('.ps-lotus__picks [data-node="f1"]')!;
    card.dispatchEvent(new MouseEvent('mouseenter'));
    expect(view.el.querySelector('[data-node="i3"]')!.classList.contains('is-highlit')).toBe(false);
    view.el.querySelector<HTMLButtonElement>('.ps-lotus__back')!.click();
    expect(view.el.querySelector('[data-node="i3"]')!.classList.contains('is-highlit')).toBe(true);
    view.el.remove();
  });
});
