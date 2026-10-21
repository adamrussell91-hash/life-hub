// packages/decision-book/record-slots.mjs
// The decision record's slots: the contract between its chart (render/record.ts, Plan 2) and
// the Decide step's tool (Plan 4). A reason's basis (the model nodes it rests on) lives on the
// session, not the run, so the chart takes it separately (setBasis).
export const RECORD_ID = 'dm_record';

export const RECORD_SLOTS = Object.freeze({
  decision: 'The decision, in one sentence',
  reason: 'A reason, resting on what a model showed',
  trigger: 'Stop Rule: what would make you rethink',
  action: 'Stop Rule: what you will do then, agreed now',
  first_step: 'The first step',
  review: 'When to review it (a date)'
});

export const RECORD_SLOT_NAMES = Object.freeze(Object.keys(RECORD_SLOTS));

/** Reasons a record holds at most. */
export const REASONS_MAX = 5;

/** Review's tool: the feedback analysis compares what was expected with what happened. */
export const FEEDBACK_ID = 'dm_feedback_analysis';
