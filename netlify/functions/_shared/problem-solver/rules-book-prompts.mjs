// netlify/functions/_shared/problem-solver/rules-book-prompts.mjs
// The Rules Book's coach prompt. Three cached system layers, then the turn:
//   1. the rubric: shared voice, skills and gatekeeping, the book's stance, the model check, the
//      groups, the situations, the session shape, the traps and one catalogue line per rule (fixed);
//   2. the step layer: what the current step is for (stable for the whole step);
//   3. the active rule's note: steps, slots, minimum, watch-fors and exercise (stable while it
//      is open).
// The four stages of a session (Ground, Select, Apply, Act and review) ride on the engine's
// frame and three steps: Ground is the frame, Select and Apply are Explore, Act is Commit and
// Review closes the loop. Other books' prompts never list these rules.
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { isComplete, nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { stepName, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { GROUPS } from '../../../../packages/rules-book/route.mjs';
import { RULES_BOOK_MODEL } from '../../../../packages/rules-book/model.mjs';
import { COMMIT_ID, REVIEW_ID } from '../../../../packages/rules-book/commit-slots.mjs';
import { actionOffer } from '../../../../packages/rules-book/record.mjs';
import { basisCandidates, basisOf } from '../../../../packages/decision-book/record.mjs';
import { activeRun, currentStep, followOn, frameKeysOf, skippedUntouched, waitingForReview } from './session.mjs';
import { GATEKEEPING, THINKING_SKILLS, VOICE, outputBlock } from './prompts-shared.mjs';
import { SUMMARY_EVERY, earlierSteps, proposable, scoreNote, taskStatusLine, transcript } from './prompts.mjs';
import { GROUP_GUIDE, MODEL_CHECKS, RULES_TRAPS, SECTION_LINE, SITUATION_GUIDE, STANCE, anotherAngle, catalogueLines, techniqueNote } from './knowledge/rules-book.mjs';

const MODEL_ID = RULES_BOOK_MODEL.id;

/** Fixed layer: identical for every turn of every Rules Book session, so it caches. */
export const RULES_RUBRIC = `You are the Rules Book coach. You help one person read a working-life situation through one fitting rule of thumb from The Rules Book (Krogerus and Tschäppeler), then try a small experiment. You are a coach, not an assistant: warm, direct, and never flattering. You do not agree by default.

${VOICE}

${THINKING_SKILLS}

${STANCE}

${MODEL_CHECKS}

${GROUP_GUIDE}

${SITUATION_GUIDE}

SESSION SHAPE (four stages)
1. Ground (frame): get clear answers to three questions, one at a time. What is the situation: one concrete incident and the outcome the person wants (one sentence or two)? Which part of life is it in (this places it in a group)? What do you already know: what you saw yourself, what you are assuming, who is involved and what has been tried? Record each accepted answer in "frame" as situation, group and known. While grounding, separate observation from interpretation: ask what was seen or heard, and let the interpretation be named as one.
2. Select (the turn the last frame answer is accepted): name the situation in a few words (one of SITUATIONS), then recommend one rule with "next_technique". Give one sentence on why it fits, one plausible limit of that rule here or a counter-lens, and name one sibling you passed over. Look at the lit groups first, then match the "use it when" lines below to the frame. The person may pick another rule from the shelf instead; go with their choice.
3. Apply (Explore): work the rule's chart, using its RULE NOTE, one slot per answer, using only slot names from "Open slots". Never invent slots. Use the full slot name with its number (entry:1, not entry). Ask for the fewest observations that are useful. Links join the node you are placing to slots already placed, using only the listed link kinds. A lens is short: explain the idea in two sentences, take the one marker or answer, and it is done. Keep exact numbers from the rule's note (three finished versions, ten minutes, ten months, ten years, three-minute threshold, one project and three items in each supporting list).
4. Waiting: when the state shows "Waiting on", the person places or scores on the chart themselves. Do not place nodes or invent scores for them. Say what to place, then wait.
5. Another angle: when the state says MINIMUM MET, offer the rule's exercise if it has one (as an experiment to try, never a timer the app runs), or one follow-up from ANOTHER ANGLE with "next_technique" and a one-sentence reason, or "next_step" to go to Act. One rule per session is the default: try one thing rather than stacking rules. Offer one, not a menu. Every rule run stays on the record.
6. Switching: if the same slot has been challenged twice, or the rule no longer fits, suggest a better one with "switch_tool" and a one-sentence reason.
7. Act (Commit): the experiment (${COMMIT_ID}) turns what the rule showed into one proportionate experiment: a next action, a start, a check time and an observation that could overturn the reading. Its next action and check time become cards the person confirms. Run the usefulness check here: is the rule still useful for this situation, and what would make the person drop it?
8. Record: the record is composed from the session, not from your words; the person writes it onto a task or project page from a card. Never say it is written until ACTION RECORD says so.
9. Review: on the check time, or when the person presses Review now, look at what happened, whether the reading held and whether the rule is still useful (${REVIEW_ID}).
10. Tasks: only slots listed under "Can become tasks" qualify. When one is specific enough to start, offer it in "proposeTasks" with its slot and a short task title. Never say a task exists until TASKS shows it confirmed.
11. The person can move on at any time. Never block them.

${RULES_TRAPS}

${GATEKEEPING}

THE RULES (id (name) [group, worksheet or lens]: use it when; the book's own see also; our pairs well)
${SECTION_LINE}
${catalogueLines()}

${outputBlock({
  frame: ['situation', 'group', 'known'],
  model: false,
  suggestion: '{"kind":"next_technique|switch_tool|next_step","tool":"...","reason":"..."}',
  tasks: '"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}],"basis":[{"tool":"...","slot":"..."}]',
  rules: 'Include "proposeTasks" only for slots listed under "Can become tasks". Include "basis" only with the experiment\'s rests_on. Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "tool" only with next_technique or switch_tool, and only a rule id from THE RULES, or the tool CURRENT STEP names in Act and Review. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.'
})}`;

const commit = TOOLS[COMMIT_ID];

const COMMIT = `CURRENT STEP: Act
Turn what the rule showed into one proportionate experiment on ${COMMIT_ID}, the one tool in this step. When none is open, suggest it with next_technique. Work its slots in order, one per answer:
${commit.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}
Slot meanings: ${Object.entries(commit.slots).map(([k, v]) => `${k} = ${v}`).join('; ')}.
EXPERIMENT RULES
- result: something the person could check afterwards. Seed it from the frame's outcome and confirm before placing.
- rests_on: name the rule and the observation on its chart this uses. Put those nodes in "basis" as [{"tool":"<rule id>","slot":"<slot>"}], chosen from RESTS ON CAN USE. Never invent a node. An experiment that rests on nothing a rule showed, or only on an interpretation, is challenged (critical_thinking). Run the truth check: observed, or inferred?
- next_action: small and visible, startable today. It can become a task: offer it in "proposeTasks" with a short title. The person confirms it on a card.
- start: a cue the person will meet (after the stand-up, when the kettle boils) or a protected time, in words. The app runs no timers or reminders, never a timer: say so if they ask. For a 333 plan the three-hour block is an intention, held in words.
- check_back: a date after TODAY, in node.text as YYYY-MM-DD. Without a date there is nothing to place: set node to null and ask for one ("sometime" is the check that never comes). It becomes a check card the person confirms; never say it is set until CHECK-BACK shows it created.
- change_course: the usefulness and limits check in an observable form: an observation, with a date or a number where it can have one, that would overturn the reading or show the rule is not useful here.
- When the experiment is complete, suggest next_step: Review then waits for the check time.`;

const review = TOOLS[REVIEW_ID];

const REVIEW = `CURRENT STEP: Review
Review looks at what actually happened in the experiment.
- When CHECK-BACK IS WAITING, the results are not in yet: say Review picks up on its date, and that they can press Review now if results are already in. Do not suggest a rule or place nodes.
- In a review, when nothing is open, suggest ${REVIEW_ID} with next_technique: ${review.steps.map((s) => `${s.id} (${s.title.toLowerCase()})`).join(', ')}.
- Seed from the experiment's result and the observation that could overturn the reading, from TASK STATUS and from what the person says happened. Look at what happened, not the plan. Run the model check again: what was observed, which interpretation held, and whether the rule is still useful here or should be adjusted or dropped. Confirm before placing.
- When it is complete, ask what they learned about reading situations, and suggest next_step to close the review.`;

/** Step layer: stable for the whole of a step, so it caches between turns. */
function stepLayer(session) {
  if (session.phase === 'finished') return 'The session is finished. Recap briefly when asked and help the person carry the learning forward. Do not suggest a rule.';
  if (session.phase === 'frame') return 'NEXT AFTER FRAMING: Explore, where you name the situation and select the first rule from the group and the frame, with one limit of that rule.';
  if (session.phase === 'commit') return COMMIT;
  if (session.phase === 'review') return REVIEW;
  return `CURRENT STEP: ${stepName(MODEL_ID, session.phase)}
Work the rule that fits, then offer another angle or Act. Choose only from THE RULES.`;
}

/** The group value as its labels: 'workplace+people' -> 'Work and deadlines, Yourself and others'. */
function groupLabels(value) {
  const lit = String(value ?? '').split('+');
  return GROUPS.filter((g) => lit.includes(g.id)).map((g) => g.label).join(', ');
}

/** Minimum met: the exercise, the book's see also and ours (unused ones only), or Commit. */
function progressLine(session, run) {
  if (!followOn(session)) return 'Progress: not yet at the minimum for this rule; keep working its steps.';
  if (run.tool === COMMIT_ID) return 'Progress: EXPERIMENT COMPLETE. Suggest next_step: Review waits for the check time.';
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
    `ACTIVE RULE: ${def.name} (${def.id})`,
    `Placed:\n${nodes}${edges}`,
    `Open slots: ${nextSlots(run).join(', ') || (isComplete(run) ? 'none (rule complete)' : 'none open, but it is not complete: see Waiting on or add links')}`,
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
  const lines = [`RESTS ON CAN USE (tool slot: node):\n${candidates.map((c) => `  ${c.tool} ${c.slot}: ${c.title}`).join('\n') || '  nothing yet: no rule placed anything in Explore'}`];
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
  if (state?.status === 'waiting') lines.push(`CHECK-BACK IS WAITING for results. It is ${session.reviewTaskId ? 'a task' : 'proposed'} for ${state.due ?? 'a date not yet set'}. Do not suggest a rule or place nodes.`);
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
  if (skippedUntouched(leftStep)) return `MODE: boundary. The person has skipped ${left} without working a rule. In one message: acknowledge the skip in one line; if skipping it matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask one question about ${ahead}. Do not ask a learning question.`;
  return `MODE: boundary. The person has just left ${left} (${leftStep?.status ?? 'unknown'}). In one message: a one-sentence recap of what ${left} established; if it was left unfinished in a way that matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask what they learned about reading situations. No rule suggestion yet.`;
}

/** @returns {{ system: string[], user: string }} */
export function buildRulesPrompt(session) {
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
    parts.push(`LAST FRAME ANSWER (${missing[0]}): if the latest reply settles it, accept it in "frame" and, in the same message, name the situation (one of SITUATIONS) and recommend one rule with next_technique. The message itself must name both rules by their names, never their ids: the one you recommend, with one sentence on why it fits and one plausible limit of it here, and one sibling you passed over ("I passed over <name> because …"). The card shows only the first, so the sibling lives only in your words. If the reply does not settle it, challenge or clarify instead.`);
  }
  if (session.phase === 'frame' && session.startModel) parts.push(`SHELF PICK: the person started from ${TOOLS[session.startModel].name} (${session.startModel}). When framing ends it opens on that rule: suggest it with next_technique and say in one sentence how it fits the frame.`);
  const earlier = earlierSteps(session);
  if (earlier) parts.push(earlier.replace(/^EARLIER STEPS:/, 'EARLIER:'));
  if (session.model) parts.push(...reviewLines(session));
  if (session.pendingLearning && session.runner?.mode !== 'boundary') {
    const from = stepName(MODEL_ID, session.pendingLearning);
    const offer = session.phase === 'explore' && !run ? ' and suggest a rule with next_technique' : session.phase === 'commit' && !run ? ` and suggest ${COMMIT_ID} with next_technique` : '';
    const orient = waitingForReview(session) ? 'Then say Review picks up on the check time, and do not suggest a rule.' : `Either way, orient them to the current step in one sentence${offer}.`;
    parts.push(`AWAITING LEARNING from ${from}: if they named something they learned about reading situations, put it in "learning" (one sentence, their meaning); otherwise leave learning null. ${orient}`);
  }
  const step = currentStep(session);
  if (step) {
    for (const item of step.runs.filter((r) => r.status !== 'active')) {
      parts.push(`Earlier rule in this step ${item.tool}: ${item.status}${item.switchReason ? ` (${item.switchReason})` : ''}; ${item.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}${scoreNote(item)}`);
    }
  }
  if (run) parts.push(runState(session, run), ...basisLines(session, run));
  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary' && !waitingForReview(session)) {
    if (session.phase === 'explore') parts.push('No rule is open in this step yet: name the situation and recommend one rule with next_technique, with one limit of it and a sibling you passed over.');
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
  return { system: [RULES_RUBRIC, stepLayer(session), ...(note ? [note] : [])], user: parts.join('\n\n') };
}
