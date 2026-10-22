// packages/decision-book/families/index.mjs
// The family factories, keyed by the catalogue's `family` values (`ratings` is Gear Shifter's). `table` (a reused
// Problem Solver chart) and `oneoff` (a bespoke chart) have no factory.
import { quadrantTool } from './quadrant.mjs';
import { plotTool } from './plot.mjs';
import { scalesTool } from './scales.mjs';
import { curveTool } from './curve.mjs';
import { tensionTool } from './tension.mjs';
import { pathTool } from './path.mjs';
import { listTool } from './list.mjs';
import { ratingsTool } from './ratings.mjs';

export { quadrantTool, plotTool, scalesTool, curveTool, tensionTool, pathTool, listTool, ratingsTool };

export const FAMILY_FACTORIES = Object.freeze({
  quadrant: quadrantTool,
  plot: plotTool,
  scales: scalesTool,
  curve: curveTool,
  tension: tensionTool,
  path: pathTool,
  list: listTool,
  ratings: ratingsTool
});
