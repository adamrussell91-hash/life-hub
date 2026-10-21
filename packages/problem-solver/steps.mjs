// packages/problem-solver/steps.mjs
import { MODELS } from './models.mjs';
import { TOOLS } from './tools/index.mjs';
import { DECISION_MODEL } from '../decision-book/model.mjs';
import { CATALOGUE_IDS } from '../decision-book/catalogue.mjs';

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

const entry = (step, book, extra = false, tools = null) => Object.freeze({ step, book: Object.freeze(book), extra, ...(tools ? { tools } : {}) });

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
  ]),
  // Decision Maker: the coach discerns the model, so Explore names its tools (every catalogue
  // model registered as a tool) and has no default.
  decision_book: Object.freeze([
    entry('explore', ['explore'], false, () => CATALOGUE_IDS.filter((id) => TOOLS[id])),
    entry('decide', ['settle']),
    entry('review', ['review'], true)
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

const modelDef = (modelId) => MODELS[modelId] ?? (modelId === DECISION_MODEL.id ? DECISION_MODEL : null);

export function stepName(modelId, stepId) {
  const own = modelDef(modelId)?.steps.find((s) => s.id === stepId);
  if (own) return own.name;
  return BOOK_STEPS.find((s) => s.id === stepId)?.name ?? stepId;
}

/** Tool ids usable in a plan step: its own list when it names one, else registry order. */
export function toolsForPlanStep(modelId, stepId) {
  const step = planStep(modelId, stepId);
  if (step?.tools) return step.tools();
  const books = step?.book ?? [];
  return Object.values(TOOLS).filter((tool) => books.includes(tool.step)).map((tool) => tool.id);
}

/** A step that names its own tools has no default: the coach chooses. */
export function defaultToolFor(modelId, stepId) {
  const step = planStep(modelId, stepId);
  if (step?.tools) return null;
  for (const book of step?.book ?? []) {
    const id = (DEFAULTS[book] ?? []).find((tool) => TOOLS[tool]?.step === book);
    if (id) return id;
  }
  return toolsForPlanStep(modelId, stepId)[0] ?? null;
}

/** The plan step of a model whose tool families include `book`, or null. */
export function planStepForBook(modelId, book) {
  return stepPlan(modelId).find((s) => s.book.includes(book))?.step ?? null;
}

/**
 * The option chosen in Decide and carried into Implement as its aim: the `choice` node of
 * the latest Decide run that was not switched away from, or null. Read by the prompt, the
 * canvas aim caption and Improve's carry-forward.
 */
export function chosenOption(session) {
  const runs = Object.values(session.steps ?? {}).flatMap((step) => step.runs).filter((run) => run.status !== 'switched' && TOOLS[run.tool]?.step === 'decide');
  for (const run of runs.reverse()) {
    const node = run.nodes.find((item) => item.slot === 'choice');
    if (node) return { text: node.text, title: node.title ?? node.text, contested: node.state === 'contested', runId: run.id, tool: run.tool };
  }
  return null;
}

/**
 * Where Move on goes from the session's current step: back from a reopened step
 * (`detour`), back to where a late review began (`reviewState.returnTo`), otherwise
 * the next plan step. Null means the session finishes.
 */
export function nextPhase(session) {
  if (!session.model) return null;
  if (session.detour && session.detour.to === session.phase) return session.detour.from;
  const review = session.reviewState;
  if (review?.status === 'reviewing' && review.returnTo && session.phase === planStepForBook(session.model.id, 'improve')) {
    return review.returnTo === 'finished' ? null : review.returnTo;
  }
  return nextStepAfter(session.model.id, session.phase);
}

/** True when the session has moved beyond plan step `stepId` (or finished). */
export function pastStep(session, stepId) {
  if (session.phase === 'finished') return true;
  const order = stepPlan(session.model.id).map((s) => s.step);
  const here = order.indexOf(session.phase);
  return here >= 0 && here > order.indexOf(stepId);
}
