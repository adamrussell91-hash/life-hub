// netlify/functions/communication-book.mjs
// The Communication Book's API: Problem Solver's handler over the Communication Book's own store,
// run path and session kind (`talk`). Everything else is shared.
import { createProblemSolverHandler } from './problem-solver.mjs';
import { COMMUNICATION_BOOK_PREFIX } from './_shared/problem-solver/store.mjs';

export const config = { path: '/api/communication-book' };

export const COMMUNICATION_BOOK_DEPS = Object.freeze({ prefix: COMMUNICATION_BOOK_PREFIX, runPath: '/api/communication-book/run', kinds: ['talk'] });

export function createCommunicationBookHandler(deps = {}) {
  return createProblemSolverHandler({ ...COMMUNICATION_BOOK_DEPS, ...deps });
}

export default createCommunicationBookHandler();
