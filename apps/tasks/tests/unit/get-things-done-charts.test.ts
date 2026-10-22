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
