// Builds the right chart for each sample key, so one contract suite covers every renderer.
import { SAMPLE_TOOLS } from '../../../../../packages/decision-book/fixtures.mjs';
import type { ChartView } from '../../../../../packages/decision-book/render/core';
import { createChartForTool as chartFor } from '../../../../../packages/decision-book/render/charts';
import { createRecordView } from '../../../../../packages/decision-book/render/record';

type SampleTool = { id: string; family: string };
const TOOLS = SAMPLE_TOOLS as unknown as Record<string, SampleTool>;

/** Every sample key, plus the decision record. */
export const CHARTS: string[] = [...Object.keys(TOOLS), 'record'];

export function createChartFor(key: string): ChartView {
  if (key === 'record') return createRecordView();
  return createChartForTool(TOOLS[key]);
}

/** The chart for any Decision Book tool definition: the canvas's own choice (render/charts.ts). */
export function createChartForTool(tool: SampleTool): ChartView {
  return chartFor(tool) as unknown as ChartView;
}
