// netlify/functions/_shared/problem-solver/decision-prompts.mjs
// Decision Maker's coach prompt. Three cached system layers, then the turn:
//   1. the rubric: shared voice, skills and gatekeeping, the book's stance, the compass, the
//      session shape, the decision traps and one catalogue line per model (fixed for every turn);
//   2. the step layer: what the current step is for (stable for the whole step);
//   3. the active model's note: steps, slots, watch-fors and exercise (stable while it is open).
// Problem Solver's prompt (prompts.mjs) never lists these models.
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { isComplete, nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { stepName, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { COMPASS } from '../../../../packages/decision-book/compass.mjs';
import { DECISION_MODEL } from '../../../../packages/decision-book/model.mjs';
import { activeRun, currentStep, followOn, frameKeysOf, skippedUntouched } from './session.mjs';
import { GATEKEEPING, THINKING_SKILLS, VOICE, outputBlock } from './prompts-shared.mjs';
import { SUMMARY_EVERY, earlierSteps, proposable, scoreNote, transcript } from './prompts.mjs';
import { COMPASS_GUIDE, DECISION_TRAPS, SECTION_LINE, STANCE, anotherAngle, catalogueLines, modelNote } from './knowledge/decision-book.mjs';

const MODEL_ID = DECISION_MODEL.id;

/** Fixed layer: identical for every turn of every decision session, so it caches. */
export const DECISION_RUBRIC = `You are the Decision Maker coach. You coach one person through a real decision, or something they want to see clearly, using the models in The Decision Book (Krogerus and Tschäppeler). You are a coach, not an assistant: warm, direct, and never flattering. You do not agree by default.

${VOICE}

${THINKING_SKILLS}

${STANCE}

${COMPASS_GUIDE}

SESSION SHAPE
1. Frame: get clear answers to three questions, one at a time. What are you deciding, or trying to see clearly (one sentence)? Who is it about, and what do you want (this places it on the compass)? What do you already know: the options, the facts, the deadline and what is at stake? Record each accepted answer in "frame" as decision, compass and known.
2. Discern: on the turn the last frame answer is accepted, recommend one model with "next_tool". Give one sentence on why it fits and name one sibling you passed over. Look in the lit compass section first, then match the "use it when" lines below to the frame. The person may pick another model from the shelf instead; go with their choice.
3. Quick route: for a small, everyday call where the options are already on the table, recommend dm_yes_no; once they decide to go ahead, dm_stop_rule sets the one trigger that would make them stop. Do not send a big or tangled decision down this route.
4. Work the model: follow its MODEL NOTE, one slot per answer, using only slot names from "Open slots". Never invent slots. Use the full slot name with its number (item:1, not item). Links join the node you are placing to slots already placed, using only the listed link kinds. A lens is short: explain the idea in two sentences, take the one marker or answer, and it is done.
5. Waiting: when the state shows "Waiting on", the person places or scores on the chart themselves. Do not place nodes or invent scores for them. Say what to place, then wait; talk about the picture once it is in.
6. Another angle: when the state says MINIMUM MET, offer the model's exercise if it has one, or one follow-up from ANOTHER ANGLE with "next_tool" and a one-sentence reason, or "next_step" to go to Decide. Offer one, not a menu. Every model run stays on the record.
7. Switching: if the same slot has been challenged twice, or the model no longer fits the decision, suggest a better model with "switch_tool" and a one-sentence reason.
8. Carry forward: use what earlier models established (listed under EARLIER) as the starting point, and say so. Do not copy it in without the person agreeing.
9. Tasks: only slots listed under "Can become tasks" qualify (the Eisenhower matrix's do-immediately items). When one is specific enough to start (a clear action, ideally a date), offer it in "proposeTasks" with its slot and a short task title. The person confirms each on a card; never say a task exists until TASKS shows it confirmed.
10. The person can move on at any time. Never block them.

${DECISION_TRAPS}

${GATEKEEPING}

THE MODELS (id (name) [section, worksheet or lens]: use it when; the book's own see also; our pairs well)
${SECTION_LINE}
${catalogueLines()}

${outputBlock({
  frame: ['decision', 'compass', 'known'],
  model: false,
  suggestion: '{"kind":"next_tool|switch_tool|next_step","tool":"...","reason":"..."}',
  tasks: '"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}]',
  rules: 'Include "proposeTasks" only for slots listed under "Can become tasks". Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "tool" only with next_tool or switch_tool, and only a model id from THE MODELS. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.'
})}`;

const DECIDE = `CURRENT STEP: Decide
Settle the decision in conversation: the decision in one sentence; the reasons, each resting on something a model showed; a Stop Rule (one trigger that would make them rethink, and the action agreed now); the first step; and a date to review it. Challenge a decision with no first step or nothing that would make them rethink. Do not suggest a model. Suggest next_step when it has what it needs.`;

const REVIEW = `CURRENT STEP: Review
Compare what the person expected when they decided with what actually happened, then what they learned about how they decide. Look at what happened, not the plan. Do not suggest a model. Suggest next_step when it is done.`;

/** Step layer: stable for the whole of a step, so it caches between turns. */
function stepLayer(session) {
  if (session.phase === 'finished') return 'The session is finished. Recap briefly when asked and help the person carry the learning forward. Do not suggest a model.';
  if (session.phase === 'frame') return 'NEXT AFTER FRAMING: Explore, where you discern the first model from the compass and the frame.';
  if (session.phase === 'decide') return DECIDE;
  if (session.phase === 'review') return REVIEW;
  return `CURRENT STEP: ${stepName(MODEL_ID, session.phase)}
Work the model that fits, then offer another angle or Decide. Choose only from THE MODELS.`;
}

/** The compass value as its labels: 'self_improve+others_improve' -> 'Improve yourself, Improve others'. */
function compassLabels(value) {
  const lit = String(value ?? '').split('+');
  return COMPASS.filter((q) => lit.includes(q.id)).map((q) => q.label).join(', ');
}

/** Minimum met: the exercise, the book's see also and ours (unused ones only), or Decide. */
function progressLine(session, run) {
  if (!followOn(session)) return 'Progress: not yet at the minimum for this model; keep working its steps.';
  const used = (currentStep(session)?.runs ?? []).map((item) => item.tool);
  const { book, ours } = anotherAngle(run.tool, used);
  const angle = [book.length ? `the book's see also: ${book.join(', ')}` : '', ours.length ? `ours: ${ours.join(', ')}` : ''].filter(Boolean).join('; ');
  return `Progress: MINIMUM MET. ANOTHER ANGLE: ${angle || 'none listed; pick from the compass section'}; or next_step to Decide.`;
}

function runState(session, run) {
  const def = TOOLS[run.tool];
  const nodes = run.nodes.map((node) => `  ${node.slot}${node.tag ? ` [${node.tag}]` : ''}${node.state === 'contested' ? ' (contested)' : ''}: ${node.text}`).join('\n') || '  (none yet)';
  const slotOf = (id) => run.nodes.find((n) => n.id === id)?.slot;
  const edges = run.edges.length ? `\nLinks:\n${run.edges.map((e) => `  ${slotOf(e.from)} -> ${slotOf(e.to)} (${e.kind})`).join('\n')}` : '';
  return [
    `ACTIVE MODEL: ${def.name} (${def.id})`,
    `Placed:\n${nodes}${edges}`,
    `Open slots: ${nextSlots(run).join(', ') || (isComplete(run) ? 'none (model complete)' : 'none open, but the model is not complete: see Waiting on or add links')}`,
    ...(def.scoreLine?.(run) ? [`Scores: ${def.scoreLine(run)}`] : []),
    ...(def.awaiting?.(run) ? [`Waiting on: ${def.awaiting(run)}`] : []),
    ...(def.promptNote?.(run) ? [`Note: ${def.promptNote(run)}`] : []),
    ...(def.taskSlots ? [`Can become tasks: ${proposable(session, run).join(', ') || 'none yet'}`] : []),
    progressLine(session, run)
  ].join('\n');
}

function taskLines(session) {
  const tasks = (session.proposedTasks ?? []).filter((p) => !p.removed);
  if (!tasks.length) return null;
  return `TASKS FROM THIS DECISION:\n${tasks.map((p) => `  ${p.status}: "${p.title}"${p.due ? ` due ${p.due}` : ''}`).join('\n')}`;
}

function boundaryLine(session) {
  const left = session.runner.leaving ? stepName(MODEL_ID, session.runner.leaving) : 'the last step';
  const leftStep = session.steps?.[session.runner.leaving];
  const ahead = session.phase === 'finished' ? 'what they want to take forward from this decision' : `what they want from ${stepName(MODEL_ID, session.phase)}`;
  if (skippedUntouched(leftStep)) return `MODE: boundary. The person has skipped ${left} without working a model. In one message: acknowledge the skip in one line; if skipping it matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask one question about ${ahead}. Do not ask a learning question.`;
  return `MODE: boundary. The person has just left ${left} (${leftStep?.status ?? 'unknown'}). In one message: a one-sentence recap of what ${left} established; if it was left unfinished in a way that matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask what they learned about how they decide. No model suggestion yet.`;
}

/** @returns {{ system: string[], user: string }} */
export function buildDecisionPrompt(session) {
  const run = activeRun(session);
  const parts = [`DECISION: ${session.title}`];
  if (session.runner?.mode === 'boundary') parts.push(boundaryLine(session));
  parts.push(`PHASE: ${session.phase}`);
  parts.push(`TODAY: ${String(session.updatedAt ?? '').slice(0, 10)}`);
  const missing = frameKeysOf(session).filter((key) => !session.frame[key]);
  parts.push(`Frame: ${JSON.stringify(session.frame)}${missing.length ? `\nMissing frame answers: ${missing.join(', ')}` : ''}`);
  if (session.frame.compass) parts.push(`COMPASS: ${compassLabels(session.frame.compass)}`);
  const earlier = earlierSteps(session);
  if (earlier) parts.push(earlier.replace(/^EARLIER STEPS:/, 'EARLIER:'));
  if (session.pendingLearning && session.runner?.mode !== 'boundary') {
    const from = stepName(MODEL_ID, session.pendingLearning);
    const offer = session.phase === 'explore' && !run ? ' and suggest a model with next_tool' : '';
    parts.push(`AWAITING LEARNING from ${from}: if they named something they learned about how they decide, put it in "learning" (one sentence, their meaning); otherwise leave learning null. Either way, orient them to the current step in one sentence${offer}.`);
  }
  const step = currentStep(session);
  if (step) {
    for (const item of step.runs.filter((r) => r.status !== 'active')) {
      parts.push(`Earlier model in this step ${item.tool}: ${item.status}${item.switchReason ? ` (${item.switchReason})` : ''}; ${item.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}${scoreNote(item)}`);
    }
  }
  if (run) parts.push(runState(session, run));
  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary' && toolsForPlanStep(MODEL_ID, session.phase).length) parts.push('No model is open in this step yet: recommend one with next_tool, naming a sibling you passed over.');
  const tasks = taskLines(session);
  if (tasks) parts.push(tasks);
  if (session.pendingKeep) parts.push(`Last challenged answer (${session.pendingKeep.slot}): ${session.pendingKeep.text}`);
  if (session.summary) parts.push(`Summary so far: ${session.summary}`);
  const coachTurns = session.turns.filter((t) => t.role === 'coach').length;
  if (coachTurns > 0 && coachTurns % SUMMARY_EVERY === 0) parts.push('A summary is due this turn.');
  parts.push(`RECENT CONVERSATION:\n${transcript(session)}`);
  const note = run ? modelNote(run.tool) : null;
  return { system: [DECISION_RUBRIC, stepLayer(session), ...(note ? [note] : [])], user: parts.join('\n\n') };
}
