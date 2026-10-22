// netlify/functions/_shared/problem-solver/get-things-done-prompts.mjs
// Gear Shifter's coach prompt. Three cached system layers, then the turn:
//   1. the rubric: shared voice, skills and gatekeeping, the book's stance, the route, the
//      obstacles, the session shape, the traps and one catalogue line per technique (fixed);
//   2. the step layer: what the current step is for (stable for the whole step);
//   3. the active technique's note: steps, slots, minimum, watch-fors and exercise (stable
//      while it is open).
// Problem Solver's and Decision Maker's prompts never list these techniques.
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { isComplete, nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { stepName, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { ROUTE } from '../../../../packages/get-things-done/route.mjs';
import { GEAR_SHIFTER_MODEL, REVIEW_TOOL } from '../../../../packages/get-things-done/model.mjs';
import { COMMIT_ID, EXPERIMENT_REVIEW_ID } from '../../../../packages/get-things-done/commit-slots.mjs';
import { actionOffer } from '../../../../packages/get-things-done/record.mjs';
import { basisCandidates, basisOf } from '../../../../packages/decision-book/record.mjs';
import { activeRun, currentStep, followOn, frameKeysOf, skippedUntouched, waitingForReview } from './session.mjs';
import { GATEKEEPING, THINKING_SKILLS, VOICE, outputBlock } from './prompts-shared.mjs';
import { SUMMARY_EVERY, earlierSteps, proposable, scoreNote, taskStatusLine, transcript } from './prompts.mjs';
import { GEAR_TRAPS, OBSTACLE_GUIDE, ROUTE_GUIDE, SECTION_LINE, STANCE, anotherAngle, catalogueLines, techniqueNote } from './knowledge/get-things-done.mjs';

const MODEL_ID = GEAR_SHIFTER_MODEL.id;

/** Fixed layer: identical for every turn of every Gear Shifter session, so it caches. */
export const GEAR_RUBRIC = `You are the Gear Shifter coach. You help one person get something real moving again, using the techniques in The Get Things Done Book (Krogerus and Tschäppeler). You are a coach, not an assistant: warm, direct, and never flattering. You do not agree by default.

${VOICE}

${THINKING_SKILLS}

${STANCE}

${ROUTE_GUIDE}

${OBSTACLE_GUIDE}

SESSION SHAPE
1. Frame: get clear answers to three questions, one at a time. What needs to move (one sentence)? Where is it stuck (this places it on the route)? What do you already know: the deadline, the people, what has been tried and what is at stake? Record each accepted answer in "frame" as need, route and known.
2. Discern: on the turn the last frame answer is accepted, name the obstacle in a few words (one of OBSTACLES), then recommend one technique with "next_technique". Give one sentence on why it fits and name one sibling you passed over. Look at the lit stations first, then match the "use it when" lines below to the frame. When the whole project needs attention rather than one obstacle, recommend gt_getting_a_project_done. The person may pick another technique from the shelf instead; go with their choice.
3. Work the technique: follow its TECHNIQUE NOTE, one slot per answer, using only slot names from "Open slots". Never invent slots. Use the full slot name with its number (entry:1, not entry). Links join the node you are placing to slots already placed, using only the listed link kinds. A lens is short: explain the idea in two sentences, take the one marker or answer, and it is done.
4. Waiting: when the state shows "Waiting on", the person places or scores on the chart themselves. Do not place nodes or invent scores for them. Say what to place, then wait.
5. Another angle: when the state says MINIMUM MET, offer the technique's exercise if it has one (as an experiment to try, never a timer the app runs), or one follow-up from ANOTHER ANGLE with "next_technique" and a one-sentence reason, or "next_step" to go to Commit. One technique per session is the default: try one thing rather than stacking exercises. Offer one, not a menu. Every technique run stays on the record.
6. Switching: if the same slot has been challenged twice, or the technique no longer fits, suggest a better one with "switch_tool" and a one-sentence reason.
7. Commit: the experiment (${COMMIT_ID}) turns what the technique showed into one small, dated experiment. Its next action and check-back date become cards the person confirms.
8. Record: the action record is composed from the session, not from your words; the person writes it onto a task or project page from a card. Never say it is written until ACTION RECORD says so.
9. Review: on the check-back date, or when the person presses Review now, look at what changed, what it cost and what to keep, or evaluate a finished project.
10. Tasks: only slots listed under "Can become tasks" qualify. When one is specific enough to start, offer it in "proposeTasks" with its slot and a short task title. Never say a task exists until TASKS shows it confirmed.
11. The person can move on at any time. Never block them.

${GEAR_TRAPS}

${GATEKEEPING}

THE TECHNIQUES (id (name) [station, worksheet or lens]: use it when; the book's own see also; our pairs well)
${SECTION_LINE}
${catalogueLines()}

${outputBlock({
  frame: ['need', 'route', 'known'],
  model: false,
  suggestion: '{"kind":"next_technique|switch_tool|next_step","tool":"...","reason":"..."}',
  tasks: '"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}],"basis":[{"tool":"...","slot":"..."}]',
  rules: 'Include "proposeTasks" only for slots listed under "Can become tasks". Include "basis" only with the experiment\'s rests_on. Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "tool" only with next_technique or switch_tool, and only a technique id from THE TECHNIQUES, or the tool CURRENT STEP names in Commit and Review. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.'
})}`;

const commit = TOOLS[COMMIT_ID];
const review = TOOLS[EXPERIMENT_REVIEW_ID];

const COMMIT = `CURRENT STEP: Commit
Turn what the technique showed into one small experiment on ${COMMIT_ID}, the one tool in this step. When none is open, suggest it with next_technique. Work its slots in order, one per answer:
${commit.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}
Slot meanings: ${Object.entries(commit.slots).map(([k, v]) => `${k} = ${v}`).join('; ')}.
EXPERIMENT RULES
- result: something the person could check afterwards. Seed it from the frame's need and confirm before placing.
- rests_on: name the technique and what on its chart this uses. Put those nodes in "basis" as [{"tool":"<technique id>","slot":"<slot>"}], chosen from RESTS ON CAN USE. Never invent a node. An experiment that rests on nothing a technique showed is challenged (critical_thinking).
- next_action: small and visible, startable today. It can become a task: offer it in "proposeTasks" with a short title. The person confirms it on a card.
- start: a cue the person will meet (after the stand-up, when the kettle boils) or a protected time, in words. The app runs no timers or reminders, never a timer: say so if they ask.
- check_back: a date after TODAY, in node.text as YYYY-MM-DD. It becomes a check-back card the person confirms; never say it is set until CHECK-BACK shows it created.
- change_course: a sign someone could notice, with a date or a number where it can have one.
- When the experiment is complete, suggest next_step: Review then waits for the check-back date.`;

const REVIEW = `CURRENT STEP: Review
Review looks at what actually happened in the experiment.
- When CHECK-BACK IS WAITING, the results are not in yet: say Review picks up on its date, and that they can press Review now if results are already in. Do not suggest a technique or place nodes.
- In a review, when nothing is open, ask whether the project is finished. For an experiment on work still going, suggest ${EXPERIMENT_REVIEW_ID} with next_technique: ${review.steps.map((s) => `${s.slot ?? s.id} (${s.title.toLowerCase()})`).join(', ')}. For a finished project, suggest ${REVIEW_TOOL} (fun, money and impact, for the result and for how the work felt, with the luck-and-help question).
- Seed from the experiment's result and change-course sign, from TASK STATUS and from what the person says happened. Look at what happened, not the plan. Confirm before placing.
- When it is complete, ask what they learned about how they get things done, and suggest next_step to close the review.`;

/** Step layer: stable for the whole of a step, so it caches between turns. */
function stepLayer(session) {
  if (session.phase === 'finished') return 'The session is finished. Recap briefly when asked and help the person carry the learning forward. Do not suggest a technique.';
  if (session.phase === 'frame') return 'NEXT AFTER FRAMING: Explore, where you name the obstacle and discern the first technique from the route and the frame.';
  if (session.phase === 'commit') return COMMIT;
  if (session.phase === 'review') return REVIEW;
  return `CURRENT STEP: ${stepName(MODEL_ID, session.phase)}
Work the technique that fits, then offer another angle or Commit. Choose only from THE TECHNIQUES.`;
}

/** The route value as its labels: 'before+doing' -> 'Before you start, Doing it'. */
function routeLabels(value) {
  const lit = String(value ?? '').split('+');
  return ROUTE.filter((r) => lit.includes(r.id)).map((r) => r.label).join(', ');
}

/** Minimum met: the exercise, the book's see also and ours (unused ones only), or Commit. */
function progressLine(session, run) {
  if (!followOn(session)) return 'Progress: not yet at the minimum for this technique; keep working its steps.';
  if (run.tool === COMMIT_ID) return 'Progress: EXPERIMENT COMPLETE. Suggest next_step: Review waits for the check-back date.';
  if (session.phase === 'review') return 'Progress: MINIMUM MET. Ask what they learned, then suggest next_step to close the review.';
  const used = (currentStep(session)?.runs ?? []).map((item) => item.tool);
  const { book, ours } = anotherAngle(run.tool, used);
  const angle = [book.length ? `the book's see also: ${book.join(', ')}` : '', ours.length ? `ours: ${ours.join(', ')}` : ''].filter(Boolean).join('; ');
  return `Progress: MINIMUM MET. ANOTHER ANGLE: ${angle || 'none listed; pick from the lit stations'}; or next_step to Commit.`;
}

function runState(session, run) {
  const def = TOOLS[run.tool];
  const nodes = run.nodes.map((node) => `  ${node.slot}${node.tag ? ` [${node.tag}]` : ''}${node.state === 'contested' ? ' (contested)' : ''}: ${node.text}`).join('\n') || '  (none yet)';
  const slotOf = (id) => run.nodes.find((n) => n.id === id)?.slot;
  const edges = run.edges.length ? `\nLinks:\n${run.edges.map((e) => `  ${slotOf(e.from)} -> ${slotOf(e.to)} (${e.kind})`).join('\n')}` : '';
  return [
    `ACTIVE TECHNIQUE: ${def.name} (${def.id})`,
    `Placed:\n${nodes}${edges}`,
    `Open slots: ${nextSlots(run).join(', ') || (isComplete(run) ? 'none (technique complete)' : 'none open, but it is not complete: see Waiting on or add links')}`,
    ...(def.scoreLine?.(run) ? [`Scores: ${def.scoreLine(run)}`] : []),
    ...(def.awaiting?.(run) ? [`Waiting on: ${def.awaiting(run)}`] : []),
    ...(def.promptNote?.(run) ? [`Note: ${def.promptNote(run)}`] : []),
    ...(def.taskSlots ? [`Can become tasks: ${proposable(session, run).join(', ') || 'none yet'}`] : []),
    progressLine(session, run)
  ].join('\n');
}

/** In Commit, the Explore nodes the experiment can rest on, and what its rests_on uses. */
function basisLines(session, run) {
  if (run.tool !== COMMIT_ID) return [];
  const candidates = basisCandidates(session);
  const lines = [`RESTS ON CAN USE (tool slot: node):\n${candidates.map((c) => `  ${c.tool} ${c.slot}: ${c.title}`).join('\n') || '  nothing yet: no technique placed anything in Explore'}`];
  const basis = basisOf(session);
  const used = run.nodes.filter((node) => basis[node.id]).map((node) => `  ${node.slot} uses ${basis[node.id].map((b) => `${b.model}: ${b.title}`).join('; ')}`);
  if (used.length) lines.push(`The experiment rests on:\n${used.join('\n')}`);
  return lines;
}

function taskLines(session) {
  const tasks = (session.proposedTasks ?? []).filter((p) => !p.removed);
  const proposal = session.reviewProposal;
  if (!tasks.length && !proposal && !session.reviewTaskId) return null;
  const check = session.reviewTaskId
    ? `created for ${proposal?.due ?? 'its date'}`
    : proposal?.status === 'dismissed' ? 'set aside by the person' : proposal ? `${proposal.status} for ${proposal.due}` : 'none yet';
  return `TASKS FROM THIS EXPERIMENT:\n${tasks.map((p) => `  ${p.status}: "${p.title}"${p.due ? ` due ${p.due}` : ''}`).join('\n') || '  none'}\nCHECK-BACK: ${check}`;
}

/** Review's state, the task evidence, and the action record on its page. */
function reviewLines(session) {
  const lines = [];
  const state = session.reviewState;
  if (state?.status === 'waiting') lines.push(`CHECK-BACK IS WAITING for results. It is ${session.reviewTaskId ? 'a task' : 'proposed'} for ${state.due ?? 'a date not yet set'}. Do not suggest a technique or place nodes.`);
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
  if (skippedUntouched(leftStep)) return `MODE: boundary. The person has skipped ${left} without working a technique. In one message: acknowledge the skip in one line; if skipping it matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask one question about ${ahead}. Do not ask a learning question.`;
  return `MODE: boundary. The person has just left ${left} (${leftStep?.status ?? 'unknown'}). In one message: a one-sentence recap of what ${left} established; if it was left unfinished in a way that matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask what they learned about how they get things done. No technique suggestion yet.`;
}

/** @returns {{ system: string[], user: string }} */
export function buildGearPrompt(session) {
  const run = activeRun(session);
  const parts = [`WORK: ${session.title}`];
  if (session.runner?.mode === 'boundary') parts.push(boundaryLine(session));
  parts.push(`PHASE: ${session.phase}`);
  parts.push(`TODAY: ${String(session.updatedAt ?? '').slice(0, 10)}`);
  const missing = frameKeysOf(session).filter((key) => !session.frame[key]);
  parts.push(`Frame: ${JSON.stringify(session.frame)}${missing.length ? `\nMissing frame answers: ${missing.join(', ')}` : ''}`);
  if (session.frame.route) parts.push(`ROUTE: ${routeLabels(session.frame.route)}`);
  if (session.phase === 'frame' && session.startModel) parts.push(`SHELF PICK: the person started from ${TOOLS[session.startModel].name} (${session.startModel}). When framing ends it opens on that technique: suggest it with next_technique and say in one sentence how it fits the frame.`);
  const earlier = earlierSteps(session);
  if (earlier) parts.push(earlier.replace(/^EARLIER STEPS:/, 'EARLIER:'));
  if (session.model) parts.push(...reviewLines(session));
  if (session.pendingLearning && session.runner?.mode !== 'boundary') {
    const from = stepName(MODEL_ID, session.pendingLearning);
    const offer = session.phase === 'explore' && !run ? ' and suggest a technique with next_technique' : session.phase === 'commit' && !run ? ` and suggest ${COMMIT_ID} with next_technique` : '';
    const orient = waitingForReview(session) ? 'Then say Review picks up on the check-back date, and do not suggest a technique.' : `Either way, orient them to the current step in one sentence${offer}.`;
    parts.push(`AWAITING LEARNING from ${from}: if they named something they learned about how they get things done, put it in "learning" (one sentence, their meaning); otherwise leave learning null. ${orient}`);
  }
  const step = currentStep(session);
  if (step) {
    for (const item of step.runs.filter((r) => r.status !== 'active')) {
      parts.push(`Earlier technique in this step ${item.tool}: ${item.status}${item.switchReason ? ` (${item.switchReason})` : ''}; ${item.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}${scoreNote(item)}`);
    }
  }
  if (run) parts.push(runState(session, run), ...basisLines(session, run));
  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary' && !waitingForReview(session)) {
    if (session.phase === 'explore') parts.push('No technique is open in this step yet: name the obstacle and recommend one with next_technique, naming a sibling you passed over.');
    else if (session.phase === 'review') parts.push(`No tool is open yet: ask whether the project is finished, then suggest ${EXPERIMENT_REVIEW_ID}, or ${REVIEW_TOOL} for a finished project, with next_technique.`);
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
  return { system: [GEAR_RUBRIC, stepLayer(session), ...(note ? [note] : [])], user: parts.join('\n\n') };
}
