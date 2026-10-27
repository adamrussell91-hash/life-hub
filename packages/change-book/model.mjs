// packages/change-book/model.mjs
// The Change Book's one process model. Like the Rules Book's it lives outside Problem Solver's
// MODELS, so the Problem Solver coach can never choose it; steps.mjs plans it. The four stages of
// a session (name the change and what stays, select a lens, make one example concrete, a small
// reversible step with a review date) map onto the engine's frame and these three steps: framing
// names the change and what stays, Explore selects a model and works one concrete example, Act
// sets the step and Review closes the loop.
export const CHANGE_BOOK_MODEL = Object.freeze({
  id: 'change_book',
  name: 'Change Book',
  steps: Object.freeze([
    Object.freeze({ id: 'explore', name: 'Apply a model', detail: 'Choose the model that fits and work one concrete example on its chart' }),
    Object.freeze({ id: 'commit', name: 'Act', detail: 'Choose one small, reversible step with a review date' }),
    Object.freeze({ id: 'review', name: 'Review', detail: 'See what happened, and whether the model still helps' })
  ])
});
