// netlify/functions/change-book.mjs
// The Change Book's API: Problem Solver's handler over the Change Book's own store, run path and
// session kind (`change`). Everything else is shared.
import { createProblemSolverHandler } from './problem-solver.mjs';
import { CHANGE_BOOK_PREFIX } from './_shared/problem-solver/store.mjs';

export const config = { path: '/api/change-book' };

export const CHANGE_BOOK_DEPS = Object.freeze({ prefix: CHANGE_BOOK_PREFIX, runPath: '/api/change-book/run', kinds: ['change'] });

export function createChangeBookHandler(deps = {}) {
  return createProblemSolverHandler({ ...CHANGE_BOOK_DEPS, ...deps });
}

export default createChangeBookHandler();
