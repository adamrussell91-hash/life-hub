// netlify/functions/decision-book-run.mjs
// Background runner for Decision Maker coach turns, sharing Problem Solver's runner.
import { createProblemSolverRunHandler } from './problem-solver-run.mjs';
import { DECISION_BOOK_DEPS } from './decision-book.mjs';

export const config = { path: '/api/decision-book/run', background: true };

export function createDecisionBookRunHandler(deps = {}) {
  return createProblemSolverRunHandler({ ...DECISION_BOOK_DEPS, ...deps });
}

export default createDecisionBookRunHandler();
