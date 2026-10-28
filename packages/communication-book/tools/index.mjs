// packages/communication-book/tools/index.mjs
// Every Communication Book model, keyed by id in catalogue order. Problem Solver's registry
// (problem-solver/tools/index.mjs) spreads these in; their step, explore, is not a toolkit step,
// and no other book's Explore lists them.
import { JOB_CAREER } from './job-career.mjs';
import { SELF_KNOWLEDGE } from './self-knowledge.mjs';
import { LOVE_FRIENDSHIP } from './love-friendship.mjs';
import { WORDS_MEANINGS } from './words-meanings.mjs';
import { CONCLUSION } from './conclusion.mjs';

export const COMM_TOOLS = Object.freeze({
  ...JOB_CAREER,
  ...SELF_KNOWLEDGE,
  ...LOVE_FRIENDSHIP,
  ...WORDS_MEANINGS,
  ...CONCLUSION
});
