// netlify/functions/_shared/problem-solver/knowledge/triggers.mjs
/** Extra reasons to challenge, per book step, added to the step layer. Our words. Later plans add their steps. */
export const STEP_TRIGGERS = Object.freeze({
  analyse: [
    'A cause or trend asserted with no evidence or source (critical_thinking).',
    'One person\'s view presented as everyone\'s (critical_thinking).',
    'Forces or links scored or weighted with no reason (analysis).',
    'Jumping to solutions before the analysis is done (metacognition).'
  ],
  devise: [
    'Judging or narrowing ideas while still generating them (creative_thinking).',
    'Only obvious options, with no contrary or unusual route considered (creative_thinking).',
    'In a group, pooling ideas before each person has generated their own (creative_thinking).',
    'An option that is a restatement of the problem rather than a way to solve it (logical_reasoning).'
  ]
});
