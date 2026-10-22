// netlify/functions/get-things-done-run.mjs
// Background runner for Gear Shifter coach turns, sharing Problem Solver's runner.
import { createProblemSolverRunHandler } from './problem-solver-run.mjs';
import { GEAR_SHIFTER_DEPS } from './get-things-done.mjs';

export const config = { path: '/api/get-things-done/run', background: true };

export function createGearShifterRunHandler(deps = {}) {
  return createProblemSolverRunHandler({ ...GEAR_SHIFTER_DEPS, ...deps });
}

export default createGearShifterRunHandler();
