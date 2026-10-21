// Builds the right chart for each sample key, so one contract suite covers every renderer.
// Task 3 replaces this file with the full map.
import { SAMPLE_TOOLS } from '../../../../../packages/decision-book/fixtures.mjs';
import type { ChartView } from '../../../../../packages/decision-book/render/core';
import { createQuadrantView } from '../../../../../packages/decision-book/render/quadrant';

type SampleTool = { id: string; family: string };
const TOOLS = SAMPLE_TOOLS as unknown as Record<string, SampleTool>;

/** Sample keys whose chart exists so far. */
export const CHARTS: string[] = Object.keys(TOOLS).filter((key) => TOOLS[key].family === 'quadrant');

export function createChartFor(key: string): ChartView {
  return createQuadrantView(TOOLS[key] as never);
}
