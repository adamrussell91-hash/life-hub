// packages/rules-book/render/charts.ts
// Which chart draws a Rules Book run. The Pareto variant takes Problem Solver's Pareto renderer;
// Act's experiment and Review's review (families `commit` and `review`) are the Rules Book's
// own; everything else, the One-Step variant included (it is a list), is a Decision Book family
// chart (decision-book/render/charts.ts). All of them are re-skinned by .rb-scope (rules-book.css).
import { TOOLS } from '../../problem-solver/tools/index.mjs';
import { type RunChart, createChartForTool as createBookChart } from '../../decision-book/render/charts';
import { createParetoView } from '../../problem-solver/render/pareto';
import { createExperimentView } from './commit';
import { createReviewView } from './review';

type RuleTool = { id: string; family?: string; variantOf?: string };
type ReflectingRun = { nodes: Array<{ slot: string; text: string }> };

/**
 * Problem Solver's Pareto chart draws the items and the ranking; the variant also ends with a
 * reflection, which the chart has no place for, so it sits in a card beneath.
 */
function createParetoWithReflection(doc: Document): RunChart {
  const view = createParetoView(doc);
  const wrap = doc.createElement('div');
  wrap.className = 'rb-pareto';
  const note = doc.createElement('p');
  note.className = 'rb-pareto__reflection';
  note.hidden = true;
  wrap.append(view.el, note);
  return {
    ...view,
    el: wrap,
    update(run: never) {
      view.update(run);
      const text = (run as ReflectingRun).nodes.find((node) => node.slot === 'reflection')?.text ?? '';
      note.hidden = !text;
      if (note.textContent !== text) note.textContent = text;
    }
  } as unknown as RunChart;
}

/** The chart for a Rules Book tool definition, or null when it has none. */
export function createRulesChartForTool(tool: RuleTool, doc: Document = document): RunChart | null {
  if (tool.variantOf === 'pareto') return createParetoWithReflection(doc);
  if (tool.family === 'commit') return createExperimentView(doc) as unknown as RunChart;
  if (tool.family === 'review') return createReviewView(doc) as unknown as RunChart;
  return createBookChart(tool);
}

/** The chart for a run, looked up through the shared tool registry. */
export function createRulesChartForRun(run: { tool: string }, doc: Document = document): RunChart | null {
  const tool = (TOOLS as unknown as Record<string, RuleTool>)[run.tool];
  return tool ? createRulesChartForTool(tool, doc) : null;
}
