// Every Decision Maker model drawn by its own chart, empty and worked to completion, and the
// chart options Plan 3 adds: dimensions and scales the person names, the diagonal band and the
// inverted pyramid.
import { describe, expect, it } from 'vitest';
import { createChartForTool } from './helpers/decision-book-charts';
import { DECISION_TOOLS } from '../../../../packages/decision-book/models/index.mjs';
import { workThrough } from '../../../../packages/decision-book/work-through.mjs';
import { diagonalBand } from '../../../../packages/decision-book/render/plot';
import type { DmToolRun } from '../../../../packages/decision-book/render/core';

type Tool = { id: string; family: string; chart: Record<string, unknown> };
const TOOLS = DECISION_TOOLS as unknown as Record<string, Tool>;
const empty = (id: string): DmToolRun => ({ id: 'r', tool: id, status: 'active', nodes: [], edges: [] });

describe.each(Object.keys(TOOLS))('%s', (id) => {
  it('draws its frame empty, then every node of a finished run', () => {
    const view = createChartForTool(TOOLS[id]);
    view.update(empty(id));
    expect(view.el.getAttribute('data-state')).toBe('empty');
    expect(view.el.querySelector('.dm-chart__frame')!.children.length).toBeGreaterThan(0);
    const run = workThrough(id, (slot: string, i: number) => `Answer ${i + 1} for ${slot}`) as DmToolRun;
    view.update({ ...run, status: 'done' });
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Completed');
    for (const node of run.nodes) expect(view.el.querySelector(`.dm-entry[data-node="${node.id}"]`), `${id} ${node.slot}`).not.toBeNull();
  });
});

describe('chart options for the models', () => {
  it('gap in the market: axes and the key use the dimensions the person named', () => {
    const view = createChartForTool(TOOLS.dm_gap_in_market);
    const run = workThrough('dm_gap_in_market', (slot: string) => (slot.startsWith('dimension') ? `Dim ${slot.split(':')[1]}` : `Answer for ${slot}`)) as DmToolRun;
    view.update(run);
    const first = view.el.querySelector('.dm-plot__plot')!;
    expect([...first.querySelectorAll('.dm-plot__axis-label')].map((e) => e.textContent)).toEqual(['Dim 2', 'Dim 1']);
    expect(view.el.querySelectorAll('.dm-plot__dims .dm-entry').length).toBe(3);
    expect(view.el.querySelector('.dm-plot__key-item')!.textContent).toMatch(/Dim 1 \d+, Dim 2 \d+/);
  });

  it('flow: the band runs along the diagonal', () => {
    const view = createChartForTool(TOOLS.dm_flow);
    view.update(empty('dm_flow'));
    const band = view.el.querySelector<HTMLElement>('.dm-plot__band--diagonal')!;
    expect(band.textContent).toBe('Flow');
    expect(band.style.clipPath).toBe(diagonalBand(18));
  });

  it('team model: rows, form fields and radar labels use the skills the person named', () => {
    const view = createChartForTool(TOOLS.dm_team);
    const run = workThrough('dm_team', (slot: string) => (slot.startsWith('scale_name') ? `Skill ${slot.split(':')[1]}` : `Answer for ${slot}`)) as DmToolRun;
    view.update(run);
    expect([...view.el.querySelectorAll('.dm-scales__row-label')].map((e) => e.textContent)).toEqual(['Skill 1', 'Skill 2', 'Skill 3', 'Skill 4', 'Skill 5']);
    expect(view.el.querySelector('.dm-scales__field-label')!.textContent).toBe('Skill 1 (1–10)');
    expect(view.el.querySelectorAll('.dm-scales__names .dm-entry').length).toBe(5);
  });

  it('Maslow: needs upright, wants widest at the top', () => {
    const view = createChartForTool(TOOLS.dm_maslow);
    view.update(empty('dm_maslow'));
    const level = (id: string) => view.el.querySelector<HTMLElement>(`[data-group="${id}"]`)!.style.getPropertyValue('--dm-level');
    expect([level('needs_physiological'), level('needs_self')]).toEqual(['0', '4']);
    expect([level('wants_physiological'), level('wants_self')]).toEqual(['4', '0']);
  });
});
