// netlify/functions/collaboration-book-run.mjs
// Background runner for Collaboration Book coach turns, sharing Problem Solver's runner.
import { createProblemSolverRunHandler } from './problem-solver-run.mjs';
import { COLLABORATION_BOOK_DEPS } from './collaboration-book.mjs';

export const config = { path: '/api/collaboration-book/run', background: true };

export function createCollaborationBookRunHandler(deps = {}) {
  return createProblemSolverRunHandler({ ...COLLABORATION_BOOK_DEPS, ...deps });
}

export default createCollaborationBookRunHandler();
