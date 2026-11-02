// packages/walkthrus/problem-types.mjs
// The six problem types a pattern can show, the series each belongs to, and a short ranked
// list of technique ids per type. The first id is the suggestion, the rest are its alternatives.
// Ids only; see catalogue.mjs.

const ranked = (...ids) => Object.freeze(ids);

export const PROBLEM_TYPES = Object.freeze({
  recall: Object.freeze({
    label: 'Recall', series: 'PR',
    ranked: ranked('w1-quizzing', 'w1-weekly-and-monthly-review', 'w2-flash-cards', 'w1-elaborative-interrogation', 'w1-using-a-knowledge-organiser', 'w2-dual-coding-mapping', 'w1-peer-supported-retrieval')
  }),
  fluency: Object.freeze({
    label: 'Fluency', series: 'PR',
    ranked: ranked('w1-building-fluency', 'w1-rehearsal-and-performance', 'w2-practise-explaining', 'w1-guided-practice', 'w1-independent-practice')
  }),
  recognising: Object.freeze({
    label: 'Recognising what the question asks', series: 'EM',
    ranked: ranked('w1-process-questions', 'w2-a-ladder-of-difficulty', 'w1-metacognitive-talk', 'w1-live-modelling', 'w2-compare-contrast-and-categorise', 'w1-set-the-standards')
  }),
  dexterity: Object.freeze({
    label: 'Dexterity with procedures', series: 'EM',
    ranked: ranked('w1-worked-examples-and-backward-fading', 'w1-live-modelling', 'w1-scaffolding', 'w2-spot-your-mistakes', 'w1-guided-practice', 'w2-thresholds-and-pathways')
  }),
  sophistication: Object.freeze({
    label: 'Sophistication of responses', series: 'EM',
    ranked: ranked('w1-set-the-standards', 'w2-exemplars', 'w1-say-it-again-better', 'w2-redrafting', 'w1-feedback-that-moves-forward', 'w2-success-criteria', 'w1-independent-practice')
  }),
  time: Object.freeze({
    label: 'Working under time', series: 'PR',
    ranked: ranked('w1-building-fluency', 'w1-rehearsal-and-performance', 'w2-the-face-it-revision-model', 'w1-independent-practice')
  })
});

export const PROBLEM_TYPE_IDS = Object.freeze(Object.keys(PROBLEM_TYPES));
export const isProblemType = (value) => typeof value === 'string' && Object.hasOwn(PROBLEM_TYPES, value);
export const rankedFor = (type) => (isProblemType(type) ? PROBLEM_TYPES[type].ranked : []);
