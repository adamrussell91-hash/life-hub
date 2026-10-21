// What each Decision Book family chart draws beyond the shared contract.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChartFor } from './helpers/decision-book-charts';
import { runFor, SAMPLE_TOOLS, sampleNode, sampleRun } from '../../../../packages/decision-book/fixtures.mjs';
import { createRecordView, reviewWords } from '../../../../packages/decision-book/render/record';
import { pct } from '../../../../packages/decision-book/render/plot';
import { radarPoints } from '../../../../packages/decision-book/render/scales';
import { curvePath } from '../../../../packages/decision-book/render/curve';
import { NINE_DOT_ANSWER } from '../../../../packages/decision-book/render/outside-box';
import { createListView } from '../../../../packages/decision-book/render/list';
import type { DmToolRun } from '../../../../packages/decision-book/render/core';

afterEach(() => document.body.replaceChildren());
const run = (key: string, stage: 'empty' | 'partial' | 'full') => runFor(key, stage) as DmToolRun;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((e) => e.textContent);
const entryIn = (root: Element, host: string, id: string) => root.querySelector(`${host} .dm-entry[data-node="${id}"]`);

describe('quadrant', () => {
  it('puts each cell at its col and row, with its place on both axes in words', () => {
    const view = createChartFor('quadrant');
    view.update(run('quadrant', 'full'));
    const cell = (id: string) => view.el.querySelector<HTMLElement>(`[data-cell="${id}"]`)!;
    expect([cell('big_bet').style.gridColumn, cell('big_bet').style.gridRow]).toEqual(['2', '1']);
    expect(cell('quick_win').querySelector('.dm-quad__axes')!.textContent).toBe('High value · Low effort');
    expect(cell('drain').getAttribute('data-fill')).toBe('ink');
    expect(entryIn(view.el, '[data-cell="drain"]', 'q4')).not.toBeNull();
    expect(texts(view.el, '.dm-quad__y span')).toEqual(['High value', 'Value', 'Low value']);
    expect(texts(view.el, '.dm-quad__x span')).toEqual(['Low effort', 'Effort', 'High effort']);
  });

  it('moves an item to its new cell as the same element', () => {
    const view = createChartFor('quadrant');
    const full = run('quadrant', 'full');
    view.update(full);
    const item = view.el.querySelector('.dm-entry[data-node="q3"]');
    view.update({ ...full, nodes: full.nodes.map((n) => (n.id === 'q3' ? { ...n, tag: 'big_bet' } : n)) });
    expect(entryIn(view.el, '[data-cell="big_bet"]', 'q3')).toBe(item);
  });

  it('puts the reflection under the frame', () => {
    const view = createChartFor('quadrant');
    view.update(run('quadrant', 'full'));
    expect(entryIn(view.el, '.dm-chart__reflection', 'q5')).not.toBeNull();
  });
});

describe('plot', () => {
  it('places points by their merged positions and keeps the rest in the tray', () => {
    const view = createChartFor('plot');
    const partial = { ...run('plot', 'partial'), scores: { snapshots: [{ at: 'x', points: { p1: { x: 1, y: 10, size: 6 } } }] } };
    view.update(partial);
    const p1 = view.el.querySelector<HTMLElement>('.dm-plot__field .dm-entry[data-node="p1"]')!;
    expect(p1.style.left).toBe(`${pct(1)}%`);
    expect(p1.style.bottom).toBe(`${pct(10)}%`);
    expect(p1.style.getPropertyValue('--dm-size')).toBe('6');
    expect(entryIn(view.el, '.dm-plot__tray', 'p2')).not.toBeNull();
    expect(texts(view.el, '.dm-plot__key-item')).toEqual(['Night class: Cost 1, Joy 10, time it takes 6', 'Weekend trip: not placed yet']);
  });

  it('sends a placement from the form', () => {
    const view = createChartFor('plot');
    const sent: unknown[] = [];
    view.onScore((scores) => sent.push(scores));
    view.update(run('plot', 'partial'));
    const row = view.el.querySelectorAll('.dm-plot__row')[1];
    const [x, y, size] = [...row.querySelectorAll('select')];
    x.value = '2';
    y.value = '9';
    size.value = '5';
    row.querySelector<HTMLButtonElement>('.dm-plot__place')!.click();
    expect(sent).toEqual([{ points: { p2: { x: 2, y: 9, size: 5 } } }]);
  });

  it('draws the band from its 1–10 bounds', () => {
    const view = createChartFor('plot');
    view.update(run('plot', 'empty'));
    const band = view.el.querySelector<HTMLElement>('.dm-plot__band')!;
    expect(band.textContent).toBe('Sweet spot');
    expect(band.style.left).toBe(`${pct(1)}%`);
    expect(band.style.height).toBe(`${pct(10) - pct(6)}%`);
  });
});

describe('scales', () => {
  it('pairs: a bar per series at the low pole share, each in its own line style', () => {
    const view = createChartFor('scales');
    view.update(run('scales', 'full'));
    const bars = [...view.el.querySelectorAll<HTMLElement>('[data-scale="pace"] .dm-scales__bar')];
    expect(bars.map((b) => [b.getAttribute('data-style'), b.style.width])).toEqual([['solid', '20%'], ['outline', '50%']]);
    expect(bars[0].title).toBe('Now: Slow 2, Fast 8');
    expect(entryIn(view.el, '[data-scale="company"]', 's2')).not.toBeNull();
  });

  it('sends a series from its form', () => {
    const view = createChartFor('scales');
    const sent: unknown[] = [];
    view.onScore((scores) => sent.push(scores));
    view.update(run('scales', 'empty'));
    const form = view.el.querySelectorAll('.dm-scales__series-form')[1];
    const inputs = [...form.querySelectorAll('input')];
    inputs.forEach((input, i) => (input.value = String(i + 3)));
    form.querySelector<HTMLButtonElement>('.dm-scales__save')!.click();
    expect(sent).toEqual([{ series: 'wanted', values: { pace: 3, scope: 4, company: 5 } }]);
  });

  it('radar: one polygon per series from the scores', () => {
    const view = createChartFor('radar');
    view.update(run('radar', 'full'));
    expect(view.el.querySelector('.dm-scales__poly')!.getAttribute('points')).toBe(radarPoints([6, 7, 5, 3]));
    expect(radarPoints([10, 10, 10, 10]).split(' ')[0]).toBe('50.0,8.0');
  });

  it('radar: axis names around the rings, starting at the top; its rows keep the notes', () => {
    const view = createChartFor('radar');
    view.update(run('radar', 'full'));
    const labels = [...view.el.querySelectorAll<HTMLElement>('.dm-scales__radar-label')];
    expect(labels.map((l) => l.textContent)).toEqual(['Calm', 'Focus', 'Energy', 'Sleep']);
    expect([labels[0].style.left, labels[0].style.top]).toEqual(['50.0%', '1.0%']);
    expect(view.el.querySelector('.dm-scales__rows')!.getAttribute('data-layout')).toBe('radar');
    expect(entryIn(view.el, '[data-scale="sleep"]', 'r1')).not.toBeNull();
  });

  it('a run with scores and no nodes says In progress', () => {
    const view = createChartFor('radar');
    view.update({ ...run('radar', 'full'), nodes: [] });
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('In progress');
  });

  it('shares: a bar cut into its parts, with a live total in the form', () => {
    const view = createChartFor('shares');
    view.update(run('shares', 'full'));
    expect(texts(view.el, '.dm-scales__part')).toEqual(['Work 60%', 'Home 30%', 'Play 10%']);
    const inputs = [...view.el.querySelectorAll<HTMLInputElement>('.dm-scales__series-form input')];
    inputs[0].value = '50';
    inputs[0].dispatchEvent(new Event('input'));
    expect(view.el.querySelector('.dm-scales__total')!.textContent).toBe('Total 90 of 100');
  });
});

describe('curve', () => {
  it('draws the line from its shape and puts the marker on it in the chosen region', () => {
    const view = createChartFor('curve');
    view.update(run('curve', 'full'));
    expect(view.el.querySelector('.dm-curve__line')!.getAttribute('d')).toBe(curvePath('u'));
    const marker = view.el.querySelector<SVGCircleElement>('.dm-curve__marker')!;
    expect(marker.style.display).toBe('');
    expect(marker.getAttribute('cx')).toBe('85.00');
    expect(view.el.querySelector('[data-region="many"]')!.classList.contains('is-here')).toBe(true);
    expect(entryIn(view.el, '[data-region="many"]', 'c1')).not.toBeNull();
    expect(texts(view.el, '.dm-curve__region-label')).toEqual(['Too few', 'Enough', 'Too many']);
  });

  it('hides the marker before a position is given, and has no numbers on its axes', () => {
    const view = createChartFor('curve');
    view.update(run('curve', 'empty'));
    expect(view.el.querySelector<SVGCircleElement>('.dm-curve__marker')!.style.display).toBe('none');
    expect(view.el.querySelector('.dm-chart__frame')!.textContent).not.toMatch(/\d/);
  });
});

describe('tension', () => {
  it('pull: forces sit on their side around the centre', () => {
    const view = createChartFor('tension');
    view.update(run('tension', 'full'));
    expect(entryIn(view.el, '.dm-tension__centre', 't1')).not.toBeNull();
    expect(entryIn(view.el, '[data-side="holds"]', 't2')).not.toBeNull();
    expect(entryIn(view.el, '[data-side="pulls"]', 't4')).not.toBeNull();
  });

  it('triangle: fixed corners say Fixed', () => {
    const view = createChartFor('triangle');
    view.update(run('triangle', 'full'));
    const fixed = [...view.el.querySelectorAll('.dm-tension__side')].filter((s) => !s.querySelector<HTMLElement>('.dm-tension__fixed')!.hidden).map((s) => s.getAttribute('data-side'));
    expect(fixed).toEqual(['good', 'cheap']);
    expect(entryIn(view.el, '[data-side="cheap"] .dm-tension__fixes', 'g6')).not.toBeNull();
  });
});

describe('path', () => {
  it('flow: the route taken with Yes and No words, then the end', () => {
    const view = createChartFor('flow');
    view.update(run('flow', 'full'));
    expect([...view.el.querySelectorAll('.dm-path__step')].map((s) => s.getAttribute('data-stage'))).toEqual(['want', 'afford', 'wait']);
    expect(texts(view.el, '.dm-path__chip:not([hidden])')).toEqual(['Yes', 'No']);
  });

  it('flow: the stage being asked says Now; a changed answer reroutes', () => {
    const view = createChartFor('flow');
    const partial = run('flow', 'partial');
    view.update(partial);
    const now = view.el.querySelector('.dm-path__step[data-now="true"]')!;
    expect(now.getAttribute('data-stage')).toBe('afford');
    expect(now.querySelector('.dm-path__chip')!.textContent).toBe('Now');
    view.update({ ...partial, nodes: [{ ...partial.nodes[0], tag: 'no' }] });
    expect([...view.el.querySelectorAll('.dm-path__step')].map((s) => s.getAttribute('data-stage'))).toEqual(['want', 'drop']);
  });

  it('stages: a track per round', () => {
    const view = createChartFor('stages');
    view.update(run('stages', 'full'));
    expect(texts(view.el, '.dm-path__round-label')).toEqual(['Round 1', 'Round 2']);
    expect(view.el.querySelectorAll('.dm-path__round')[1].querySelector('.dm-entry[data-node="a4"]')).not.toBeNull();
  });

  it('layers: holes sit in their layer; an unlinked hole waits below', () => {
    const view = createChartFor('layers');
    const full = run('layers', 'full');
    view.update(full);
    expect(view.el.querySelector('.dm-path__layer .dm-path__holes .dm-entry[data-node="l3"]')).not.toBeNull();
    view.update({ ...full, edges: full.edges.slice(0, 1) });
    expect(entryIn(view.el, '.dm-path__loose', 'l4')).not.toBeNull();
    expect(view.el.querySelector<HTMLElement>('.dm-path__loose')!.hidden).toBe(false);
  });
});

describe('list', () => {
  it('lanes: entries in their group; groups carry their fill in order', () => {
    const view = createChartFor('list');
    view.update(run('list', 'full'));
    expect(view.el.querySelector('.dm-list')!.getAttribute('data-layout')).toBe('lanes');
    expect(entryIn(view.el, '[data-group="stop"]', 'i2')!.getAttribute('data-fill')).toBe('tint');
  });

  it('pyramid: one stack per column, drawn from the top level down', () => {
    const view = createChartFor('pyramid');
    view.update(run('pyramid', 'full'));
    expect(texts(view.el, '.dm-list__column-name')).toEqual(['Then', 'Now']);
    const first = view.el.querySelector('.dm-list__column')!;
    expect([...first.querySelectorAll('.dm-list__group')].map((g) => g.getAttribute('data-group'))).toEqual(['then_top', 'then_base']);
    expect(first.querySelector<HTMLElement>('[data-group="then_base"]')!.style.getPropertyValue('--dm-level')).toBe('0');
  });

  it('checklist: a group says Done once it has an entry', () => {
    const tool = { ...(SAMPLE_TOOLS as Record<string, unknown>).list as object, chart: { layout: 'checklist', groups: [{ id: 'keep', label: 'Keep' }, { id: 'stop', label: 'Stop' }], entry: 'e' } };
    const view = createListView(tool as never);
    view.update(sampleRun('dm_sample_list', [sampleNode('k', 'entry:1', 'Walk', { tag: 'keep' })]) as DmToolRun);
    expect(view.el.querySelector<HTMLElement>('[data-group="keep"] .dm-list__done')!.hidden).toBe(false);
    expect(view.el.querySelector<HTMLElement>('[data-group="stop"] .dm-list__done')!.hidden).toBe(true);
  });
});

describe('the one-offs', () => {
  it('nine dots: the answer is four lines and the toggle shows and hides it', () => {
    expect(NINE_DOT_ANSWER.length - 1).toBe(4);
    const view = createChartFor('outside_box');
    view.update(run('outside_box', 'full'));
    expect(view.el.querySelectorAll('.dm-dots__dot').length).toBe(9);
    const toggle = view.el.querySelector<HTMLButtonElement>('.dm-dots__toggle')!;
    toggle.click();
    expect(view.el.querySelector('.dm-dots')!.classList.contains('is-revealed')).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe('Hide the answer');
  });

  it('black box: a ? until the inside is named', () => {
    const view = createChartFor('black_box');
    view.update(run('black_box', 'partial'));
    expect(view.el.querySelector<HTMLElement>('.dm-box__mark')!.hidden).toBe(false);
    view.update(run('black_box', 'full'));
    expect(view.el.querySelector<HTMLElement>('.dm-box__mark')!.hidden).toBe(true);
    expect(entryIn(view.el, '.dm-box__box', 'b4')).not.toBeNull();
  });
});

describe('decision record', () => {
  it('reads as headline, reasons, an If/then band, first step and review date', () => {
    const view = createRecordView();
    view.update(run('record', 'full'));
    expect(entryIn(view.el, '.dm-record__decision', 'd1')).not.toBeNull();
    expect(entryIn(view.el, '.dm-record__stop .dm-record__if', 'd4')).not.toBeNull();
    expect(entryIn(view.el, '.dm-record__stop .dm-record__then', 'd5')).not.toBeNull();
    expect(view.el.querySelector('.dm-entry[data-node="d7"] .dm-entry__meta')!.textContent).toBe('1 February 2027');
  });

  it('shows what each reason rests on, and keeps the same element when the basis arrives', () => {
    const view = createRecordView();
    view.update(run('record', 'full'));
    const reason = view.el.querySelector('.dm-entry[data-node="d2"]')!;
    view.setBasis({ d2: [{ model: 'Rubber band', title: 'A bigger role' }] });
    expect(view.el.querySelector('.dm-entry[data-node="d2"]')).toBe(reason);
    expect(reason.querySelector('.dm-entry__meta')!.textContent).toBe('Rests on Rubber band: A bigger role');
    expect(reason.querySelector('button')!.getAttribute('aria-label')).toContain('(Rests on Rubber band: A bigger role)');
  });

  it('writes an ISO review date in words and leaves other words alone', () => {
    expect(reviewWords('2027-02-01')).toBe('1 February 2027');
    expect(reviewWords('after the first month')).toBe('after the first month');
  });
});

describe('motion and focus', () => {
  it('keeps focus on a pill that moves', () => {
    const proto = Element.prototype as unknown as { animate?: unknown };
    proto.animate = () => null;
    vi.spyOn(Element.prototype, 'animate').mockImplementation(() => ({ cancel() {} }) as unknown as Animation);
    const view = createChartFor('quadrant');
    document.body.append(view.el);
    const full = run('quadrant', 'full');
    view.update(full);
    const button = view.el.querySelector<HTMLButtonElement>('.dm-entry[data-node="q3"] button')!;
    button.focus();
    view.update({ ...full, nodes: full.nodes.map((n) => (n.id === 'q3' ? { ...n, tag: 'drain' } : n)) });
    expect(document.activeElement).toBe(button);
    delete proto.animate;
    vi.restoreAllMocks();
  });
});
