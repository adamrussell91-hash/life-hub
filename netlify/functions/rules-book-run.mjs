// netlify/functions/rules-book-run.mjs
// Background runner for Rules Book coach turns, sharing Problem Solver's runner.
import { createProblemSolverRunHandler } from './problem-solver-run.mjs';
import { RULES_BOOK_DEPS } from './rules-book.mjs';

export const config = { path: '/api/rules-book/run', background: true };

export function createRulesBookRunHandler(deps = {}) {
  return createProblemSolverRunHandler({ ...RULES_BOOK_DEPS, ...deps });
}

export default createRulesBookRunHandler();
