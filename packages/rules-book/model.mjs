// packages/rules-book/model.mjs
// The Rules Book's one process model. Like Gear Shifter's it lives outside Problem Solver's
// MODELS, so the Problem Solver coach can never choose it; steps.mjs plans it. The four stages
// of a session (ground, select, apply, act and review) map onto the engine's frame and these
// three steps: framing grounds the situation, Explore selects a rule and applies it, Commit
// and Review close the loop.
export const RULES_BOOK_MODEL = Object.freeze({
  id: 'rules_book',
  name: 'Rules Book',
  steps: Object.freeze([
    Object.freeze({ id: 'explore', name: 'Apply a rule', detail: 'Choose the rule that fits and work its chart' }),
    Object.freeze({ id: 'commit', name: 'Act', detail: 'Set one small experiment with a check time' }),
    Object.freeze({ id: 'review', name: 'Review', detail: 'See what happened and whether the rule still fits' })
  ])
});
