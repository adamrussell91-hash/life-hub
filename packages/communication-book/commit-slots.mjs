// packages/communication-book/commit-slots.mjs
// Commit's and Review's slots: the contract between their tools (tools/commit.mjs,
// tools/review.mjs), the record (record.mjs) and the charts. What the next conversation rests on
// (the model nodes it uses) lives on the session as `basis`.
export const COMMIT_ID = 'cm_commit';

export const COMMIT_SLOTS = Object.freeze({
  result: 'What would show the next exchange went better, for the other person as well as for you',
  rests_on: 'The model it rests on, and what its chart showed (as opposed to what anyone assumed)',
  next_action: 'The next conversation or message: who it is with, and the first words you will use',
  owner: 'Who takes the step, and whose reply it waits on',
  check_back: 'The date to come back to it (a date)',
  change_course: 'What would show it is not landing, and what you would try instead'
});

export const COMMIT_SLOT_NAMES = Object.freeze(Object.keys(COMMIT_SLOTS));

/** Review's tool: what was said, how it landed, and whether to keep the approach. */
export const REVIEW_ID = 'cm_review';

export const REVIEW_SLOTS = Object.freeze({
  happened: 'What was actually said, as plainly as both people would agree',
  landed: 'How it landed for the other person, in their words where you have them',
  keep: 'Whether to keep, adjust or drop the approach, and whether the model still helps'
});

export const REVIEW_SLOT_NAMES = Object.freeze(Object.keys(REVIEW_SLOTS));
