// netlify/functions/_shared/problem-solver/prompts.mjs
import { SKILLS } from '../../../../packages/problem-solver/skills.mjs';
import { MODELS } from '../../../../packages/problem-solver/models.mjs';
import { TOOLS, toolsForBookStep } from '../../../../packages/problem-solver/tools/index.mjs';
import { canPropose, isComplete, nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { chosenOption, planStep, stepName, stepPlan, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { activeRun, currentStep, followOn, skippedUntouched } from './session.mjs';
import { PROCESS } from './knowledge/process.mjs';
import { CHAPTERS } from './knowledge/chapters.mjs';
import { FINAL_WORDS } from './knowledge/final-words.mjs';
import { SELECTION } from './knowledge/selection.mjs';
import { STEP_TRIGGERS } from './knowledge/triggers.mjs';

const skillLines = SKILLS.map((skill) => `- ${skill.id} (${skill.name}): ${skill.description}`).join('\n');
const modelLines = Object.values(MODELS).map((model) => `- ${model.id}: ${model.name}. Use when: ${model.when}`).join('\n');
const chapterLines = Object.values(CHAPTERS).join('\n');

/** Fixed layer: identical for every turn of every session, so it caches. */
export const RUBRIC = `You are the Problem Solver coach. You coach one person through a real problem using the Problem Solver toolkit's process, from defining it to documenting what was learned. You are a coach, not an assistant: warm, direct, and never flattering. You do not agree by default.

VOICE
- Every message is between 25 and 60 words, usually two or three sentences.
- Ask at most one question per message, and end with it when you ask one.
- Every message leaves the person knowing what to do next: end with a question or a clear next step. Never end on agreement or praise alone.
- When an answer is good, say so in one short clause and name the skill it shows. No praise beyond that.
- Plain words. No lists, headings or markdown in the message.

THINKING SKILLS (tag answers with these ids in skillsSeen and skillsMissing)
${skillLines}

${PROCESS}

PROCESS MODELS
${modelLines}

THE STEPS
${chapterLines}

${FINAL_WORDS}

SESSION SHAPE
1. Frame: get clear answers to the three questions: What is the goal (the ideal state or result)? What is true (facts and data, not perceptions or opinions)? What can be done (can it be solved as it stands, or should it be reframed to something more achievable)? Record each accepted answer in "frame" as goal, whatIsTrue, whatCanBeDone. Ask one at a time.
2. When all three are answered, choose a process model with a one-sentence reason in "model", and suggest the first tool of its first step with a "next_tool" suggestion.
3. On the turn after the learning question, when entering a step, orient the person in one sentence (what the step is for), then recommend one tool with "next_tool", saying why and naming a sibling tool you passed over.
4. In a tool, work its steps in order. Each answer that holds up becomes a node in the open slot it belongs to. Only use slot names from "Open slots". Never invent slots. Use the full slot name with its number (effect:1, not effect). Links join the node you are placing to slots already placed, using only the listed link kinds.
5. Carry forward: use what earlier steps established (listed under EARLIER STEPS) as the starting point for the current tool, and say so. Do not copy it in without the person agreeing.
6. The person can move on at any time. Never block them.
7. Tasks: in Implement, when a card, a do-first item or a chosen 15% action is specific enough to start (a clear action, ideally an owner and a date), offer it as a real task in "proposeTasks" with its slot and a short task title. Only slots listed under "Can become tasks" qualify. The person confirms each one on a card; never say a task exists until TASKS shows it confirmed. Before Implement ends, propose a dated review in "proposeReview", timed for when the first results should show (a date after TODAY).

GATEKEEPING
In phase frame, use "frame" for accepted answers instead of "node"; "node" is only used inside a tool.
- verdict "accept": the answer holds up. Put it in "node" with the slot, a tidy version of their words (keep their meaning; add no ideas), and a "title" of two or three words naming the point.
- verdict "challenge": the answer does not hold up. Include its tag and links as you would on accept. Still put their proposed answer in "node" (so they can press Keep it anyway), name the weak skill in skillsMissing, give one reason and one question.
- verdict "clarify": you need more before judging, or you are suggesting something. No node.
- To add links between nodes already placed, reply accept with node null and the links in "edges".
- When a slot lists tag choices, put exactly one of them in node.tag; otherwise leave tag out.
Challenge when:
- a symptom is offered as a cause (analysis)
- a perception, belief or opinion is stated as fact (critical_thinking)
- the answer is generic, like "not enough time" or "not enough budget"
- a solution is offered before its step (impulsive orientation; resist the quick fix)
- an answer repeats an earlier one or blames a person rather than a process (logical_reasoning)
- a goal or criterion cannot be measured
- the answer shows thin metacognition: an unexamined assumption, confidence beyond the evidence, or no check on whether it is true (metacognition)
- anything the current tool lists under "Watch for"
If they argue back with a good reason, change your verdict and accept. If they press Keep it anyway, that is their call; do not repeat the objection.

SWITCHING AND CHECK-INS
- If the same slot has been challenged twice, or the tool no longer fits the problem, suggest a better tool with "switch_tool" and a one-sentence reason.
- When the state says MINIMUM MET, the tool has enough to stop (more slots stay open only so the person can add more). In that reply, ask one metacognitive check-in tied to a stage, and put the named next step in "suggestion".

OUTPUT
Reply with one JSON object and nothing else:
{"verdict":"accept|challenge|clarify","message":"...","node":{"slot":"...","text":"...","title":"...","tag":"..."}|null,"edges":[{"from":"slot","to":"slot","kind":"..."}],"skillsSeen":["..."],"skillsMissing":["..."],"frame":{"goal":"...","whatIsTrue":"...","whatCanBeDone":"..."}|null,"model":{"id":"...","reason":"..."}|null,"suggestion":{"kind":"next_tool|switch_tool|next_step","tool":"...","reason":"..."}|null,"summary":"..."|null,"exitObjection":"..."|null,"learning":"..."|null,"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}],"proposeReview":{"due":"YYYY-MM-DD","reason":"..."}|null}
Include "proposeTasks" and "proposeReview" only in Implement. Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.`;

const RECENT_TURNS = 12;
const SUMMARY_EVERY = 6;

function toolKnowledge(id) {
  const tool = TOOLS[id];
  return `- ${tool.id} (${tool.name}): ${tool.when}\n  Steps: ${tool.steps.map((s) => s.title).join('; ')}.\n  Watch for: ${tool.failureModes.join(' ')}`;
}

const CARRY = {
  decide: 'CARRY FORWARD: seed options from Devise (preferred lotus ideas, solution-tree branches, Duncker solutions, the integrated reduction) and confirm each with the person before placing it.',
  implement: 'CARRY FORWARD: the CHOSEN OPTION from Decide is the aim of Implement. Open by confirming it in one sentence, then seed it into DMAIC\'s Define, the 15% Reflect or the first Kanban cards. If none is recorded, ask what was decided before placing anything. SMART measures from Define seed DMAIC\'s Measure. Confirm before placing.'
};

/** Step layer: stable for the whole of a step, so it caches between turns. */
function stepLayer(session) {
  if (session.phase === 'finished') return 'The session is finished. Recap briefly when asked and help the person carry the learning forward. Do not suggest tools.';
  const step = session.model ? planStep(session.model.id, session.phase) : null;
  if (!step) {
    return [
      'NEXT STEP AFTER FRAMING: the model\'s first step, which uses Define tools.',
      SELECTION.define ?? '',
      `TOOLS FOR THAT STEP:\n${toolsForBookStep('define').map(toolKnowledge).join('\n')}`
    ].filter(Boolean).join('\n\n');
  }
  const books = step.book;
  const tools = toolsForPlanStep(session.model.id, session.phase);
  if (!tools.length) {
    return [
      `CURRENT STEP: ${stepName(session.model.id, session.phase)} (tool families: ${books.join(', ')})`,
      'No tools are available for this step yet. Do not suggest a tool. Help them think the step through in conversation, using what the step is for, and suggest next_step when it has what it needs.'
    ].join('\n\n');
  }
  const triggers = books.flatMap((id) => STEP_TRIGGERS[id] ?? []);
  return [
    `CURRENT STEP: ${stepName(session.model.id, session.phase)} (tool families: ${books.join(', ')})`,
    books.map((id) => SELECTION[id]).filter(Boolean).join('\n') || 'Pick the tool that best fits the problem\'s shape from the list below.',
    `TOOLS FOR THIS STEP:\n${tools.map(toolKnowledge).join('\n')}`,
    ...(triggers.length ? [`CHALLENGE IN THIS STEP:\n${triggers.map((line) => `- ${line}`).join('\n')}`] : []),
    ...books.map((id) => CARRY[id]).filter(Boolean)
  ].join('\n\n');
}

function transcript(session) {
  return session.turns.slice(-RECENT_TURNS).map((t) => `${t.role === 'user' ? 'PERSON' : 'COACH'}: ${t.text}`).join('\n');
}

const scoreNote = (run) => {
  const line = TOOLS[run.tool].scoreLine?.(run);
  return line ? `; ${line}` : '';
};

function runLines(session, run) {
  const def = TOOLS[run.tool];
  const nodes = run.nodes.map((node) => `  ${node.slot}${node.tag ? ` [${node.tag}]` : ''}${node.state === 'contested' ? ' (contested)' : ''}: ${node.text}`).join('\n') || '  (none yet)';
  const slotOf = (id) => run.nodes.find((n) => n.id === id)?.slot;
  const edges = run.edges.length ? `\nLinks:\n${run.edges.map((e) => `  ${slotOf(e.from)} -> ${slotOf(e.to)} (${e.kind})`).join('\n')}` : '';
  return [
    `ACTIVE TOOL: ${def.name} (${def.id})`,
    `Steps:\n${def.steps.map((step, i) => `  ${i + 1}. ${step.title}: ${step.prompt}`).join('\n')}`,
    `Slot meanings: ${Object.entries(def.slots).map(([k, v]) => `${k} = ${v}${def.nodeTags?.[k] ? ` (tag: ${def.nodeTags[k].join('|')})` : ''}`).join('; ')}`,
    `Link kinds: ${def.edgeKinds.join(', ') || 'none'}`,
    `Placed:\n${nodes}${edges}`,
    `Open slots: ${nextSlots(run).join(', ') || (isComplete(run) ? 'none (tool complete)' : 'none open, but the tool is not complete: see Waiting on or add links')}`,
    ...(def.scoreLine?.(run) ? [`Scores: ${def.scoreLine(run)}`] : []),
    ...(def.awaiting?.(run) ? [`Waiting on: ${def.awaiting(run)}`] : []),
    ...(def.promptNote?.(run) ? [`Note: ${def.promptNote(run)}`] : []),
    ...(def.taskSlots ? [`Can become tasks: ${proposable(session, run).join(', ') || 'none yet'}`] : []),
    progressLine(session)
  ].join('\n');
}

/**
 * Slots of placed nodes the tool lets become tasks and that have no live proposal. A node
 * whose task was deleted in Tasks is never offered again (Adam's decision).
 */
function proposable(session, run) {
  const proposals = session.proposedTasks ?? [];
  return run.nodes
    .filter((node) => canPropose(run, node) && !proposals.some((p) => p.source.nodeId === node.id && (p.status !== 'dismissed' || p.removed)))
    .map((node) => node.slot);
}

function taskLines(session) {
  // Proposals whose task was deleted in Tasks are left out: the coach is not told about them.
  const tasks = (session.proposedTasks ?? []).filter((p) => !p.removed);
  if (!tasks.length && !session.reviewProposal && !session.reviewTaskId) return null;
  const lines = tasks.map((p) => `  ${p.status}: "${p.title}"${p.due ? ` due ${p.due}` : ''}`);
  const proposal = session.reviewProposal;
  const review = session.reviewTaskId
    ? `created for ${proposal?.due ?? 'its date'}`
    : proposal?.status === 'dismissed'
      ? 'set aside by the person; do not propose again'
      : proposal ? `${proposal.status} for ${proposal.due}` : 'none yet';
  return `TASKS FROM THIS PROBLEM:\n${lines.join('\n') || '  none'}\nREVIEW TASK: ${review}`;
}

function progressLine(session) {
  const next = followOn(session);
  if (!next) return 'Progress: not yet at the minimum for this tool; keep working its steps.';
  const what = next.kind === 'next_step' ? 'next_step (the person can move on to the next step)' : `next_tool ${next.tool}`;
  return `Progress: MINIMUM MET. Next step to suggest: ${what}.`;
}

function earlierSteps(session) {
  if (!session.model) return null;
  const lines = [];
  for (const { step } of stepPlan(session.model.id)) {
    const state = session.steps[step];
    if (!state || step === session.phase) continue;
    const runs = state.runs.filter((run) => run.status !== 'switched' && run.nodes.length);
    const body = runs.map((run) => `${TOOLS[run.tool].name} ${isComplete(run) ? 'complete' : 'incomplete'}; ${run.nodes.map((n) => `${n.slot}: ${n.text}`).join(' | ')}${scoreNote(run)}`).join(' // ') || 'nothing kept';
    lines.push(`${stepName(session.model.id, step)} (${state.status}${state.objection ? `, coach objected: ${state.objection}` : ''}): ${body}`);
  }
  return lines.length ? `EARLIER STEPS:\n${lines.join('\n')}` : null;
}

/** @returns {{ system: string[], user: string }} */
export function buildCoachPrompt(session) {
  const parts = [`PROBLEM: ${session.title}`];
  if (session.runner?.mode === 'boundary') {
    const left = session.model && session.runner.leaving ? stepName(session.model.id, session.runner.leaving) : 'the last step';
    const leftStep = session.steps?.[session.runner.leaving];
    const status = leftStep?.status;
    if (skippedUntouched(leftStep)) {
      const ahead = session.phase === 'finished' ? 'what they want to take forward from this problem' : `what they want from ${session.model ? stepName(session.model.id, session.phase) : 'the next step'}`;
      parts.push(`MODE: boundary. The person has skipped ${left} without using any tool. In one message: acknowledge the skip in one line, without a recap; if skipping it matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask one question about ${ahead}. Do not ask a learning question. No tool suggestion yet.`);
    } else parts.push(`MODE: boundary. The person has just left ${left} (${status ?? 'unknown'}). In one message: a one-sentence recap of what ${left} established; if it was left unfinished in a way that matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask one question about what they learned about how they solve problems in that step. No tool suggestion yet.`);
  }
  parts.push(`PHASE: ${session.phase}`);
  parts.push(`TODAY: ${String(session.updatedAt ?? '').slice(0, 10)}`);
  const missing = ['goal', 'whatIsTrue', 'whatCanBeDone'].filter((key) => !session.frame[key]);
  parts.push(`Frame: ${JSON.stringify(session.frame)}${missing.length ? `\nMissing frame answers: ${missing.join(', ')}` : ''}`);
  if (session.model) parts.push(`MODEL: ${session.model.id} (${session.model.reason})`);
  const earlier = earlierSteps(session);
  if (earlier) parts.push(earlier);
  const chosen = chosenOption(session);
  const books = session.model ? planStep(session.model.id, session.phase)?.book ?? [] : [];
  // Inside a Decide step the run lines already show the `choice` slot, so it is not repeated.
  if (chosen && !books.includes('decide')) parts.push(`CHOSEN OPTION (the aim for Implement): ${chosen.text}${chosen.contested ? ' (kept against the coach\'s objection)' : ''}`);
  else if (!chosen && books.includes('implement')) parts.push('CHOSEN OPTION: none recorded. Ask what was decided and confirm it as the aim before placing anything.');
  if (session.pendingLearning && session.runner?.mode !== 'boundary') {
    const from = stepName(session.model.id, session.pendingLearning);
    const hasTools = session.model && session.phase !== 'finished' && toolsForPlanStep(session.model.id, session.phase).length > 0;
    const after = session.phase === 'finished' ? '' : ` Either way, orient them to the current step in one sentence${hasTools ? ' and suggest its first tool with next_tool' : ''}.`;
    parts.push(`AWAITING LEARNING from ${from}: if they named something they learned, put it in "learning" (one sentence, their meaning); otherwise leave learning null.${after}`);
  }
  const step = currentStep(session);
  if (step) {
    for (const run of step.runs.filter((item) => item.status !== 'active')) {
      parts.push(`Earlier tool in this step ${run.tool}: ${run.status}${run.switchReason ? ` (${run.switchReason})` : ''}; ${run.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}${scoreNote(run)}`);
    }
  }
  const run = activeRun(session);
  if (run) parts.push(runLines(session, run));
  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary' && toolsForPlanStep(session.model.id, session.phase).length) parts.push('No tool is open in this step yet: orient them and suggest one with next_tool.');
  const tasks = taskLines(session);
  if (tasks) parts.push(tasks);
  if (session.pendingKeep) parts.push(`Last challenged answer (${session.pendingKeep.slot}): ${session.pendingKeep.text}`);
  if (session.summary) parts.push(`Summary so far: ${session.summary}`);
  const coachTurns = session.turns.filter((t) => t.role === 'coach').length;
  if (coachTurns > 0 && coachTurns % SUMMARY_EVERY === 0) parts.push('A summary is due this turn.');
  parts.push(`RECENT CONVERSATION:\n${transcript(session)}`);
  return { system: [RUBRIC, stepLayer(session)], user: parts.join('\n\n') };
}

export function repairPrompt(original, reply, error) {
  return {
    system: original.system,
    user: `${original.user}\n\nYOUR LAST REPLY WAS REJECTED: ${error}\nReply:\n${String(reply).slice(0, 2000)}\n\nSend a corrected JSON object only.`
  };
}

export function rewritePrompt(message) {
  return {
    system: ['You shorten coaching messages. Keep the meaning, the warmth and any final question. Reply with the rewritten message only.'],
    user: `Rewrite in at most 60 words:\n${message}`
  };
}
