// packages/communication-book/tools/shared.mjs
// What every Communication Book model shares: the step helper and the last step, stage three of
// every session (work one real example), which checks the person's own part before anyone else's
// and asks how the exchange landed on the other side.
export const step = (id, title, prompt) => ({ id, title, prompt });

export const OWN_PART_STEP = step('own_part', 'Your part, and how it landed', 'What is your own part in this exchange, and how might the other person say it landed for them?');
