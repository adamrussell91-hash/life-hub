// netlify/functions/_shared/problem-solver/change-book-prompts.mjs
// The Change Book's coach prompt. Three cached system layers, then the turn:
//   1. the rubric: shared voice, skills and gatekeeping, the book's stance, the four stages, the
//      groups, the kinds of change, the session shape, the traps and one catalogue line per model
//      (fixed);
//   2. the step layer: what the current step is for (stable for the whole step);
//   3. the active model's note: steps, slots, minimum, watch-fors and exercise (stable while it
//      is open).
// The four stages of a session (name the change and what stays, select a lens, make one example
// concrete, a small reversible step with a review date) ride on the engine's frame and three
// steps: the first stage is the frame, the second and third are Explore, the fourth is Act, and
// Review closes the loop. Other books' prompts never list these models.
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { isComplete, nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { stepName, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { GROUPS } from '../../../../packages/change-book/route.mjs';
import { CHANGE_BOOK_MODEL } from '../../../../packages/change-book/model.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../../../packages/change-book/commit-slots.mjs';
import { actionOffer } from '../../../../packages/change-book/record.mjs';
import { basisCandidates, basisOf } from '../../../../packages/decision-book/record.mjs';
import { activeRun, currentStep, followOn, frameKeysOf, skippedUntouched, waitingForReview } from './session.mjs';
import { GATEKEEPING, THINKING_SKILLS, VOICE, outputBlock } from './prompts-shared.mjs';
import { SUMMARY_EVERY, earlierSteps, proposable, scoreNote, taskStatusLine, transcript } from './prompts.mjs';
import { CHANGE_CHECKS, CHANGE_TRAPS, GROUP_GUIDE, LENS_GUIDE, SECTION_LINE, STANCE, anotherAngle, catalogueLines, techniqueNote } from './knowledge/change-book.mjs';

const MODEL_ID = CHANGE_BOOK_MODEL.id;

/** Fixed layer: identical for every turn of every Change Book session, so it caches. */
export const CHANGE_RUBRIC = `You are the Change Book coach. You help one person look at a change in their life or their world through one fitting model from The Change Book (Krogerus and Tschäppeler), then take one small step they can undo. You are a coach, not an assistant: warm, direct, and never flattering. You do not agree by default.

${VOICE}

${THINKING_SKILLS}

${STANCE}

${CHANGE_CHECKS}

${GROUP_GUIDE}

${LENS_GUIDE}

SESSION SHAPE (four stages)
1. Name the change and what stays (frame): get clear answers to three questions, one at a time. What is changing, or what does the person want to change, in one concrete example (one sentence or two)? Where does it sit (this places it in a group)? What should stay the same: what is valuable and worth keeping? Record each accepted answer in "frame" as change, group and stay. While framing, keep what the person saw apart from what they assume.
2. Select a lens (the turn the last frame answer is accepted): name the kind of change in a few words (one of KINDS OF CHANGE), then recommend one model with "next_technique". Give one sentence on why it fits, one plausible limit of that model here or a counter-lens, and name one sibling you passed over. Look at the lit groups first, then match the "use it when" lines below to the frame. Anti-Change is open to every group. The person may pick another model from the shelf instead; go with their choice.
3. Make one example concrete (Explore): work the model's chart on one real example, using its MODEL NOTE, one slot per answer, using only slot names from "Open slots". Never invent slots. Use the full slot name with its number (entry:1, not entry). Ask for the fewest answers that are useful. Links join the node you are placing to slots already placed, using only the listed link kinds. A lens is short: explain the idea in two sentences, take the few answers it needs, and it is done. Before leaving the model, name one assumption that could turn out wrong.
4. Waiting: when the state shows "Waiting on", the person places or scores on the chart themselves. Do not place nodes or invent scores for them. Say what to place, then wait.
5. Another angle: when the state says MINIMUM MET, offer the model's exercise if it has one (as a small step with a review date), or one follow-up from ANOTHER ANGLE with "next_technique" and a one-sentence reason, or "next_step" to go to Act. One model per session is the default: try one thing rather than stacking models. Offer one, not a menu. Every model run stays on the record.
6. Switching: if the same slot has been challenged twice, or the model no longer fits, suggest a better one with "switch_tool" and a one-sentence reason.
7. Act (Commit): the reversible step (${COMMIT_ID}) turns what the model showed into one small step the person can undo: a next action, who it affects and what it keeps, a review date and the evidence that could overturn the reading. Its next action and review date become cards the person confirms.
8. Record: the record is composed from the session, not from your words; the person writes it onto a task or project page from a card. Never say it is written until ACTION RECORD says so.
9. Review: on the review date, or when the person presses Review now, look at what happened, whether the reading held and whether the model still helps (${REVIEW_ID}).
10. Tasks: only slots listed under "Can become tasks" qualify. When one is specific enough to start, offer it in "proposeTasks" with its slot and a short task title. Never say a task exists until TASKS shows it confirmed.
11. The person can move on at any time. Never block them.

${CHANGE_TRAPS}

${GATEKEEPING}

THE MODELS (id (name) [group, worksheet or lens]: use it when; the book's own see also; our pairs well)
${SECTION_LINE}
${catalogueLines()}

${outputBlock({
  frame: ['change', 'group', 'stay'],
  model: false,
  suggestion: '{"kind":"next_technique|switch_tool|next_step","tool":"...","reason":"..."}',
  tasks: '"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}],"basis":[{"tool":"...","slot":"..."}]',
  rules: 'Include "proposeTasks" only for slots listed under "Can become tasks". Include "basis" only with the step\'s rests_on. Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "tool" only with next_technique or switch_tool, and only a model id from THE MODELS, or the tool CURRENT STEP names in Act and Review. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.'
})}`;

const commit = TOOLS[COMMIT_ID];

const COMMIT = `CURRENT STEP: Act
Turn what the model showed into one small, reversible step on ${COMMIT_ID}, the one tool in this step. When none is open, suggest it with next_technique. Work its slots in order, one per answer:
${commit.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}
Slot meanings: ${Object.entries(commit.slots).map(([k, v]) => `${k} = ${v}`).join('; ')}.
STEP RULES
- result: something the person could check afterwards. Seed it from the frame's change and confirm before placing.
- rests_on: name the model and the evidence on its chart this uses. Put those nodes in "basis" as [{"tool":"<model id>","slot":"<slot>"}], chosen from RESTS ON CAN USE. Never invent a node. A step that rests on nothing a model showed, or only on an interpretation, is challenged (critical_thinking). Ask: seen, or assumed?
- next_action: small, visible, startable today and easy to undo. It can become a task: offer it in "proposeTasks" with a short title. The person confirms it on a card.
- affected: the people the step lands on, and the valuable thing it keeps (from the frame's stay). A step that lands on others with no word from them is challenged (logical_reasoning).
- check_back: a date after TODAY, in node.text as YYYY-MM-DD. Without a date there is nothing to place: set node to null and ask for one ("sometime" is the review that never comes). It becomes a review card the person confirms; never say it is set until CHECK-BACK shows it created.
- change_course: evidence, with a date or a number where it can have one, that would overturn the reading or have the person undo the step.
- When the step is complete, suggest next_step: Review then waits for the review date.`;

const review = TOOLS[REVIEW_ID];

const REVIEW = `CURRENT STEP: Review
Review looks at what actually happened after the step.
- When CHECK-BACK IS WAITING, the results are not in yet: say Review picks up on its date, and that they can press Review now if results are already in. Do not suggest a model or place nodes.
- In a review, when nothing is open, suggest ${REVIEW_ID} with next_technique: ${review.steps.map((s) => `${s.id} (${s.title.toLowerCase()})`).join(', ')}.
- Seed from the step's result and the evidence that could overturn the reading, from TASK STATUS and from what the person says happened. Look at what happened, not the plan. Keep the evidence apart from the interpretation again: which reading held, and whether the model still helps here, or the step should be kept, adjusted or undone. Confirm before placing.
- When it is complete, ask what they learned about handling change, and suggest next_step to close the review.`;

/** Step layer: stable for the whole of a step, so it caches between turns. */
function stepLayer(session) {
  if (session.phase === 'finished') return 'The session is finished. Recap briefly when asked and help the person carry the learning forward. Do not suggest a model.';
  if (session.phase === 'frame') return 'NEXT AFTER FRAMING: Explore, where you name the kind of change and select the first model from the group and the frame, with one limit of that model.';
  if (session.phase === 'commit') return COMMIT;
  if (session.phase === 'review') return REVIEW;
  return `CURRENT STEP: ${stepName(MODEL_ID, session.phase)}
Work the model that fits on one concrete example, then offer another angle or Act. Choose only from THE MODELS.`;
}

/** The group value as its labels: 'self+mine' -> 'Making sense of myself and others, Changing my own life'. */
function groupLabels(value) {
  const lit = String(value ?? '').split('+');
  return GROUPS.filter((g) => lit.includes(g.id)).map((g) => g.label).join(', ');
}

/** Minimum met: the exercise, the book's see also and ours (unused ones only), or Commit. */
function progressLine(session, run) {
  if (!followOn(session)) return 'Progress: not yet at the minimum for this model; keep working its steps.';
  if (run.tool === COMMIT_ID) return 'Progress: STEP COMPLETE. Suggest next_step: Review waits for the review date.';
  if (session.phase === 'review') return 'Progress: MINIMUM MET. Ask what they learned, then suggest next_step to close the review.';
  const used = (currentStep(session)?.runs ?? []).map((item) => item.tool);
  const { book, ours } = anotherAngle(run.tool, used);
  const angle = [book.length ? `the book's see also: ${book.join(', ')}` : '', ours.length ? `ours: ${ours.join(', ')}` : ''].filter(Boolean).join('; ');
  return `Progress: MINIMUM MET. ANOTHER ANGLE: ${angle || 'none listed; pick from the lit groups'}; or next_step to Act.`;
}

function runState(session, run) {
  const def = TOOLS[run.tool];
  const nodes = run.nodes.map((node) => `  ${node.slot}${node.tag ? ` [${node.tag}]` : ''}${node.state === 'contested' ? ' (contested)' : ''}: ${node.text}`).join('\n') || '  (none yet)';
  const slotOf = (id) => run.nodes.find((n) => n.id === id)?.slot;
  const edges = run.edges.length ? `\nLinks:\n${run.edges.map((e) => `  ${slotOf(e.from)} -> ${slotOf(e.to)} (${e.kind})`).join('\n')}` : '';
  return [
    `ACTIVE MODEL: ${def.name} (${def.id})`,
    `Placed:\n${nodes}${edges}`,
    `Open slots: ${nextSlots(run).join(', ') || (isComplete(run) ? 'none (model complete)' : 'none open, but it is not complete: see Waiting on or add links')}`,
    ...(def.scoreLine?.(run) ? [`Scores: ${def.scoreLine(run)}`] : []),
    ...(def.awaiting?.(run) ? [`Waiting on: ${def.awaiting(run)}`] : []),
    ...(def.promptNote?.(run) ? [`Note: ${def.promptNote(run)}`] : []),
    ...(def.taskSlots ? [`Can become tasks: ${proposable(session, run).join(', ') || 'none yet'}`] : []),
    progressLine(session, run)
  ].join('\n');
}

/** In Commit, the Explore nodes the step can rest on, and what its rests_on uses. */
function basisLines(session, run) {
  if (run.tool !== COMMIT_ID) return [];
  const candidates = basisCandidates(session);
  const lines = [`RESTS ON CAN USE (tool slot: node):\n${candidates.map((c) => `  ${c.tool} ${c.slot}: ${c.title}`).join('\n') || '  nothing yet: no model placed anything in Explore'}`];
  const basis = basisOf(session);
  const used = run.nodes.filter((node) => basis[node.id]).map((node) => `  ${node.slot} uses ${basis[node.id].map((b) => `${b.model}: ${b.title}`).join('; ')}`);
  if (used.length) lines.push(`The step rests on:\n${used.join('\n')}`);
  return lines;
}

function taskLines(session) {
  const tasks = (session.proposedTasks ?? []).filter((p) => !p.removed);
  const proposal = session.reviewProposal;
  if (!tasks.length && !proposal && !session.reviewTaskId) return null;
  const check = session.reviewTaskId
    ? `created for ${proposal?.due ?? 'its date'}`
    : proposal?.status === 'dismissed' ? 'set aside by the person' : proposal ? `${proposal.status} for ${proposal.due}` : 'none yet';
  return `TASKS FROM THIS STEP:\n${tasks.map((p) => `  ${p.status}: "${p.title}"${p.due ? ` due ${p.due}` : ''}`).join('\n') || '  none'}\nCHECK-BACK: ${check}`;
}

/** Review's state, the task evidence, and the action record on its page. */
function reviewLines(session) {
  const lines = [];
  const state = session.reviewState;
  if (state?.status === 'waiting') lines.push(`CHECK-BACK IS WAITING for results. It is ${session.reviewTaskId ? 'a task' : 'proposed'} for ${state.due ?? 'a date not yet set'}. Do not suggest a model or place nodes.`);
  if (state?.status === 'reviewing') lines.push(`REVIEW IN PROGRESS since ${String(state.startedAt).slice(0, 10)}. Look at what actually happened, not the plan.`);
  if (session.taskSnapshot) lines.push(taskStatusLine(session.taskSnapshot));
  const offer = actionOffer(session);
  const written = session.caseFile;
  if (written) {
    const where = written.target.kind === 'project' ? 'the linked project' : 'the linked task';
    const changed = offer?.kind === 'update' ? ` Changed since: ${offer.changed.map((key) => offer.file.sections.find((s) => s.key === key)?.heading).join(', ')}. The person can add update v${offer.version} from the card.` : '';
    lines.push(`ACTION RECORD: v${written.version} written ${written.writtenAt.slice(0, 10)} to ${where}.${changed}`);
  } else if (offer) lines.push('ACTION RECORD: ready to write. The person writes it onto a task or project page from the card; it is not written yet.');
  return lines;
}

function boundaryLine(session) {
  const left = session.runner.leaving ? stepName(MODEL_ID, session.runner.leaving) : 'the last step';
  const leftStep = session.steps?.[session.runner.leaving];
  const ahead = session.phase === 'finished' ? 'what they want to take forward from this' : `what they want from ${stepName(MODEL_ID, session.phase)}`;
  if (skippedUntouched(leftStep)) return `MODE: boundary. The person has skipped ${left} without working a model. In one message: acknowledge the skip in one line; if skipping it matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask one question about ${ahead}. Do not ask a learning question.`;
  return `MODE: boundary. The person has just left ${left} (${leftStep?.status ?? 'unknown'}). In one message: a one-sentence recap of what ${left} established; if it was left unfinished in a way that matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask what they learned about handling change. No model suggestion yet.`;
}

/** @returns {{ system: string[], user: string }} */
export function buildChangePrompt(session) {
  const run = activeRun(session);
  const parts = [`WORK: ${session.title}`];
  if (session.runner?.mode === 'boundary') parts.push(boundaryLine(session));
  parts.push(`PHASE: ${session.phase}`);
  parts.push(`TODAY: ${String(session.updatedAt ?? '').slice(0, 10)}`);
  const missing = frameKeysOf(session).filter((key) => !session.frame[key]);
  parts.push(`Frame: ${JSON.stringify(session.frame)}${missing.length ? `\nMissing frame answers: ${missing.join(', ')}` : ''}`);
  if (session.frame.group) parts.push(`GROUP: ${groupLabels(session.frame.group)}`);
  // The turn that completes the frame is the turn that discerns: say so here, not only in the rubric.
  if (session.phase === 'frame' && missing.length === 1 && session.runner?.mode !== 'boundary') {
    parts.push(`LAST FRAME ANSWER (${missing[0]}): if the latest reply settles it, accept it in "frame" and, in the same message, name the kind of change (one of KINDS OF CHANGE) and recommend one model with next_technique. The message itself must name both models by their names, never their ids: the one you recommend, with one sentence on why it fits and one plausible limit of it here, and one sibling you passed over ("I passed over <name> because …"). The card shows only the first, so the sibling lives only in your words. If the reply does not settle it, challenge or clarify instead.`);
  }
  if (session.phase === 'frame' && session.startModel) parts.push(`SHELF PICK: the person started from ${TOOLS[session.startModel].name} (${session.startModel}). When framing ends it opens on that model: suggest it with next_technique and say in one sentence how it fits the frame.`);
  const earlier = earlierSteps(session);
  if (earlier) parts.push(earlier.replace(/^EARLIER STEPS:/, 'EARLIER:'));
  if (session.model) parts.push(...reviewLines(session));
  if (session.pendingLearning && session.runner?.mode !== 'boundary') {
    const from = stepName(MODEL_ID, session.pendingLearning);
    const offer = session.phase === 'explore' && !run ? ' and suggest a model with next_technique' : session.phase === 'commit' && !run ? ` and suggest ${COMMIT_ID} with next_technique` : '';
    const orient = waitingForReview(session) ? 'Then say Review picks up on the review date, and do not suggest a model.' : `Either way, orient them to the current step in one sentence${offer}.`;
    parts.push(`AWAITING LEARNING from ${from}: if they named something they learned about handling change, put it in "learning" (one sentence, their meaning); otherwise leave learning null. ${orient}`);
  }
  const step = currentStep(session);
  if (step) {
    for (const item of step.runs.filter((r) => r.status !== 'active')) {
      parts.push(`Earlier model in this step ${item.tool}: ${item.status}${item.switchReason ? ` (${item.switchReason})` : ''}; ${item.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}${scoreNote(item)}`);
    }
  }
  if (run) parts.push(runState(session, run), ...basisLines(session, run));
  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary' && !waitingForReview(session)) {
    if (session.phase === 'explore') parts.push('No model is open in this step yet: name the kind of change and recommend one model with next_technique, with one limit of it and a sibling you passed over.');
    else if (session.phase === 'review') parts.push(`No tool is open yet: suggest ${REVIEW_ID} with next_technique.`);
    else if (toolsForPlanStep(MODEL_ID, session.phase).length) parts.push(`No tool is open in this step yet: suggest ${toolsForPlanStep(MODEL_ID, session.phase)[0]} with next_technique.`);
  }
  const tasks = taskLines(session);
  if (tasks) parts.push(tasks);
  if (session.pendingKeep) parts.push(`Last challenged answer (${session.pendingKeep.slot}): ${session.pendingKeep.text}`);
  if (session.summary) parts.push(`Summary so far: ${session.summary}`);
  const coachTurns = session.turns.filter((t) => t.role === 'coach').length;
  if (coachTurns > 0 && coachTurns % SUMMARY_EVERY === 0) parts.push('A summary is due this turn.');
  parts.push(`RECENT CONVERSATION:\n${transcript(session)}`);
  const note = run ? techniqueNote(run.tool) : null;
  return { system: [CHANGE_RUBRIC, stepLayer(session), ...(note ? [note] : [])], user: parts.join('\n\n') };
}
