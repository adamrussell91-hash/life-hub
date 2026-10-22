// Gear Shifter's chart changes (Plan 2): dated zero-min scales, the ratings chart, the Kanban
// and 5 Whys variants, and the chart lookup. Samples: packages/get-things-done/fixtures.mjs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GT_SAMPLE_TOOLS, gtRunFor } from '../../../../packages/get-things-done/fixtures.mjs';
import { createScalesView, radarPoints } from '../../../../packages/decision-book/render/scales';
import type { DmToolRun } from '../../../../packages/decision-book/render/core';

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
  document.body.replaceChildren();
});

type Key = keyof typeof GT_SAMPLE_TOOLS;
const tool = (key: Key) => GT_SAMPLE_TOOLS[key] as never;
const run = (key: Key, stage: 'empty' | 'partial' | 'full') => gtRunFor(key, stage) as DmToolRun;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((node) => node.textContent);

describe('scales with min 0 and dated snapshots', () => {
  it('lets the form go down to 0', () => {
    const view = createScalesView(tool('needs'));
    view.update(run('needs', 'empty'));
    for (const input of view.el.querySelectorAll<HTMLInputElement>('.dm-scales__input')) expect(input.min).toBe('0');
  });

  it('overlays the latest three saves, newest solid, each labelled by its date', () => {
    const view = createScalesView(tool('needs'));
    view.update(run('needs', 'full'));
    const polys = [...view.el.querySelectorAll('.dm-scales__poly')];
    expect(polys.map((p) => p.getAttribute('data-style'))).toEqual(['solid', 'outline', 'dotted']);
    expect(polys[0].getAttribute('points')).toBe(radarPoints([6, 4, 0]));
    expect(polys[2].getAttribute('points')).toBe(radarPoints([7, 3, 5]));
    expect(texts(view.el, '.dm-scales__legend-item')).toEqual(['8 Oct', '1 Oct', '24 Sep']);
    const bars = [...view.el.querySelectorAll<HTMLElement>('[data-scale="thanks"] .dm-scales__bar')];
    expect(bars.map((bar) => bar.title)).toEqual(['8 Oct: 0 of 10', '1 Oct: 3 of 10', '24 Sep: 5 of 10']);
  });

  it('draws one save alone and says when nothing is saved yet', () => {
    const view = createScalesView(tool('needs'));
    view.update(run('needs', 'empty'));
    expect(texts(view.el, '.dm-scales__legend-item')).toEqual(['Not scored yet']);
    view.update(run('needs', 'partial'));
    expect(texts(view.el, '.dm-scales__legend-item')).toEqual(['8 Oct']);
    expect(view.el.querySelectorAll('.dm-scales__poly[points=""]').length).toBe(2);
  });

  it('saves a new dated snapshot through the one form', () => {
    const view = createScalesView(tool('needs'));
    const saved: unknown[] = [];
    view.onScore((payload) => saved.push(payload));
    view.update(run('needs', 'empty'));
    const inputs = [...view.el.querySelectorAll<HTMLInputElement>('.dm-scales__input')];
    expect(inputs.length).toBe(3);
    inputs.forEach((input, i) => (input.value = String(i * 2)));
    view.el.querySelector<HTMLButtonElement>('.dm-scales__save')!.click();
    expect(saved).toEqual([{ series: 'now', values: { order: 0, novelty: 2, thanks: 4 } }]);
  });
});

// ---------------------------------------------------------------- ratings
import { createRatingsView, statWords } from '../../../../packages/decision-book/render/ratings';

describe('ratings chart', () => {
  const view = () => {
    const v = createRatingsView(tool('ratings'));
    document.body.append(v.el);
    return v;
  };
  const cell = (root: Element, idea: string, criterion: string) => root.querySelector(`.dm-ratings__row[data-idea="${idea}"] .dm-ratings__cell[data-criterion="${criterion}"]`)!;
  const pooled = (root: Element, idea: string) => root.querySelector(`.dm-ratings__row[data-idea="${idea}"] .dm-ratings__cell--all`)!;

  it('says Empty for an empty run and draws its table frame', () => {
    const v = view();
    v.update(run('ratings', 'empty'));
    expect(v.el.querySelector('.dm-chart__state')!.textContent).toBe('Empty');
    expect(v.el.querySelector('[role="table"]')).not.toBeNull();
    expect(v.el.querySelectorAll('.dm-entry').length).toBe(0);
    expect((v.el.querySelector('.dm-ratings__form') as HTMLElement).hidden).toBe(true);
  });

  it('draws one row per idea in slot order, never sorted by mean, with no winner mark', () => {
    const v = view();
    v.update(run('ratings', 'full'));
    const order = [...v.el.querySelectorAll('.dm-ratings__row[data-idea]')].map((row) => row.getAttribute('data-idea'));
    expect(order).toEqual(['idea1', 'idea2', 'idea3']);
    expect(v.el.querySelectorAll('[role="row"]').length).toBe(4);
    expect(v.el.querySelectorAll('[role="columnheader"]').length).toBe(4);
    expect(v.el.innerHTML).not.toMatch(/winner|best idea|total/i);
    expect(v.el.querySelector('.dm-ratings__note')!.textContent).toMatch(/Raters weigh equally.*nothing here is ranked for you/);
  });

  it('labels every spread as a sample SD with its n, pooled across raters too', () => {
    const v = view();
    v.update(run('ratings', 'full'));
    expect(cell(v.el, 'idea1', 'criterion1').textContent).toBe('Cost to runMean 6.0Sample SD 2.0n = 3');
    expect(pooled(v.el, 'idea1').textContent).toMatch(/^All criteriaMean 6\.0Sample SD .*n = 3$/);
  });

  it('shows n/a for the spread of a single rater, and Not scored before anyone scores', () => {
    expect(statWords({ mean: 5, sd: null, n: 1 })).toEqual(['Mean 5.0', 'Sample SD n/a', 'n = 1']);
    expect(statWords({ mean: null, sd: null, n: 0 })[0]).toBe('Not scored');
    const v = view();
    v.update(run('ratings', 'partial'));
    expect(cell(v.el, 'idea2', 'criterion2').textContent).toBe('People reachedMean 9.0Sample SD n/an = 1');
  });

  it('lists each rater with their mean and their own ranking', () => {
    const v = view();
    v.update(run('ratings', 'partial'));
    const metas = texts(v.el, '.dm-ratings__rater-meta');
    expect(metas[0]).toBe('Mean 5.8 · Ranks: Saturday stall, Swap shelf in the hall, Lunch club');
    expect(metas.slice(1)).toEqual(['Not scored yet', 'Not scored yet']);
    v.update(run('ratings', 'full'));
    expect(texts(v.el, '.dm-ratings__rater-meta')[2]).toBe('Mean 5.3 · Ranks: Swap shelf in the hall, Lunch club, Saturday stall');
  });

  it('draws the recommendation and the decision owner as entries, the owner named', () => {
    const v = view();
    v.update(run('ratings', 'full'));
    expect(v.el.querySelector('.dm-ratings__box--owner .dm-entry__title')!.textContent).toBe('Ines');
    expect(v.el.querySelector('.dm-ratings__box:not(.dm-ratings__box--owner) .dm-entry')).not.toBeNull();
    for (const id of ['idea1', 'criterion2', 'rater3', 'rec', 'own']) expect(v.el.querySelector(`.dm-entry[data-node="${id}"]`), id).not.toBeNull();
  });

  it('scores through its own form: choose a rater, fill the grid and ranks, Save sends one snapshot', () => {
    const v = view();
    const sent: unknown[] = [];
    v.onScore((payload) => sent.push(payload));
    v.update(run('ratings', 'partial'));
    const select = v.el.querySelector<HTMLSelectElement>('.dm-ratings__select')!;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Ines', 'Tomas', 'Wren']);
    select.value = 'rater2';
    select.dispatchEvent(new Event('change'));
    const inputs = [...v.el.querySelectorAll<HTMLInputElement>('.dm-ratings__input:not(.dm-ratings__rank)')];
    expect(inputs.length).toBe(6);
    expect(inputs.every((input) => input.value === '')).toBe(true);
    inputs.forEach((input, i) => (input.value = String(i + 1)));
    const ranks = [...v.el.querySelectorAll<HTMLInputElement>('.dm-ratings__rank')];
    ranks[0].value = '1';
    ranks[1].value = '1';
    ranks[2].value = '3';
    const save = v.el.querySelector<HTMLButtonElement>('.dm-ratings__save')!;
    save.click();
    expect(sent).toEqual([]);
    expect(v.el.querySelector('.dm-ratings__status')!.textContent).toBe('Give each idea a different rank from 1 to 3.');
    ranks[0].value = '3';
    ranks[1].value = '1';
    ranks[2].value = '2';
    save.click();
    expect(sent).toEqual([{ rater: 'rater2', scores: { idea1: { criterion1: 1, criterion2: 2 }, idea2: { criterion1: 3, criterion2: 4 }, idea3: { criterion1: 5, criterion2: 6 } }, ranking: ['idea2', 'idea3', 'idea1'] }]);
  });

  it('prefills the form from the chosen rater\'s latest snapshot', () => {
    const v = view();
    v.update(run('ratings', 'full'));
    const select = v.el.querySelector<HTMLSelectElement>('.dm-ratings__select')!;
    select.value = 'rater3';
    select.dispatchEvent(new Event('change'));
    const inputs = [...v.el.querySelectorAll<HTMLInputElement>('.dm-ratings__input:not(.dm-ratings__rank)')];
    expect(inputs.map((i) => i.value)).toEqual(['8', '7', '2', '3', '6', '6']);
    expect([...v.el.querySelectorAll<HTMLInputElement>('.dm-ratings__rank')].map((i) => i.value)).toEqual(['1', '3', '2']);
  });

  it('keeps element identity across updates and says Completed once done', () => {
    const v = view();
    v.update(run('ratings', 'partial'));
    const before = v.el.querySelector('.dm-entry[data-node="idea2"]');
    const row = v.el.querySelector('.dm-ratings__row[data-idea="idea2"]');
    v.update(run('ratings', 'full'));
    expect(v.el.querySelector('.dm-entry[data-node="idea2"]')).toBe(before);
    expect(v.el.querySelector('.dm-ratings__row[data-idea="idea2"]')).toBe(row);
    v.update({ ...run('ratings', 'full'), status: 'done' });
    expect(v.el.querySelector('.dm-chart__state')!.textContent).toBe('Completed');
  });
});

// ---------------------------------------------------------------- Kanban and 5 Whys variants
import { createKanbanView } from '../../../../packages/problem-solver/render/kanban';
import { createFiveWhysView } from '../../../../packages/problem-solver/render/five-whys';
import type { PsToolRun } from '../../../../packages/problem-solver/types';

const psRun = (key: Key, stage: 'empty' | 'partial' | 'full') => gtRunFor(key, stage) as unknown as PsToolRun;
const variant = () => {
  const def = GT_SAMPLE_TOOLS.kanban as unknown as { nodeTags: { card: string[] }; suggestedWip: number };
  return createKanbanView(document, { columns: def.nodeTags.card as never, suggestedWip: def.suggestedWip, cardFields: true });
};

describe('Kanban variant', () => {
  it('draws To do, Doing and Done with no Review stop', () => {
    const view = variant();
    view.update(psRun('kanban', 'full'));
    expect([...view.el.querySelectorAll('[data-region]')].map((r) => r.getAttribute('data-region'))).toEqual(['todo', 'doing', 'done']);
    expect(view.el.querySelector('.ps-kanban__review')).toBeNull();
  });

  it('keeps Problem Solver\'s board, Review stop and all, by default', () => {
    const view = createKanbanView();
    view.update({ id: 'r', tool: 'kanban', status: 'active', edges: [], nodes: [{ id: 'a', slot: 'card:1', text: 'A', tag: 'review', state: 'accepted', skills: [], turnId: 't' }] });
    expect([...view.el.querySelectorAll('[data-region]')].map((r) => r.getAttribute('data-region'))).toEqual(['todo', 'doing', 'review', 'done']);
    expect(view.el.querySelector('.ps-kanban__suggested')).toBeNull();
    expect(view.el.querySelector('.ps-kanban__fields-form')).toBeNull();
  });

  it('suggests a limit of three until one is set, and says when Doing is over it', () => {
    const view = variant();
    view.update(psRun('kanban', 'partial'));
    expect(view.el.querySelector('.ps-kanban__suggested')!.textContent).toBe('Suggested limit 3');
    view.update(psRun('kanban', 'full'));
    expect(view.el.querySelector('.ps-kanban__suggested')!.textContent).toBe('Suggested limit 3');
    const over = psRun('kanban', 'full');
    over.nodes = over.nodes.map((n) => (n.id === 'k1' ? { ...n, tag: 'doing' } : n));
    view.update(over);
    const badge = view.el.querySelector('.ps-kanban__suggested')!;
    expect(badge.textContent).toBe('Over suggested limit (4 of 3)');
    expect(badge.classList.contains('is-over')).toBe(true);
    const wip = { id: 'w', slot: 'wip', text: 'Two at most', title: 'Two', tag: undefined, state: 'accepted' as const, skills: [], turnId: 't' };
    view.update({ ...over, nodes: [...over.nodes, wip] });
    expect(view.el.querySelector('.ps-kanban__suggested')).toBeNull();
    expect(view.el.querySelector('.ps-kanban__wip')).not.toBeNull();
  });

  it('shows each card\'s effort, help and urgency, and sets them through its form', () => {
    const view = variant();
    const sent: unknown[] = [];
    view.onScore((payload) => sent.push(payload));
    view.update(psRun('kanban', 'full'));
    const fields = (id: string) => view.el.querySelector(`.ps-kanban__card[data-node="${id}"] .ps-kanban__fields`)!;
    expect(fields('k2').textContent).toBe('Small · Alone · Now');
    expect(fields('k3').textContent).toBe('Large · Needs help · Soon');
    expect((fields('k1') as HTMLElement).hidden).toBe(true);
    expect(view.el.querySelector(`.ps-kanban__card[data-node="k3"] button`)!.getAttribute('aria-label')).toContain('Large, Needs help, Soon');
    const form = view.el.querySelector('.ps-kanban__fields-form')!;
    const [card, effort, help, urgency] = [...form.querySelectorAll('select')];
    expect([...card.options].map((o) => o.textContent)).toEqual(['Book the hall', 'Draft the flyer', 'Ask the school', 'Order chairs', 'Find a float']);
    card.value = 'k1';
    card.dispatchEvent(new Event('change'));
    effort.value = 'medium';
    help.value = 'needs_help';
    urgency.value = 'later';
    form.querySelector<HTMLButtonElement>('button')!.click();
    expect(sent).toEqual([{ card: 'k1', effort: 'medium', help: 'needs_help', urgency: 'later' }]);
  });
});

describe('5 Whys variant', () => {
  it('draws each why\'s evidence right after it, as a note', () => {
    const view = createFiveWhysView();
    view.update(psRun('fiveWhys', 'full'));
    const items = [...view.el.querySelectorAll('.ps-whys__item')];
    expect(items.map((i) => i.getAttribute('data-node'))).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6']);
    expect(items[2].classList.contains('ps-whys__item--evidence')).toBe(true);
    expect(items[2].querySelector('.ps-whys__shape')!.getAttribute('aria-label')).toBe('Evidence for why 1: Three of us said a different. Show details');
    expect(items[2].querySelector('svg')).toBeNull();
  });
});

// ---------------------------------------------------------------- chart lookup
import { createGearChartForTool } from '../../../../packages/get-things-done/render/charts';
import { SAMPLE_TOOLS } from '../../../../packages/decision-book/fixtures.mjs';

describe('Gear Shifter chart lookup', () => {
  const chart = (def: unknown) => createGearChartForTool(def as never)!.el;
  it('draws the variants with Problem Solver\'s renderers and the variant\'s options', () => {
    const board = createGearChartForTool(GT_SAMPLE_TOOLS.kanban as never)!;
    board.update(psRun('kanban', 'full') as never);
    expect(board.el.classList.contains('ps-kanban')).toBe(true);
    expect(board.el.querySelector('.ps-kanban__review')).toBeNull();
    expect(board.el.querySelector('.ps-kanban__fields-form')).not.toBeNull();
    expect(chart(GT_SAMPLE_TOOLS.fiveWhys).classList.contains('ps-whys')).toBe(true);
  });
  it('draws ratings and every shared family through Decision Maker\'s charts', () => {
    expect(chart(GT_SAMPLE_TOOLS.ratings).classList.contains('dm-chart--ratings')).toBe(true);
    expect(chart(GT_SAMPLE_TOOLS.needs).classList.contains('dm-chart--scales')).toBe(true);
    for (const [key, family] of [['quadrant', 'quadrant'], ['curve', 'curve'], ['stages', 'path'], ['list', 'list']] as const) expect(chart(SAMPLE_TOOLS[key]).classList.contains(`dm-chart--${family}`), key).toBe(true);
  });
});
