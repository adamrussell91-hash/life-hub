// packages/decision-book/model.mjs
// Decision Maker's one process model. It lives here, not in Problem Solver's MODELS, so the
// Problem Solver coach can never choose it; steps.mjs plans it.
export const DECISION_MODEL = Object.freeze({
  id: 'decision_book',
  name: 'Decision Maker',
  steps: Object.freeze([
    Object.freeze({ id: 'explore', name: 'Explore', detail: 'Work the models that fit the decision' }),
    Object.freeze({ id: 'decide', name: 'Decide', detail: 'Settle the decision and what would change it' }),
    Object.freeze({ id: 'review', name: 'Review', detail: 'Compare what you expected with what happened' })
  ])
});
