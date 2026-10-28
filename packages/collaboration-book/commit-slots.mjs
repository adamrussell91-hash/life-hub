// packages/collaboration-book/commit-slots.mjs
// Agree's and Review's slots: the contract between their tools (tools/commit.mjs,
// tools/review.mjs), the record (record.mjs) and the charts. What the experiment rests on (the
// model nodes it uses) lives on the session as `basis`.
export const COMMIT_ID = 'cb_commit';

export const COMMIT_SLOTS = Object.freeze({
  result: 'The result for the team that would show this is working',
  rests_on: 'The model it rests on, and what its chart showed (as opposed to what anyone assumed)',
  next_action: 'The next action: small, startable this week, and easy to stop',
  owner: 'Who owns it, and who else it needs to hear from',
  check_back: 'The date to come back to it (a date)',
  change_course: 'What would show the experiment is not working, or that the conditions themselves need to change'
});

export const COMMIT_SLOT_NAMES = Object.freeze(Object.keys(COMMIT_SLOTS));

/** Review's tool: what happened, whether the conditions changed, and whether to keep the practice. */
export const REVIEW_ID = 'cb_review';

export const REVIEW_SLOTS = Object.freeze({
  happened: 'What actually happened, for the people involved',
  conditions: 'Whether the conditions changed, or only the conversation',
  keep: 'Whether to keep, adjust or stop the practice, and whether the model still helps'
});

export const REVIEW_SLOT_NAMES = Object.freeze(Object.keys(REVIEW_SLOTS));
