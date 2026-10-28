// packages/collaboration-book/model.mjs
// The Collaboration Book's one process model. Like the Change Book's it lives outside Problem
// Solver's MODELS, so the Problem Solver coach can never choose it; steps.mjs plans it. The four
// stages of a session (locate the difficulty, choose one lens, work its structure together, agree
// an experiment and come back to it) map onto the engine's frame and these three steps: framing
// locates the team situation, Explore chooses a model and works it, Act agrees the experiment and
// Review closes the loop.
export const COLLABORATION_BOOK_MODEL = Object.freeze({
  id: 'collaboration_book',
  name: 'Collaboration Book',
  steps: Object.freeze([
    Object.freeze({ id: 'explore', name: 'Work a model', detail: 'Choose the model that fits the team situation and work its chart together' }),
    Object.freeze({ id: 'commit', name: 'Agree', detail: 'Agree one experiment with an owner and a date to come back to it' }),
    Object.freeze({ id: 'review', name: 'Review', detail: 'See what happened, and whether the conditions changed' })
  ])
});
