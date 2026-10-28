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
import { dmaic } from './dmaic.mjs';
import { fifteenPercent } from './fifteen-percent.mjs';
import { kanban } from './kanban.mjs';
import { eisenhower } from './eisenhower.mjs';
import { afterActionReview } from './after-action-review.mjs';
import { doubleLoop } from './double-loop.mjs';
import { feedbackMatrix } from './feedback-matrix.mjs';
import { fiveCs } from './five-cs.mjs';
import { knowledgeManagement } from './knowledge-management.mjs';
import { DECISION_TOOLS } from '../../decision-book/models/index.mjs';
import { dmRecord } from '../../decision-book/tools/record.mjs';
import { GEAR_TOOLS } from '../../get-things-done/tools/index.mjs';
import { gtCommit } from '../../get-things-done/tools/commit.mjs';
import { gtReview } from '../../get-things-done/tools/review.mjs';
import { RULE_TOOLS } from '../../rules-book/tools/index.mjs';
import { rbCommit } from '../../rules-book/tools/commit.mjs';
import { rbReview } from '../../rules-book/tools/review.mjs';
import { CHANGE_TOOLS } from '../../change-book/tools/index.mjs';
import { chCommit } from '../../change-book/tools/commit.mjs';
import { chReview } from '../../change-book/tools/review.mjs';
import { COLLAB_TOOLS } from '../../collaboration-book/tools/index.mjs';
import { cbCommit } from '../../collaboration-book/tools/commit.mjs';
import { cbReview } from '../../collaboration-book/tools/review.mjs';
import { COMM_TOOLS } from '../../communication-book/tools/index.mjs';
import { cmCommit } from '../../communication-book/tools/commit.mjs';
import { cmReview } from '../../communication-book/tools/review.mjs';

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
  pareto,
  dmaic,
  fifteen_percent: fifteenPercent,
  kanban,
  eisenhower,
  after_action_review: afterActionReview,
  double_loop: doubleLoop,
  feedback_matrix: feedbackMatrix,
  five_cs: fiveCs,
  knowledge_management: knowledgeManagement,
  // Decision Maker's models (step explore, not a toolkit step, so Problem Solver never lists them).
  ...DECISION_TOOLS,
  // Decision Maker's Decide step (step settle, likewise not a toolkit step).
  dm_record: dmRecord,
  // Gear Shifter's techniques (step explore too; Gear Shifter's Explore lists its own catalogue).
  ...GEAR_TOOLS,
  // Gear Shifter's Commit and Review tools (steps commit and review, neither a toolkit step).
  gt_commit: gtCommit,
  gt_review: gtReview,
  // The Rules Book's rules (step explore), then its Act and Review tools.
  ...RULE_TOOLS,
  rb_commit: rbCommit,
  rb_review: rbReview,
  // The Change Book's models (step explore), then its Act and Review tools.
  ...CHANGE_TOOLS,
  ch_commit: chCommit,
  ch_review: chReview,
  // The Collaboration Book's models (step explore), then its Agree and Review tools.
  ...COLLAB_TOOLS,
  cb_commit: cbCommit,
  cb_review: cbReview,
  // The Communication Book's models (step explore), then its Commit and Review tools.
  ...COMM_TOOLS,
  cm_commit: cmCommit,
  cm_review: cmReview
};

export const TOOL_IDS = Object.freeze(Object.keys(TOOLS));

/** Tool ids whose `step` is the given book step, in registry order. */
export function toolsForBookStep(step) {
  return TOOL_IDS.filter((id) => TOOLS[id].step === step);
}
