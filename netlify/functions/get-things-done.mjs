// netlify/functions/get-things-done.mjs
// Gear Shifter's API: Problem Solver's handler over Gear Shifter's own store, run path and
// session kinds (`shift`, and `start` for Quick start). Everything else is shared.
import { createProblemSolverHandler } from './problem-solver.mjs';
import { GEAR_SHIFTER_PREFIX } from './_shared/problem-solver/store.mjs';

export const config = { path: '/api/get-things-done' };

export const GEAR_SHIFTER_DEPS = Object.freeze({ prefix: GEAR_SHIFTER_PREFIX, runPath: '/api/get-things-done/run', kinds: ['shift', 'start'] });

export function createGearShifterHandler(deps = {}) {
  return createProblemSolverHandler({ ...GEAR_SHIFTER_DEPS, ...deps });
}

export default createGearShifterHandler();
