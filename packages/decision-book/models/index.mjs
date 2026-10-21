// packages/decision-book/models/index.mjs
// Every Decision Book tool Decision Maker owns: the four sections' models and the two bespoke
// lenses, keyed by id. Problem Solver's registry (tools/index.mjs) spreads these in; their
// step, explore, is not a toolkit step, so Problem Solver never lists them. The four reused
// Problem Solver tools (swot, morphological, double_loop, pareto) are not here.
import { SECTION_1 } from './section-1.mjs';
import { SECTION_2 } from './section-2.mjs';
import { SECTION_3 } from './section-3.mjs';
import { SECTION_4 } from './section-4.mjs';
import { dmOutsideBox } from '../tools/outside-box.mjs';
import { dmBlackBox } from '../tools/black-box.mjs';

export const DECISION_TOOLS = Object.freeze({
  ...SECTION_1,
  dm_outside_box: dmOutsideBox,
  ...SECTION_2,
  ...SECTION_3,
  dm_black_box: dmBlackBox,
  ...SECTION_4
});
