// netlify/functions/rules-book.mjs
// The Rules Book's API: Problem Solver's handler over the Rules Book's own store, run path and
// session kind (`rules`). Everything else is shared.
import { createProblemSolverHandler } from './problem-solver.mjs';
import { RULES_BOOK_PREFIX } from './_shared/problem-solver/store.mjs';

export const config = { path: '/api/rules-book' };

export const RULES_BOOK_DEPS = Object.freeze({ prefix: RULES_BOOK_PREFIX, runPath: '/api/rules-book/run', kinds: ['rules'] });

export function createRulesBookHandler(deps = {}) {
  return createProblemSolverHandler({ ...RULES_BOOK_DEPS, ...deps });
}

export default createRulesBookHandler();
