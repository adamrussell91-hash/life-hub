// netlify/functions/_shared/problem-solver/knowledge/selection.mjs
/**
 * How to choose a tool within a book step, keyed by problem shape. Tool ids in
 * backticks must be registered (the test checks). Later plans add their steps.
 */
export const SELECTION = Object.freeze({
  define: 'Choose from the problem\'s shape: one symptom with a likely single chain, `five_whys`; several causes and effects to sort, `problem_tree`; many interacting factors, `concept_map`; a clear present and desired state, `gap_basic`; several dimensions that can each be scored, `gap_radar`. After the diagnostic tool comes `problem_statement`, then `smart`.',
  contradiction: 'Use `contradiction`: name what should improve, what worsens when it does, then state the trade-off in one sentence.'
});
