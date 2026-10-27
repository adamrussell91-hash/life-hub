// packages/change-book/commit-slots.mjs
// Act's and Review's slots: the contract between their tools (tools/commit.mjs, tools/review.mjs),
// the record (record.mjs) and the charts. What the step rests on (the model nodes it uses) lives
// on the session as `basis`.
export const COMMIT_ID = 'ch_commit';

export const COMMIT_SLOTS = Object.freeze({
  result: 'The result that matters',
  rests_on: 'The model it rests on, and the evidence (as opposed to the interpretation) its chart showed',
  next_action: 'The next action: small, reversible and startable today',
  affected: 'Who the step affects, and what valuable thing it keeps',
  check_back: 'The review date (a date)',
  change_course: 'What evidence would overturn your reading, or have you undo the step'
});

export const COMMIT_SLOT_NAMES = Object.freeze(Object.keys(COMMIT_SLOTS));

/** Review's tool: what happened, whether the reading held, and whether the model still helps. */
export const REVIEW_ID = 'ch_review';

export const REVIEW_SLOTS = Object.freeze({
  happened: 'What actually happened',
  held: 'Whether your reading held up against what you saw',
  keep: 'Whether the model still helps here, and whether to keep, adjust or undo the step'
});

export const REVIEW_SLOT_NAMES = Object.freeze(Object.keys(REVIEW_SLOTS));
