// packages/problem-solver/steps.mjs
import { MODELS } from './models.mjs';
import { TOOLS } from './tools/index.mjs';
import { DECISION_MODEL } from '../decision-book/model.mjs';
import { CATALOGUE_IDS } from '../decision-book/catalogue.mjs';
import { FEEDBACK_ID } from '../decision-book/record-slots.mjs';
import { GEAR_SHIFTER_MODEL, REVIEW_TOOL as GEAR_REVIEW_TOOL } from '../get-things-done/model.mjs';
import { CATALOGUE as GEAR_CATALOGUE } from '../get-things-done/catalogue.mjs';
import { COMMIT_ID as GEAR_COMMIT, EXPERIMENT_REVIEW_ID as GEAR_EXPERIMENT_REVIEW } from '../get-things-done/commit-slots.mjs';
import { RULES_BOOK_MODEL } from '../rules-book/model.mjs';
import { CATALOGUE as RULES_CATALOGUE } from '../rules-book/catalogue.mjs';
import { COMMIT_ID as RULES_COMMIT, REVIEW_ID as RULES_REVIEW } from '../rules-book/commit-slots.mjs';
import { CHANGE_BOOK_MODEL } from '../change-book/model.mjs';
import { CATALOGUE as CHANGE_CATALOGUE } from '../change-book/catalogue.mjs';
import { COMMIT_ID as CHANGE_COMMIT, REVIEW_ID as CHANGE_REVIEW } from '../change-book/commit-slots.mjs';
import { COLLABORATION_BOOK_MODEL } from '../collaboration-book/model.mjs';
import { CATALOGUE as COLLAB_CATALOGUE } from '../collaboration-book/catalogue.mjs';
import { COMMIT_ID as COLLAB_COMMIT, REVIEW_ID as COLLAB_REVIEW } from '../collaboration-book/commit-slots.mjs';

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

/**
 * `tools` names a step's tools explicitly. `serves` is the toolkit role a step plays in the
 * session's machinery (Decision Maker's Decide plays Implement's part in proposing the review;
 * its Review plays Improve's), without its tools joining that toolkit step.
 */
const entry = (step, book, extra = false, tools = null, serves = null) => Object.freeze({ step, book: Object.freeze(book), extra, ...(tools ? { tools } : {}), ...(serves ? { serves } : {}) });

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
  // model registered as a tool) and has no default. Decide's one tool is the decision record;
  // Review names the feedback analysis, which compares what was expected with what happened.
  decision_book: Object.freeze([
    entry('explore', ['explore'], false, () => CATALOGUE_IDS.filter((id) => TOOLS[id])),
    entry('decide', ['settle'], false, null, 'implement'),
    entry('review', ['review'], true, () => [FEEDBACK_ID], 'improve')
  ]),
  // Gear Shifter: as Decision Maker, the coach discerns the technique, so Explore names its
  // tools. Commit's tools carry their own step, 'commit', so no other book's settle tool joins
  // it. Review names the experiment review and, for a finished project, Project Evaluation;
  // with two it has no default, so the coach chooses.
  gear_shifter: Object.freeze([
    entry('explore', ['explore'], false, () => GEAR_CATALOGUE.map((e) => e.id).filter((id) => TOOLS[id])),
    entry('commit', ['commit'], false, () => [GEAR_COMMIT].filter((id) => TOOLS[id]), 'implement'),
    entry('review', ['review'], true, () => [GEAR_EXPERIMENT_REVIEW, GEAR_REVIEW_TOOL].filter((id) => TOOLS[id]), 'improve')
  ]),
  // Rules Book: the coach selects the rule, so Explore names the catalogue's tools; Act has the
  // one experiment tool and Review the one review.
  rules_book: Object.freeze([
    entry('explore', ['explore'], false, () => RULES_CATALOGUE.map((e) => e.id).filter((id) => TOOLS[id])),
    entry('commit', ['commit'], false, () => [RULES_COMMIT].filter((id) => TOOLS[id]), 'implement'),
    entry('review', ['review'], true, () => [RULES_REVIEW].filter((id) => TOOLS[id]), 'improve')
  ]),
  // Change Book: as the Rules Book, the coach selects the model, so Explore names the
  // catalogue's tools; Act has the one reversible step and Review the one review.
  change_book: Object.freeze([
    entry('explore', ['explore'], false, () => CHANGE_CATALOGUE.map((e) => e.id).filter((id) => TOOLS[id])),
    entry('commit', ['commit'], false, () => [CHANGE_COMMIT].filter((id) => TOOLS[id]), 'implement'),
    entry('review', ['review'], true, () => [CHANGE_REVIEW].filter((id) => TOOLS[id]), 'improve')
  ]),
  // Collaboration Book: as the Change Book, the coach selects the model, so Explore names the
  // catalogue's tools; Agree has the one experiment and Review the one review.
  collaboration_book: Object.freeze([
    entry('explore', ['explore'], false, () => COLLAB_CATALOGUE.map((e) => e.id).filter((id) => TOOLS[id])),
    entry('commit', ['commit'], false, () => [COLLAB_COMMIT].filter((id) => TOOLS[id]), 'implement'),
    entry('review', ['review'], true, () => [COLLAB_REVIEW].filter((id) => TOOLS[id]), 'improve')
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

const BOOK_MODELS = Object.freeze({ [DECISION_MODEL.id]: DECISION_MODEL, [GEAR_SHIFTER_MODEL.id]: GEAR_SHIFTER_MODEL, [RULES_BOOK_MODEL.id]: RULES_BOOK_MODEL, [CHANGE_BOOK_MODEL.id]: CHANGE_BOOK_MODEL, [COLLABORATION_BOOK_MODEL.id]: COLLABORATION_BOOK_MODEL });
const modelDef = (modelId) => MODELS[modelId] ?? BOOK_MODELS[modelId] ?? null;

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

/** A step that names its own tools has no default (the coach chooses) unless it names only one. */
export function defaultToolFor(modelId, stepId) {
  const step = planStep(modelId, stepId);
  if (step?.tools) {
    const named = step.tools();
    return named.length === 1 ? named[0] : null;
  }
  for (const book of step?.book ?? []) {
    const id = (DEFAULTS[book] ?? []).find((tool) => TOOLS[tool]?.step === book);
    if (id) return id;
  }
  return toolsForPlanStep(modelId, stepId)[0] ?? null;
}

/** True when plan step `stepId` uses `book`'s tools or plays its part (`serves`). */
export function stepServes(modelId, stepId, book) {
  const step = planStep(modelId, stepId);
  return Boolean(step && (step.book.includes(book) || step.serves === book));
}

/** The plan step of a model whose tool families include `book`, or that serves it, or null. */
export function planStepForBook(modelId, book) {
  return stepPlan(modelId).find((s) => s.book.includes(book) || s.serves === book)?.step ?? null;
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
