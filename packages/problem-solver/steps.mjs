// packages/problem-solver/steps.mjs
import { MODELS } from './models.mjs';
import { TOOLS } from './tools/index.mjs';

/** Tool families. A tool's `step` is one of these. `contradiction` is TRIZ only. */
export const BOOK_STEPS = Object.freeze([
  { id: 'define', name: 'Define', detail: 'Problem recognition and definition' },
  { id: 'analyse', name: 'Analyse', detail: 'Problem analysis' },
  { id: 'devise', name: 'Devise', detail: 'Generate alternate solutions' },
  { id: 'decide', name: 'Decide', detail: 'Select solution' },
  { id: 'implement', name: 'Implement', detail: 'Plan and act' },
  { id: 'improve', name: 'Improve', detail: 'Evaluate outcome' },
  { id: 'document', name: 'Document', detail: 'Record key information' },
  { id: 'contradiction', name: 'Contradiction', detail: 'Name what improves and what worsens' }
]);

export const BOOK_STEP_IDS = Object.freeze(BOOK_STEPS.map((s) => s.id));

const entry = (step, book, extra = false) => Object.freeze({ step, book: Object.freeze(book), extra });

/**
 * Ordered steps a session walks for each model. `book` lists the tool families the
 * coach chooses from. `extra` steps come after the model's own steps and are offered,
 * not required (they still appear on the record, under the diagram).
 */
const PLANS = Object.freeze({
  seven_step: Object.freeze(['define', 'analyse', 'devise', 'decide', 'implement', 'improve', 'document'].map((id) => entry(id, [id]))),
  polya: Object.freeze([
    entry('identify', ['define']),
    entry('devise', ['devise', 'decide']),
    entry('implement', ['implement']),
    entry('evaluate', ['improve']),
    entry('document', ['document'], true)
  ]),
  triz: Object.freeze([
    entry('specific_problem', ['define']),
    entry('general_problem', ['contradiction']),
    entry('general_solution', ['devise']),
    entry('specific_solution', ['decide']),
    entry('implement', ['implement'], true),
    entry('improve', ['improve'], true),
    entry('document', ['document'], true)
  ])
});

/** Preferred fallback tool per book step, first registered wins (later plans register the rest). */
const DEFAULTS = Object.freeze({
  define: ['five_whys'],
  contradiction: ['contradiction'],
  analyse: ['causal_map', 'perspective_shift'],
  devise: ['lotus_blossom', 'solution_tree'],
  decide: ['decision_matrix', 'swot'],
  implement: ['kanban', 'fifteen_percent'],
  improve: ['after_action_review', 'double_loop'],
  document: ['five_cs']
});

/** @param {string} modelId */
export function stepPlan(modelId) {
  const plan = PLANS[modelId];
  if (!plan) throw new Error(`Unknown model: ${modelId}`);
  return plan;
}

export function planStep(modelId, stepId) {
  return stepPlan(modelId).find((s) => s.step === stepId) ?? null;
}

export function firstStep(modelId) {
  return stepPlan(modelId)[0].step;
}

export function nextStepAfter(modelId, stepId) {
  const plan = stepPlan(modelId);
  const i = plan.findIndex((s) => s.step === stepId);
  return i >= 0 && i < plan.length - 1 ? plan[i + 1].step : null;
}

export function stepName(modelId, stepId) {
  const own = MODELS[modelId]?.steps.find((s) => s.id === stepId);
  if (own) return own.name;
  return BOOK_STEPS.find((s) => s.id === stepId)?.name ?? stepId;
}

/** Tool ids usable in a plan step, in registry order. */
export function toolsForPlanStep(modelId, stepId) {
  const books = planStep(modelId, stepId)?.book ?? [];
  return Object.values(TOOLS).filter((tool) => books.includes(tool.step)).map((tool) => tool.id);
}

export function defaultToolFor(modelId, stepId) {
  for (const book of planStep(modelId, stepId)?.book ?? []) {
    const id = (DEFAULTS[book] ?? []).find((tool) => TOOLS[tool]?.step === book);
    if (id) return id;
  }
  return toolsForPlanStep(modelId, stepId)[0] ?? null;
}
