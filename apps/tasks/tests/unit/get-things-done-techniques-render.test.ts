// Every Gear Shifter technique drawn by its own chart (createGearChartForTool): empty, then
// worked to completion through the real machine, with every node of the run on the chart.
import { describe, expect, it } from 'vitest';
import { GEAR_TOOLS } from '../../../../packages/get-things-done/tools/index.mjs';
import { workThrough } from '../../../../packages/decision-book/work-through.mjs';
import { createGearChartForTool } from '../../../../packages/get-things-done/render/charts';

type Tool = { id: string; family?: string; variantOf?: string };
type Run = { id: string; tool: string; status: string; nodes: { id: string; slot: string }[]; edges: unknown[]; scores?: unknown };
const TOOLS = GEAR_TOOLS as unknown as Record<string, Tool>;

describe.each(Object.keys(TOOLS))('%s', (id) => {
  it('draws its frame empty, then every node of a finished run', () => {
    const view = createGearChartForTool(TOOLS[id] as never)!;
    expect(view, id).not.toBeNull();
    view.update({ id: 'r', tool: id, status: 'active', nodes: [], edges: [] } as never);
    // Problem Solver's Kanban and 5 Whys draw nothing until there is a node, as in Problem Solver.
    if (!TOOLS[id].variantOf) expect(view.el.querySelector('.dm-chart__frame')!.children.length).toBeGreaterThan(0);
    const run = workThrough(id, (slot: string, i: number) => `Answer ${i + 1} for ${slot}`) as Run;
    view.update({ ...run, status: 'done' } as never);
    if (!TOOLS[id].variantOf) expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Completed');
    for (const node of run.nodes) expect(view.el.querySelector(`[data-node="${node.id}"]`), `${id} ${node.slot}`).not.toBeNull();
  });
});

describe('the Transactional Model on the sheet', () => {
  it('labels a worked-through snapshot by its date', () => {
    const view = createGearChartForTool(TOOLS.gt_transactional_model as never)!;
    view.update(workThrough('gt_transactional_model') as never);
    expect(view.el.textContent).toMatch(/1 Oct/);
    expect(view.el.textContent).not.toMatch(/work-through/);
  });
});
