// packages/walkthrus/problem-types.mjs
// The six problem types a pattern can show, the series each belongs to, and a short ranked
// list of technique ids per type. Ids only; see catalogue.mjs.

const id = (name) => `w1-${name}`;

export const PROBLEM_TYPES = Object.freeze({
  recall: Object.freeze({
    label: 'Recall', series: 'PR',
    ranked: Object.freeze(['quizzing', 'weekly-and-monthly-review', 'elaborative-interrogation', 'using-a-knowledge-organiser', 'peer-supported-retrieval'].map(id))
  }),
  fluency: Object.freeze({
    label: 'Fluency', series: 'PR',
    ranked: Object.freeze(['building-fluency', 'rehearsal-and-performance', 'guided-practice', 'independent-practice'].map(id))
  }),
  recognising: Object.freeze({
    label: 'Recognising what the question asks', series: 'EM',
    ranked: Object.freeze(['process-questions', 'metacognitive-talk', 'live-modelling', 'set-the-standards'].map(id))
  }),
  dexterity: Object.freeze({
    label: 'Dexterity with procedures', series: 'EM',
    ranked: Object.freeze(['worked-examples-and-backward-fading', 'live-modelling', 'scaffolding', 'guided-practice'].map(id))
  }),
  sophistication: Object.freeze({
    label: 'Sophistication of responses', series: 'EM',
    ranked: Object.freeze(['set-the-standards', 'say-it-again-better', 'feedback-that-moves-forward', 'independent-practice'].map(id))
  }),
  time: Object.freeze({
    label: 'Working under time', series: 'PR',
    ranked: Object.freeze(['building-fluency', 'rehearsal-and-performance', 'independent-practice'].map(id))
  })
});

export const PROBLEM_TYPE_IDS = Object.freeze(Object.keys(PROBLEM_TYPES));
export const isProblemType = (value) => typeof value === 'string' && Object.hasOwn(PROBLEM_TYPES, value);
export const rankedFor = (type) => (isProblemType(type) ? PROBLEM_TYPES[type].ranked : []);
