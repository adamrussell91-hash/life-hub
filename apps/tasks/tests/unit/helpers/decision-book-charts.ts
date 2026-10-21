// Builds the right chart for each sample key, so one contract suite covers every renderer.
import { SAMPLE_TOOLS } from '../../../../../packages/decision-book/fixtures.mjs';
import type { ChartView } from '../../../../../packages/decision-book/render/core';
import { createQuadrantView } from '../../../../../packages/decision-book/render/quadrant';
import { createPlotView } from '../../../../../packages/decision-book/render/plot';
import { createScalesView } from '../../../../../packages/decision-book/render/scales';
import { createCurveView } from '../../../../../packages/decision-book/render/curve';
import { createTensionView } from '../../../../../packages/decision-book/render/tension';
import { createPathView } from '../../../../../packages/decision-book/render/path';
import { createListView } from '../../../../../packages/decision-book/render/list';
import { createOutsideBoxView } from '../../../../../packages/decision-book/render/outside-box';
import { createBlackBoxView } from '../../../../../packages/decision-book/render/black-box';
import { createRecordView } from '../../../../../packages/decision-book/render/record';

type SampleTool = { id: string; family: string };
const TOOLS = SAMPLE_TOOLS as unknown as Record<string, SampleTool>;
const BY_FAMILY: Record<string, (tool: never) => ChartView> = {
  quadrant: createQuadrantView,
  plot: createPlotView,
  scales: createScalesView,
  curve: createCurveView,
  tension: createTensionView,
  path: createPathView,
  list: createListView
};
const BY_ID: Record<string, (tool: never) => ChartView> = {
  dm_outside_box: createOutsideBoxView,
  dm_black_box: createBlackBoxView
};

/** Every sample key, plus the decision record. */
export const CHARTS: string[] = [...Object.keys(TOOLS), 'record'];

export function createChartFor(key: string): ChartView {
  if (key === 'record') return createRecordView();
  const tool = TOOLS[key];
  const make = BY_ID[tool.id] ?? BY_FAMILY[tool.family];
  return make(tool as never);
}
