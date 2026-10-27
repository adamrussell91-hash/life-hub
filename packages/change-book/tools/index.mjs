// packages/change-book/tools/index.mjs
// Every Change Book model, keyed by id in catalogue order. Problem Solver's registry
// (problem-solver/tools/index.mjs) spreads these in; their step, explore, is not a toolkit step,
// and no other book's Explore lists them.
import { EXPLAINING_OUR_WORLD } from './explaining-our-world.mjs';
import { EXPLAINING_MY_WORLD } from './explaining-my-world.mjs';
import { CHANGING_MY_WORLD } from './changing-my-world.mjs';
import { CHANGING_OUR_WORLD } from './changing-our-world.mjs';
import { APPENDIX } from './appendix.mjs';

export const CHANGE_TOOLS = Object.freeze({
  ...EXPLAINING_OUR_WORLD,
  ...EXPLAINING_MY_WORLD,
  ...CHANGING_MY_WORLD,
  ...CHANGING_OUR_WORLD,
  ...APPENDIX
});
