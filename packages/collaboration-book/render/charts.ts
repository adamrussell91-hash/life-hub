// packages/collaboration-book/render/charts.ts
// Which chart draws a Collaboration Book run. Agree's experiment and Review's review (families
// `commit` and `review`) are the Collaboration Book's own; every model, the two variants
// included, is a Decision Book family chart (decision-book/render/charts.ts). All of them are
// re-skinned by .cb-scope (collaboration-book.css).
import { TOOLS } from '../../problem-solver/tools/index.mjs';
import { type RunChart, createChartForTool as createBookChart } from '../../decision-book/render/charts';
import { createStepView } from './commit';
import { createReviewView } from './review';

type CollabTool = { id: string; family?: string };

/** The chart for a Collaboration Book tool definition, or null when it has none. */
export function createCollabChartForTool(tool: CollabTool, doc: Document = document): RunChart | null {
  if (tool.family === 'commit') return createStepView(doc) as unknown as RunChart;
  if (tool.family === 'review') return createReviewView(doc) as unknown as RunChart;
  return createBookChart(tool);
}

/** The chart for a run, looked up through the shared tool registry. */
export function createCollabChartForRun(run: { tool: string }, doc: Document = document): RunChart | null {
  const tool = (TOOLS as unknown as Record<string, CollabTool>)[run.tool];
  return tool ? createCollabChartForTool(tool, doc) : null;
}
