// packages/collaboration-book/tools/index.mjs
// Every Collaboration Book model, keyed by id in catalogue order. Problem Solver's registry
// (problem-solver/tools/index.mjs) spreads these in; their step, explore, is not a toolkit step,
// and no other book's Explore lists them.
import { SOLVING_PROBLEMS } from './solving-problems.mjs';
import { ACHIEVING_GOALS } from './achieving-goals.mjs';
import { CREATING_TRUST } from './creating-trust.mjs';

export const COLLAB_TOOLS = Object.freeze({
  ...SOLVING_PROBLEMS,
  ...ACHIEVING_GOALS,
  ...CREATING_TRUST
});
