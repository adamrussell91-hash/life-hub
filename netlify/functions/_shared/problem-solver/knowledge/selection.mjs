// netlify/functions/_shared/problem-solver/knowledge/selection.mjs
/**
 * How to choose a tool within a book step, keyed by problem shape. Tool ids in
 * backticks must be registered (the test checks). Later plans add their steps.
 */
export const SELECTION = Object.freeze({
  define: 'Choose from the problem\'s shape: one symptom with a likely single chain, `five_whys`; several causes and effects to sort, `problem_tree`; many interacting factors, `concept_map`; a clear present and desired state, `gap_basic`; several dimensions that can each be scored, `gap_radar`. After the diagnostic tool comes `problem_statement`, then `smart`.',
  analyse: 'Choose from what the problem needs next. Many causes acting on each other: `causal_map`. Several people affected whose views may change the problem: `perspective_shift`. Information that breaks into levels and needs seeing whole: `radial_tree`. Change resisted, with forces for and against: `force_field`. Trends shaping where things are heading: `from_to`. To close Analyse with a plan others can follow: `intent_statement`, usually last.',
  devise: 'Choose from how the problem resists solutions. Too big to solve whole: `problem_reduction`. Resembles a problem solved elsewhere: `analogical_reasoning`. A clear aim needing every route mapped: `solution_tree`. Needing many options fast: `lotus_blossom`. Stuck on the obvious route: `duncker`, which forces a contrary path. Generate before judging; carry the best options into Decide.',
  contradiction: 'Use `contradiction`: name what should improve, what worsens when it does, then state the trade-off in one sentence.'
});
