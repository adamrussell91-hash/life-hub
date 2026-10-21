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
import { FEEDBACK_ID, RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
import { basisCandidates, basisOf, recordOffer } from '../../../../packages/decision-book/record.mjs';
import { activeRun, currentStep, followOn, frameKeysOf, skippedUntouched, waitingForReview } from './session.mjs';
import { GATEKEEPING, THINKING_SKILLS, VOICE, outputBlock } from './prompts-shared.mjs';
import { SUMMARY_EVERY, earlierSteps, proposable, scoreNote, taskStatusLine, transcript } from './prompts.mjs';
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
9. Tasks: only slots listed under "Can become tasks" qualify (the Eisenhower matrix's do-immediately items, and the decision record's first step). When one is specific enough to start (a clear action, ideally a date), offer it in "proposeTasks" with its slot and a short task title. The person confirms each on a card; never say a task exists until TASKS shows it confirmed.
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
  tasks: '"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}],"basis":[{"tool":"...","slot":"..."}]',
  rules: 'Include "proposeTasks" only for slots listed under "Can become tasks". Include "basis" only with a decision record reason. Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "tool" only with next_tool or switch_tool, and only a model id from THE MODELS, or the tool CURRENT STEP names in Decide and Review. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.'
})}`;

const record = TOOLS[RECORD_ID];

const DECIDE = `CURRENT STEP: Decide
Settle the decision on the decision record (${RECORD_ID}), the one tool in this step. When no record is open, suggest it with next_tool. Work its slots in order, one per answer:
${record.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}
Slot meanings: ${Object.entries(record.slots).map(([k, v]) => `${k} = ${v}`).join('; ')}.
DECISION RECORD RULES
- decision: one sentence the person would say to someone it affects. Seed it from the frame and what the models showed, and confirm before placing.
- reason: accept only a reason that rests on something a model placed. Put those nodes in "basis" as [{"tool":"<model id>","slot":"<slot>"}], chosen from REASONS CAN REST ON. Never invent a node. A reason that rests on nothing a model showed is challenged (critical_thinking).
- trigger: something the person would notice, with a date or a number where it can have one. action: what they agree now to do if it happens, not "think again".
- first_step: small enough to start this week. It can become a task: offer it in "proposeTasks" with a short title and its date if they gave one. The person confirms it on a card; never say a task exists until TASKS shows it confirmed.
- review: a date after TODAY, in node.text as YYYY-MM-DD. It becomes a review card the person confirms; never say it is set until REVIEW shows it created.
- Challenge a decision with no first step or nothing that would make them rethink.
- When the record is complete, suggest next_step: Review then waits for its date.`;

const REVIEW = `CURRENT STEP: Review
Review compares what the person expected when they decided with what actually happened, on the feedback analysis (${FEEDBACK_ID}).
- When REVIEW IS WAITING, the results are not in yet: say Review picks up on its date, and that they can press Review now if results are already in. Do not suggest a model or place nodes.
- In a review: when no feedback analysis is open, suggest it with next_tool. Seed the centre from the decision; seed the expected side from the record's reasons and Stop Rule, and from any feedback analysis written in Explore before acting; seed the actual side from TASK STATUS and what the person says happened. Confirm before placing. Look at what happened, not the plan.
- In the reflection, ask what the match or mismatch says about how they decide, and whether the Stop Rule's trigger came.
- When it is complete, suggest next_step to close the review.`;

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
  if (run.tool === RECORD_ID) return 'Progress: RECORD COMPLETE. Suggest next_step: Review waits for its date.';
  if (session.phase === 'review') return 'Progress: MINIMUM MET. Suggest next_step to close the review.';
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

/** In Decide, the Explore nodes a reason can rest on, and what each placed reason rests on. */
function basisLines(session, run) {
  if (run.tool !== RECORD_ID) return [];
  const candidates = basisCandidates(session);
  const lines = [`REASONS CAN REST ON (tool slot: node):\n${candidates.map((c) => `  ${c.tool} ${c.slot}: ${c.title}`).join('\n') || '  nothing yet: no model placed anything in Explore'}`];
  const basis = basisOf(session);
  const rested = run.nodes.filter((node) => basis[node.id]).map((node) => `  ${node.slot} rests on ${basis[node.id].map((b) => `${b.model}: ${b.title}`).join('; ')}`);
  if (rested.length) lines.push(`Placed reasons rest on:\n${rested.join('\n')}`);
  return lines;
}

function taskLines(session) {
  const tasks = (session.proposedTasks ?? []).filter((p) => !p.removed);
  const proposal = session.reviewProposal;
  if (!tasks.length && !proposal && !session.reviewTaskId) return null;
  const review = session.reviewTaskId
    ? `created for ${proposal?.due ?? 'its date'}`
    : proposal?.status === 'dismissed' ? 'set aside by the person' : proposal ? `${proposal.status} for ${proposal.due}` : 'none yet';
  return `TASKS FROM THIS DECISION:\n${tasks.map((p) => `  ${p.status}: "${p.title}"${p.due ? ` due ${p.due}` : ''}`).join('\n') || '  none'}\nREVIEW: ${review}`;
}

/** Review's state, the task evidence, and the decision record on its page. */
function reviewLines(session) {
  const lines = [];
  const state = session.reviewState;
  if (state?.status === 'waiting') lines.push(`REVIEW IS WAITING for results. It is ${session.reviewTaskId ? 'a task' : 'proposed'} for ${state.due ?? 'a date not yet set'}. Do not suggest a model or place nodes.`);
  if (state?.status === 'reviewing') lines.push(`REVIEW IN PROGRESS since ${String(state.startedAt).slice(0, 10)}. Look at what actually happened, not the plan.`);
  if (session.taskSnapshot) lines.push(taskStatusLine(session.taskSnapshot));
  const offer = recordOffer(session);
  const written = session.caseFile;
  if (written) {
    const where = written.target.kind === 'project' ? 'the linked project' : 'the linked task';
    const changed = offer?.kind === 'update' ? ` Changed since: ${offer.changed.map((key) => offer.file.sections.find((s) => s.key === key)?.heading).join(', ')}. The person can add update v${offer.version} from the card.` : '';
    lines.push(`DECISION RECORD: v${written.version} written ${written.writtenAt.slice(0, 10)} to ${where}.${changed}`);
  } else if (offer) lines.push('DECISION RECORD: ready to write. The person writes it onto a task or project page from the card; it is not written yet.');
  return lines;
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
  if (session.phase === 'frame' && session.startModel) parts.push(`SHELF PICK: the person started from ${TOOLS[session.startModel].name} (${session.startModel}). When framing ends it opens on that model: suggest it with next_tool and say in one sentence how it fits the frame.`);
  const earlier = earlierSteps(session);
  if (earlier) parts.push(earlier.replace(/^EARLIER STEPS:/, 'EARLIER:'));
  if (session.model) parts.push(...reviewLines(session));
  if (session.pendingLearning && session.runner?.mode !== 'boundary') {
    const from = stepName(MODEL_ID, session.pendingLearning);
    const offer = session.phase === 'explore' && !run ? ' and suggest a model with next_tool' : session.phase === 'decide' && !run ? ' and suggest the decision record with next_tool' : '';
    const orient = waitingForReview(session) ? 'Then say Review picks up on its date, and do not suggest a model.' : `Either way, orient them to the current step in one sentence${offer}.`;
    parts.push(`AWAITING LEARNING from ${from}: if they named something they learned about how they decide, put it in "learning" (one sentence, their meaning); otherwise leave learning null. ${orient}`);
  }
  const step = currentStep(session);
  if (step) {
    for (const item of step.runs.filter((r) => r.status !== 'active')) {
      parts.push(`Earlier model in this step ${item.tool}: ${item.status}${item.switchReason ? ` (${item.switchReason})` : ''}; ${item.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}${scoreNote(item)}`);
    }
  }
  if (run) parts.push(runState(session, run), ...basisLines(session, run));
  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary' && !waitingForReview(session)) {
    if (session.phase === 'explore') parts.push('No model is open in this step yet: recommend one with next_tool, naming a sibling you passed over.');
    else if (toolsForPlanStep(MODEL_ID, session.phase).length) parts.push(`No tool is open in this step yet: suggest ${toolsForPlanStep(MODEL_ID, session.phase)[0]} with next_tool.`);
  }
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
