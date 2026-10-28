// packages/collaboration-book/tools/shared.mjs
// What every Collaboration Book model shares: the step helper and the last step, stage three of
// every session (work the structure together), which checks the person's own part before anyone
// else's and asks whose view is still missing.
export const step = (id, title, prompt) => ({ id, title, prompt });

export const OWN_PART_STEP = step('own_part', 'Your part, and who is missing', 'What is your own part in this, and whose view have you not heard yet?');
