// packages/get-things-done/tools/index.mjs
// Every Gear Shifter technique, keyed by id in catalogue order. Problem Solver's registry
// (problem-solver/tools/index.mjs) spreads these in; their step, explore, is not a toolkit
// step, and Decision Maker's Explore lists only its own catalogue, so neither ever shows them.
import { DOING_THINGS } from './doing-things.mjs';
import { BEFORE_DOING } from './before-doing.mjs';
import { WORKING_WITH_OTHERS } from './working-with-others.mjs';
import { DOING_DIFFERENTLY } from './doing-differently.mjs';
import { REVIEWING } from './reviewing.mjs';

export const GEAR_TOOLS = Object.freeze({
  ...DOING_THINGS,
  ...BEFORE_DOING,
  ...WORKING_WITH_OTHERS,
  ...DOING_DIFFERENTLY,
  ...REVIEWING
});
