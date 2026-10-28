// packages/communication-book/model.mjs
// The Communication Book's one process model. Like the Collaboration Book's it lives outside
// Problem Solver's MODELS, so the Problem Solver coach can never choose it; steps.mjs plans it.
// The four stages of a session (name the exchange, choose one lens, work one real example, commit
// to the next conversation and come back to it) map onto the engine's frame and these three
// steps: framing locates the communication situation, Explore chooses a model and works it,
// Commit settles the next conversation and Review closes the loop.
export const COMMUNICATION_BOOK_MODEL = Object.freeze({
  id: 'communication_book',
  name: 'Communication Book',
  steps: Object.freeze([
    Object.freeze({ id: 'explore', name: 'Work a model', detail: 'Choose the model that fits the exchange and work its chart on one real example' }),
    Object.freeze({ id: 'commit', name: 'Commit', detail: 'Commit to the next conversation, with who takes it and a date to come back to it' }),
    Object.freeze({ id: 'review', name: 'Review', detail: 'See what was said, and how it landed' })
  ])
});
