// packages/get-things-done/model.mjs
// Gear Shifter's one process model. Like Decision Maker's, it lives outside Problem Solver's
// MODELS, so the Problem Solver coach can never choose it; steps.mjs plans it.
export const GEAR_SHIFTER_MODEL = Object.freeze({
  id: 'gear_shifter',
  name: 'Gear Shifter',
  steps: Object.freeze([
    Object.freeze({ id: 'explore', name: 'Explore', detail: 'Work the technique that fits where you are stuck' }),
    Object.freeze({ id: 'commit', name: 'Commit', detail: 'Set a small, dated experiment' }),
    Object.freeze({ id: 'review', name: 'Review', detail: 'See what changed, what it cost and what to keep' })
  ])
});

/** The tool Review opens on for a finished project. */
export const REVIEW_TOOL = 'gt_project_evaluation';
