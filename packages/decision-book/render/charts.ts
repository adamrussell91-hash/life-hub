// packages/decision-book/render/charts.ts
// Which chart draws a Decision Maker run: the family renderer named by the tool's `family`,
// the two one-offs by id, the four reused Problem Solver tools by their own renderers (re-skinned
// under .dm-scope), and the decision record. The session canvas and the tests both use this.
import { TOOLS } from '../../problem-solver/tools/index.mjs';
import { RECORD_ID } from '../record-slots.mjs';
import { createQuadrantView } from './quadrant';
import { createPlotView } from './plot';
import { createScalesView } from './scales';
import { createCurveView } from './curve';
import { createTensionView } from './tension';
import { createPathView } from './path';
import { createListView } from './list';
import { createRatingsView } from './ratings';
import { createOutsideBoxView } from './outside-box';
import { createBlackBoxView } from './black-box';
import { createRecordView } from './record';
import { createSwotView } from '../../problem-solver/render/swot';
import { createParetoView } from '../../problem-solver/render/pareto';
import { createMorphologicalView } from '../../problem-solver/render/morphological';
import { createDoubleLoopView } from '../../problem-solver/render/double-loop';

/** What the canvas needs of any chart: its element and a way to redraw from a run. */
export type RunChart = { el: HTMLElement; update(run: never): void; destroy?(): void };

type ToolLike = { id: string; family?: string };

const BY_FAMILY: Record<string, (tool: never) => RunChart> = {
  quadrant: createQuadrantView,
  plot: createPlotView,
  scales: createScalesView,
  curve: createCurveView,
  tension: createTensionView,
  path: createPathView,
  list: createListView,
  ratings: createRatingsView
};

const BY_ID: Record<string, (tool: never) => RunChart> = {
  dm_outside_box: createOutsideBoxView,
  dm_black_box: createBlackBoxView,
  swot: () => createSwotView(),
  pareto: () => createParetoView(),
  morphological: () => createMorphologicalView(),
  double_loop: () => createDoubleLoopView(),
  [RECORD_ID]: () => createRecordView()
};

/** The chart for a tool definition, or null when Decision Maker has none for it. */
export function createChartForTool(tool: ToolLike): RunChart | null {
  const make = BY_ID[tool.id] ?? (tool.family ? BY_FAMILY[tool.family] : undefined);
  return make ? make(tool as never) : null;
}

/** The chart for a run, looked up through the shared tool registry. */
export function createChartForRun(run: { tool: string }): RunChart | null {
  const tool = (TOOLS as Record<string, ToolLike>)[run.tool] ?? (run.tool === RECORD_ID ? { id: RECORD_ID } : null);
  return tool ? createChartForTool(tool) : null;
}
