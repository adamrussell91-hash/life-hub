// packages/change-book/tools/shared.mjs
// What every Change Book model shares: the step helper and the last step, stage three of every
// session (make one example concrete), which keeps what was seen apart from what is assumed.
export const step = (id, title, prompt) => ({ id, title, prompt });

export const EVIDENCE_STEP = step('evidence', 'Seen or assumed', 'What did you see for yourself here, and which one assumption could turn out wrong?');
