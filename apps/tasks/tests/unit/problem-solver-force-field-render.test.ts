import { describe, expect, it } from 'vitest';
import { createForceFieldView } from '../../../../packages/problem-solver/render/force-field';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
const snap = (forScores: number[], against: number[], at = 'a') => ({ at, for: forScores, against });
const field = (nodes: PsNode[], snapshots: ReturnType<typeof snap>[] = []) => run('force_field', nodes, [], snapshots.length ? { scores: { snapshots } } : {});

const base = [node('cur', 'current'), node('goal', 'goal')];
const sample = [...base, node('f1', 'for:1'), node('f2', 'for:2'), node('a1', 'against:1')];
const ids = (view: { el: HTMLElement }, side: string) => [...view.el.querySelectorAll<HTMLElement>(`[data-region="${side}"] [data-node]`)].map((el) => el.dataset.node);
const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { cancelable: true }));

describe('Force field view', () => {
  it('renders nothing for an empty run', () => {
    const view = createForceFieldView();
    view.update(field([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    expect(view.el.querySelector('.ps-force__stage')).toBeNull();
    expect(view.el.querySelector('.ps-force__head')).toBeNull();
    expect(view.el.querySelector('.ps-force__score')).toBeNull();
  });

  it('keeps element identity across updates', () => {
    const view = createForceFieldView();
    view.update(field([...base, node('f1', 'for:1')]));
    const goal = view.el.querySelector('[data-node="goal"]');
    const arrow = view.el.querySelector('[data-node="f1"]');
    view.update(field(sample));
    expect(view.el.querySelector('[data-node="goal"]')).toBe(goal);
    expect(view.el.querySelector('[data-node="f1"]')).toBe(arrow);
  });

  it('marks a contested node and carries the objection', () => {
    const view = createForceFieldView();
    view.update(field([...base, node('f1', 'for:1', { state: 'contested', objection: 'Is that a force or a wish?' })]));
    const item = view.el.querySelector('[data-node="f1"]')!;
    expect(item.classList.contains('is-contested')).toBe(true);
    expect(item.querySelector('.ps-objection')!.getAttribute('title')).toBe('Is that a force or a wish?');
    item.querySelector<HTMLButtonElement>('button')!.click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain('Is that a force or a wish?');
  });

  it('opens one details card at a time', () => {
    const view = createForceFieldView();
    view.update(field(sample));
    const button = (id: string) => view.el.querySelector<HTMLButtonElement>(`[data-node="${id}"] button`)!;
    button('f1').click();
    button('a1').click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(button('a1').getAttribute('aria-expanded')).toBe('true');
    expect(button('f1').getAttribute('aria-expanded')).toBe('false');
    expect(view.el.querySelector(`#${button('a1').getAttribute('aria-controls')}`)!.classList.contains('is-open')).toBe(true);
  });

  it('shows titles in the shapes and the full answer only in the details', () => {
    const view = createForceFieldView();
    view.update(field([node('cur', 'current', { title: 'Late rota' }), node('goal', 'goal'), node('f1', 'for:1', { title: 'Keen team' }), node('a1', 'against:1')]));
    expect(view.el.querySelector('[data-node="f1"] .ps-force__title')!.textContent).toBe('Keen team');
    expect(view.el.querySelector('[data-node="cur"] .ps-force__title')!.textContent).toBe('Late rota');
    for (const shape of view.el.querySelectorAll('[data-node] button')) expect(shape.textContent).not.toContain('answer text');
    expect([...view.el.querySelectorAll('.ps-details')].some((card) => card.textContent!.includes('for:1 answer text'))).toBe(true);
  });

  it('draws the goal bar and current-state bar only once their nodes exist', () => {
    const view = createForceFieldView();
    view.update(field([node('cur', 'current')]));
    expect(view.el.querySelector('.ps-force__current')).not.toBeNull();
    expect(view.el.querySelector('.ps-force__goal')).toBeNull();
    view.update(field(base));
    expect(view.el.querySelector('.ps-force__goal')).not.toBeNull();
  });

  it('draws arrows only once their nodes exist, blue for and yellow against', () => {
    const view = createForceFieldView();
    view.update(field(base));
    expect(view.el.querySelectorAll('.ps-force__arrow').length).toBe(0);
    view.update(field([...base, node('f1', 'for:1')]));
    expect(view.el.querySelectorAll('.ps-force__arrow').length).toBe(1);
    expect(view.el.querySelector('[data-region="for"] [data-node="f1"]')).not.toBeNull();
    view.update(field(sample));
    expect(view.el.querySelector('[data-region="against"] [data-node="a1"]')).not.toBeNull();
    expect(view.el.querySelectorAll('.ps-force__arrow').length).toBe(3);
  });

  it('draws unscored arrows faint with no number', () => {
    const view = createForceFieldView();
    view.update(field(sample));
    const item = view.el.querySelector<HTMLElement>('[data-node="f1"]')!;
    expect(item.classList.contains('is-unscored')).toBe(true);
    expect(item.hasAttribute('data-score')).toBe(false);
    expect(item.querySelector('.ps-force__num')!.textContent).toBe('');
  });

  it('orders scored arrows largest first with the score in the head', () => {
    const view = createForceFieldView();
    view.update(field(sample, [snap([2, 4], [5])]));
    expect(ids(view, 'for')).toEqual(['f2', 'f1']);
    const f2 = view.el.querySelector<HTMLElement>('[data-node="f2"]')!;
    expect(f2.dataset.score).toBe('4');
    expect(view.el.querySelector<HTMLElement>('[data-node="f1"]')!.dataset.score).toBe('2');
    expect(f2.classList.contains('is-unscored')).toBe(false);
    expect(f2.querySelector('.ps-force__num')!.textContent).toBe('4');
  });

  it('keeps slot order for equal scores', () => {
    const view = createForceFieldView();
    view.update(field([...base, node('f1', 'for:1'), node('f2', 'for:2'), node('f3', 'for:3'), node('a1', 'against:1')], [snap([3, 5, 3], [1])]));
    expect(ids(view, 'for')).toEqual(['f2', 'f1', 'f3']);
  });

  it('after a snapshot of for [4, 2], the 4 comes first', () => {
    const view = createForceFieldView();
    view.update(field(sample, [snap([4, 2], [5])]));
    const scores = [...view.el.querySelectorAll<HTMLElement>('[data-region="for"] [data-node]')].map((el) => el.dataset.score);
    expect(scores).toEqual(['4', '2']);
  });

  it('shows the totals from the latest snapshot and says which side wins', () => {
    const view = createForceFieldView();
    view.update(field(sample));
    expect(view.el.querySelector('.ps-force__badge')).toBeNull();
    view.update(field(sample, [snap([4, 2], [5])]));
    expect(view.el.querySelector('[data-total="for"] .ps-force__total-value')!.textContent).toBe('6');
    expect(view.el.querySelector('[data-total="against"] .ps-force__total-value')!.textContent).toBe('5');
    expect(view.el.querySelector('.ps-force__badge')!.textContent).toBe('Drivers outweigh restrainers');
    view.update(field(sample, [snap([4, 2], [5]), snap([2, 3], [5], 'b')]));
    expect(view.el.querySelector('.ps-force__badge')!.textContent).toBe('Restrainers hold');
  });

  it('offers scoring only once each side has a force', () => {
    const view = createForceFieldView();
    view.update(field([...base, node('f1', 'for:1')]));
    expect(view.el.querySelector('.ps-force__score')).toBeNull();
    view.update(field(sample));
    expect(view.el.querySelector('.ps-force__score')!.textContent).toBe('Score the forces');
  });

  it('submits one 1 to 5 score per force in slot order', () => {
    const view = createForceFieldView();
    const got: unknown[] = [];
    view.onScore((scores) => got.push(scores));
    view.update(field(sample, [snap([2, 4], [5])]));
    view.el.querySelector<HTMLButtonElement>('.ps-force__score')!.click();
    const form = view.el.querySelector<HTMLFormElement>('.ps-force__form')!;
    expect(form.hidden).toBe(false);
    const ranges = [...form.querySelectorAll<HTMLInputElement>('input[name="for"]')];
    expect(ranges.map((input) => [input.min, input.max])).toEqual([['1', '5'], ['1', '5']]);
    expect(ranges.map((input) => input.value)).toEqual(['2', '4']);
    ranges[0].value = '5';
    submit(form);
    expect(got).toEqual([{ for: [5, 4], against: [5] }]);
    expect(form.hidden).toBe(true);
  });

  it('starts an unscored force at the middle score', () => {
    const view = createForceFieldView();
    const got: unknown[] = [];
    view.onScore((scores) => got.push(scores));
    view.update(field(sample));
    view.el.querySelector<HTMLButtonElement>('.ps-force__score')!.click();
    submit(view.el.querySelector<HTMLFormElement>('.ps-force__form')!);
    expect(got).toEqual([{ for: [3, 3], against: [3] }]);
  });

  it('updates the scores on a second snapshot without replacing the arrows', () => {
    const view = createForceFieldView();
    view.update(field(sample, [snap([4, 2], [5])]));
    const f1 = view.el.querySelector('[data-node="f1"]');
    const f2 = view.el.querySelector('[data-node="f2"]');
    view.update(field(sample, [snap([4, 2], [5]), snap([1, 5], [3], 'b')]));
    expect(view.el.querySelector('[data-node="f1"]')).toBe(f1);
    expect(view.el.querySelector('[data-node="f2"]')).toBe(f2);
    expect((f1 as HTMLElement).dataset.score).toBe('1');
    expect((f2 as HTMLElement).dataset.score).toBe('5');
    expect(ids(view, 'for')).toEqual(['f2', 'f1']);
    expect(view.el.querySelector('[data-total="for"] .ps-force__total-value')!.textContent).toBe('6');
  });

  it('leaves a force added after scoring unscored until the next snapshot', () => {
    const view = createForceFieldView();
    view.update(field([...sample, node('f3', 'for:3')], [snap([4, 2], [5])]));
    const f3 = view.el.querySelector<HTMLElement>('[data-node="f3"]')!;
    expect(f3.classList.contains('is-unscored')).toBe(true);
    expect(ids(view, 'for')).toEqual(['f1', 'f2', 'f3']);
  });
});
