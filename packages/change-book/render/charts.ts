// packages/change-book/render/charts.ts
// Which chart draws a Change Book run. The Rhizome variant takes Problem Solver's concept-map
// renderer; Multitasking's split star and (Un)Happiness's table of forces (families `time_value`
// and `attribution`), Act's step and Review's review (families `commit` and `review`) are the
// Change Book's own; everything else is a Decision Book family chart (decision-book/render/charts.ts). All of
// them are re-skinned by .ch-scope (change-book.css).
import { TOOLS } from '../../problem-solver/tools/index.mjs';
import { type RunChart, createChartForTool as createBookChart } from '../../decision-book/render/charts';
import { createConceptMapView } from '../../problem-solver/render/concept-map';
import { createStepView } from './commit';
import { createReviewView } from './review';
import { type TimeValueTool, createTimeValueView } from './time-value';
import { type AttributionTool, createAttributionView } from './attribution';

type ChangeTool = { id: string; family?: string; variantOf?: string };
type ReflectingRun = { nodes: Array<{ slot: string; text: string }> };

/**
 * Problem Solver's concept map draws you, the contexts and the links; the variant also ends with
 * a reflection, which the map has no place for, so it sits in a card beneath.
 */
function createRhizome(doc: Document): RunChart {
  const view = createConceptMapView(doc);
  const wrap = doc.createElement('div');
  wrap.className = 'ch-rhizome';
  const note = doc.createElement('p');
  note.className = 'ch-rhizome__reflection';
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

/** The chart for a Change Book tool definition, or null when it has none. */
export function createChangeChartForTool(tool: ChangeTool, doc: Document = document): RunChart | null {
  if (tool.variantOf === 'concept_map') return createRhizome(doc);
  if (tool.family === 'time_value') return createTimeValueView(tool as unknown as TimeValueTool, doc) as unknown as RunChart;
  if (tool.family === 'attribution') return createAttributionView(tool as unknown as AttributionTool, doc) as unknown as RunChart;
  if (tool.family === 'commit') return createStepView(doc) as unknown as RunChart;
  if (tool.family === 'review') return createReviewView(doc) as unknown as RunChart;
  return createBookChart(tool);
}

/** The chart for a run, looked up through the shared tool registry. */
export function createChangeChartForRun(run: { tool: string }, doc: Document = document): RunChart | null {
  const tool = (TOOLS as unknown as Record<string, ChangeTool>)[run.tool];
  return tool ? createChangeChartForTool(tool, doc) : null;
}
