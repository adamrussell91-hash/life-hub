// packages/decision-book/families/index.mjs
// The seven family factories, keyed by the catalogue's `family` values. `table` (a reused
// Problem Solver chart) and `oneoff` (a bespoke chart) have no factory.
import { quadrantTool } from './quadrant.mjs';
import { plotTool } from './plot.mjs';
import { scalesTool } from './scales.mjs';
import { curveTool } from './curve.mjs';
import { tensionTool } from './tension.mjs';
import { pathTool } from './path.mjs';
import { listTool } from './list.mjs';

export { quadrantTool, plotTool, scalesTool, curveTool, tensionTool, pathTool, listTool };

export const FAMILY_FACTORIES = Object.freeze({
  quadrant: quadrantTool,
  plot: plotTool,
  scales: scalesTool,
  curve: curveTool,
  tension: tensionTool,
  path: pathTool,
  list: listTool
});
