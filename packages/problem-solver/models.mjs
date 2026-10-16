// packages/problem-solver/models.mjs
/** Process models. `define` is the step the Define tools fill. */
export const MODELS = Object.freeze({
  seven_step: {
    id: 'seven_step',
    name: 'The problem solving process',
    when: 'The default: most real problems, especially ones that will need analysis, options and a decision.',
    define: 'define',
    steps: [
      { id: 'define', name: 'Define', detail: 'Problem recognition and definition' },
      { id: 'analyse', name: 'Analyse', detail: 'Problem analysis' },
      { id: 'devise', name: 'Devise', detail: 'Generate alternate solutions' },
      { id: 'decide', name: 'Decide', detail: 'Select solution' },
      { id: 'implement', name: 'Implement', detail: 'Plan and act' },
      { id: 'improve', name: 'Improve', detail: 'Evaluate outcome' },
      { id: 'document', name: 'Document', detail: 'Record key information' }
    ]
  },
  polya: {
    id: 'polya',
    name: "Polya's 4-step problem solving",
    when: 'A bounded problem with a clear test of success, where a plan can be tried, checked and retried.',
    define: 'identify',
    steps: [
      { id: 'identify', name: 'Identify the problem', detail: 'Understand the problem' },
      { id: 'devise', name: 'Devise a solution', detail: 'Devise a plan' },
      { id: 'implement', name: 'Implement the solution', detail: 'Carry out the plan' },
      { id: 'evaluate', name: 'Evaluate the solution', detail: 'Look back; if it fails, return' }
    ]
  },
  triz: {
    id: 'triz',
    name: 'TRIZ systematic problem solving',
    when: 'A contradiction: improving one thing makes another worse.',
    define: 'specific_problem',
    steps: [
      { id: 'specific_problem', name: 'Specific problem', detail: 'The problem as it appears' },
      { id: 'general_problem', name: 'General problem', detail: 'The underlying contradiction' },
      { id: 'general_solution', name: 'General solution', detail: 'Inventive principles' },
      { id: 'specific_solution', name: 'Specific solution', detail: 'Applied to this case' }
    ]
  }
});

export const MODEL_IDS = Object.freeze(['seven_step', 'polya', 'triz']);

/** @param {string} id */
export function defineStepOf(id) {
  const model = MODELS[id];
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model.define;
}
