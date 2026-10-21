// netlify/functions/decision-book.mjs
// Decision Maker's API: Problem Solver's handler over Decision Maker's own store, run path
// and session kinds. Everything else (revisions, request replay, the queued runner) is shared.
import { createProblemSolverHandler } from './problem-solver.mjs';
import { DECISION_BOOK_PREFIX } from './_shared/problem-solver/store.mjs';

export const config = { path: '/api/decision-book' };

export const DECISION_BOOK_DEPS = Object.freeze({ prefix: DECISION_BOOK_PREFIX, runPath: '/api/decision-book/run', kinds: ['decision', 'quick'] });

export function createDecisionBookHandler(deps = {}) {
  return createProblemSolverHandler({ ...DECISION_BOOK_DEPS, ...deps });
}

export default createDecisionBookHandler();
