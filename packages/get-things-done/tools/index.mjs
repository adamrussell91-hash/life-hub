// packages/get-things-done/tools/index.mjs
// Every Gear Shifter technique, keyed by id in catalogue order. Problem Solver's registry
// (problem-solver/tools/index.mjs) spreads these in; their step, explore, is not a toolkit
// step, and Decision Maker's Explore lists only its own catalogue, so neither ever shows them.
import { DOING_THINGS } from './doing-things.mjs';

export const GEAR_TOOLS = Object.freeze({
  ...DOING_THINGS
});
