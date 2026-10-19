// packages/problem-solver/tools/index.mjs
import { fiveWhys } from './five-whys.mjs';
import { problemTree } from './problem-tree.mjs';
import { conceptMap } from './concept-map.mjs';
import { gapBasic } from './gap-basic.mjs';
import { gapRadar } from './gap-radar.mjs';
import { problemStatement } from './problem-statement.mjs';
import { smart } from './smart.mjs';
import { contradiction } from './contradiction.mjs';
import { causalMap } from './causal-map.mjs';
import { perspectiveShift } from './perspective-shift.mjs';
import { radialTree } from './radial-tree.mjs';
import { forceField } from './force-field.mjs';
import { fromTo } from './from-to.mjs';
import { intentStatement } from './intent-statement.mjs';
import { problemReduction } from './problem-reduction.mjs';
import { analogicalReasoning } from './analogical-reasoning.mjs';
import { solutionTree } from './solution-tree.mjs';
import { lotusBlossom } from './lotus-blossom.mjs';
import { duncker } from './duncker.mjs';
import { decisionMatrix } from './decision-matrix.mjs';
import { swot } from './swot.mjs';
import { morphological } from './morphological.mjs';
import { pareto } from './pareto.mjs';

// The container is not frozen (tests register fakes); every definition is frozen.
export const TOOLS = {
  five_whys: fiveWhys,
  problem_tree: problemTree,
  concept_map: conceptMap,
  gap_basic: gapBasic,
  gap_radar: gapRadar,
  problem_statement: problemStatement,
  smart,
  contradiction,
  causal_map: causalMap,
  perspective_shift: perspectiveShift,
  radial_tree: radialTree,
  force_field: forceField,
  from_to: fromTo,
  intent_statement: intentStatement,
  problem_reduction: problemReduction,
  analogical_reasoning: analogicalReasoning,
  solution_tree: solutionTree,
  lotus_blossom: lotusBlossom,
  duncker,
  decision_matrix: decisionMatrix,
  swot,
  morphological,
  pareto
};

export const TOOL_IDS = Object.freeze(Object.keys(TOOLS));

/** Tool ids whose `step` is the given book step, in registry order. */
export function toolsForBookStep(step) {
  return TOOL_IDS.filter((id) => TOOLS[id].step === step);
}
