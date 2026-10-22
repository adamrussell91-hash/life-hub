// packages/get-things-done/commit-slots.mjs
// Commit's and Review's slots: the contract between their tools (tools/commit.mjs,
// tools/review.mjs), the action record (record.mjs) and, in Plan 5, their charts. What the
// experiment rests on (the technique nodes it uses) lives on the session as `basis`, as a
// Decision Maker reason's does.
export const COMMIT_ID = 'gt_commit';

export const COMMIT_SLOTS = Object.freeze({
  result: 'The result that matters',
  rests_on: 'The technique it rests on, and what its chart showed',
  next_action: 'The next action: small, visible and startable today',
  start: 'When it starts: a cue or a protected time (words, not a timer)',
  check_back: 'The check-back date',
  change_course: 'What would tell you to change course'
});

export const COMMIT_SLOT_NAMES = Object.freeze(Object.keys(COMMIT_SLOTS));

/** Review's experiment tool: what changed, what it cost, what to keep. */
export const EXPERIMENT_REVIEW_ID = 'gt_review';

export const EXPERIMENT_REVIEW_SLOTS = Object.freeze({
  changed: 'What changed',
  cost: 'What it cost',
  keep: 'What to keep, drop or change'
});

export const EXPERIMENT_REVIEW_SLOT_NAMES = Object.freeze(Object.keys(EXPERIMENT_REVIEW_SLOTS));
