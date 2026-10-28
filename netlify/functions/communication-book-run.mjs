// netlify/functions/communication-book-run.mjs
// Background runner for Communication Book coach turns, sharing Problem Solver's runner.
import { createProblemSolverRunHandler } from './problem-solver-run.mjs';
import { COMMUNICATION_BOOK_DEPS } from './communication-book.mjs';

export const config = { path: '/api/communication-book/run', background: true };

export function createCommunicationBookRunHandler(deps = {}) {
  return createProblemSolverRunHandler({ ...COMMUNICATION_BOOK_DEPS, ...deps });
}

export default createCommunicationBookRunHandler();
