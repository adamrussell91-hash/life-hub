// packages/rules-book/commit-slots.mjs
// Act's and Review's slots: the contract between their tools (tools/commit.mjs, tools/review.mjs),
// the record (record.mjs) and the charts. What the experiment rests on (the rule nodes it uses)
// lives on the session as `basis`.
export const COMMIT_ID = 'rb_commit';

export const COMMIT_SLOTS = Object.freeze({
  result: 'The result that matters',
  rests_on: 'The rule it rests on, and the observation (not the interpretation) its chart showed',
  next_action: 'The next action: small, visible and startable today',
  start: 'When it starts: a cue or a protected time (words, not a timer)',
  check_back: 'The check time (a date)',
  change_course: 'What observation would overturn your reading, or make you drop this rule here'
});

export const COMMIT_SLOT_NAMES = Object.freeze(Object.keys(COMMIT_SLOTS));

/** Review's tool: what happened, whether the reading held, and whether the rule still fits. */
export const REVIEW_ID = 'rb_review';

export const REVIEW_SLOTS = Object.freeze({
  happened: 'What actually happened',
  held: 'Whether your reading held up against what you observed',
  keep: 'Whether the rule is still useful here: keep, adjust or drop it'
});

export const REVIEW_SLOT_NAMES = Object.freeze(Object.keys(REVIEW_SLOTS));
