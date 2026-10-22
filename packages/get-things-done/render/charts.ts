// packages/get-things-done/render/charts.ts
// Which chart draws a Gear Shifter run. The two Problem Solver variants (Kanban and 5 Whys)
// take their own renderers with the variant's options; Commit's experiment and Review's
// experiment review (families `commit` and `review`) are Gear Shifter's own; everything else,
// the ratings family included, is a Decision Book family chart (decision-book/render/charts.ts).
// All of them are re-skinned by .gt-scope (get-things-done.css).
import { TOOLS } from '../../problem-solver/tools/index.mjs';
import { type RunChart, createChartForTool as createBookChart } from '../../decision-book/render/charts';
import { createKanbanView } from '../../problem-solver/render/kanban';
import { createFiveWhysView } from '../../problem-solver/render/five-whys';
import { createExperimentView } from './commit';
import { createExperimentReviewView } from './review';

type GearTool = { id: string; family?: string; variantOf?: string; nodeTags?: { card?: string[] }; suggestedWip?: number; cardFields?: unknown };

/** The chart for a Gear Shifter tool definition, or null when it has none. */
export function createGearChartForTool(tool: GearTool, doc: Document = document): RunChart | null {
  if (tool.variantOf === 'kanban') return createKanbanView(doc, { columns: tool.nodeTags?.card as never, suggestedWip: tool.suggestedWip, cardFields: Boolean(tool.cardFields) }) as unknown as RunChart;
  if (tool.variantOf === 'five_whys') return createFiveWhysView(doc) as unknown as RunChart;
  if (tool.family === 'commit') return createExperimentView(doc) as unknown as RunChart;
  if (tool.family === 'review') return createExperimentReviewView(doc) as unknown as RunChart;
  return createBookChart(tool);
}

/** The chart for a run, looked up through the shared tool registry. */
export function createGearChartForRun(run: { tool: string }, doc: Document = document): RunChart | null {
  const tool = (TOOLS as unknown as Record<string, GearTool>)[run.tool];
  return tool ? createGearChartForTool(tool, doc) : null;
}
