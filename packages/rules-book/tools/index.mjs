// packages/rules-book/tools/index.mjs
// Every Rules Book tool, keyed by id in catalogue order (the book's four parts, then Ways of
// Seeing, our own). Problem Solver's registry
// (problem-solver/tools/index.mjs) spreads these in; their step, explore, is not a toolkit
// step, and no other book's Explore lists them.
import { WORKPLACE } from './workplace.mjs';
import { CHANGE } from './change.mjs';
import { PEOPLE } from './people.mjs';
import { LIFE } from './life.mjs';
import { MODELS } from './models.mjs';

export const RULE_TOOLS = Object.freeze({
  ...WORKPLACE,
  ...CHANGE,
  ...PEOPLE,
  ...LIFE,
  ...MODELS
});
