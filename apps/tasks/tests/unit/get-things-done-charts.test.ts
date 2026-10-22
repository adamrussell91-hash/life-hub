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
