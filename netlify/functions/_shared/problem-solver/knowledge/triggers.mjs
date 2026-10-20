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
  ],
  decide: [
    'A criterion too vague to rate, such as "good" or "works" (critical_thinking).',
    'Weights all equal, or not adding to 100, with no reason (analysis).',
    'A rating that contradicts evidence already given (logical_reasoning).',
    'A Pareto ranking or 80/20 claim with no figures behind it (critical_thinking).',
    'The answer decided before the analysis, with numbers fitted afterwards (metacognition).',
    'A chosen option that goes against the scores with no reason given (decision_making).'
  ],
  implement: [
    'A task too large to start this week (decision_making).',
    'A task with no owner or no date (decision_making).',
    'Status quo, loss or regret talk left unexamined ("we have always done it this way") (metacognition).',
    'No measure of success, so nobody will know whether it worked (critical_thinking).',
    'Rolling out everywhere when a cheap pilot was possible (decision_making).'
  ],
  improve: [
    'Blaming a person for what a process or system allowed (logical_reasoning).',
    'Skipping or rushing what was learned (metacognition).',
    'A single-loop fix offered for a problem that keeps recurring (analysis).',
    'Results claimed with no measure, or the plan described instead of what happened (critical_thinking).',
    'Only the solution reviewed, never the process that produced it (metacognition).'
  ]
});
