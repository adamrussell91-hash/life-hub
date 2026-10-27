// netlify/functions/change-book-run.mjs
// Background runner for Change Book coach turns, sharing Problem Solver's runner.
import { createProblemSolverRunHandler } from './problem-solver-run.mjs';
import { CHANGE_BOOK_DEPS } from './change-book.mjs';

export const config = { path: '/api/change-book/run', background: true };

export function createChangeBookRunHandler(deps = {}) {
  return createProblemSolverRunHandler({ ...CHANGE_BOOK_DEPS, ...deps });
}

export default createChangeBookRunHandler();
