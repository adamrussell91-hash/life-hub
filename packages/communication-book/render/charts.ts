// packages/communication-book/render/charts.ts
// Which chart draws a Communication Book run. Commit's next conversation and Review's review
// (families `commit` and `review`) are the Communication Book's own; every model, the variant
// included, is a Decision Book family chart (decision-book/render/charts.ts). All of them are
// re-skinned by .cmb-scope (communication-book.css).
import { TOOLS } from '../../problem-solver/tools/index.mjs';
import { type RunChart, createChartForTool as createBookChart } from '../../decision-book/render/charts';
import { createStepView } from './commit';
import { createReviewView } from './review';

type CommTool = { id: string; family?: string };

/** The chart for a Communication Book tool definition, or null when it has none. */
export function createCommChartForTool(tool: CommTool, doc: Document = document): RunChart | null {
  if (tool.family === 'commit') return createStepView(doc) as unknown as RunChart;
  if (tool.family === 'review') return createReviewView(doc) as unknown as RunChart;
  return createBookChart(tool);
}

/** The chart for a run, looked up through the shared tool registry. */
export function createCommChartForRun(run: { tool: string }, doc: Document = document): RunChart | null {
  const tool = (TOOLS as unknown as Record<string, CommTool>)[run.tool];
  return tool ? createCommChartForTool(tool, doc) : null;
}
