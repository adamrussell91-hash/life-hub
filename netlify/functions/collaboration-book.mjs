// netlify/functions/collaboration-book.mjs
// The Collaboration Book's API: Problem Solver's handler over the Collaboration Book's own store,
// run path and session kind (`collab`). Everything else is shared.
import { createProblemSolverHandler } from './problem-solver.mjs';
import { COLLABORATION_BOOK_PREFIX } from './_shared/problem-solver/store.mjs';

export const config = { path: '/api/collaboration-book' };

export const COLLABORATION_BOOK_DEPS = Object.freeze({ prefix: COLLABORATION_BOOK_PREFIX, runPath: '/api/collaboration-book/run', kinds: ['collab'] });

export function createCollaborationBookHandler(deps = {}) {
  return createProblemSolverHandler({ ...COLLABORATION_BOOK_DEPS, ...deps });
}

export default createCollaborationBookHandler();
