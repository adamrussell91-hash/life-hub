// netlify/functions/_shared/problem-solver/scripted-coach.mjs
import { canEdge, canPropose, checkNode, nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { countSlots, parseSlot } from '../../../../packages/problem-solver/slots.mjs';
import { petalsOf } from '../../../../packages/problem-solver/tools/lotus-blossom.mjs';
import { CHOICE_SLOT } from '../../../../packages/problem-solver/tools/choice.mjs';
import { matrixTotals, options } from '../../../../packages/problem-solver/tools/decision-matrix.mjs';
import { attributesOf, contradictionPairs, subjectsOf } from '../../../../packages/problem-solver/tools/morphological.mjs';
import { KANBAN_COLUMNS } from '../../../../packages/problem-solver/tools/kanban.mjs';
import { QUADRANTS } from '../../../../packages/problem-solver/tools/swot.mjs';
import { longestEarlier } from '../../../../packages/problem-solver/tools/after-action-review.mjs';
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { namingProblem } from '../../../../packages/problem-solver/naming.mjs';
import { chosenOption, defaultToolFor, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { applyStep, currentEntry, isQuestion, LIGHTNING_NODES } from '../../../../packages/problem-solver/lightning.mjs';
import { activeRun, reopenProblem, skippedUntouched, waitingForReview } from './session.mjs';

/**
 * Deterministic coach for local dev and tests. Short answers (under six words) are challenged.
 * An answer starting `switch:` suggests switching to Problem tree (the browser walk uses it).
 * An answer like `link: cause 1 to problem, plus` adds that link between nodes already placed.
 * An answer like `option: …` places in that open slot (a Kanban card may use a column instead,
 * `doing: …`). Once a Decide tool can take its choice, an answer with no hint is the choice.
 * `next: <tool id>` suggests that tool when it belongs to the step, and `reopen: define` (or
 * `analyse`) suggests reopening that step once double-loop learning allows it. A 5 Cs name
 * that breaks a strict naming rule is challenged with that rule's advice.
 */
const FRAME = [
  ['goal', 'What is the goal, as an ideal state rather than a fix? Say what good looks like.'],
  ['whatIsTrue', 'Good, that is a clear aim. Now, what is actually true here? Separate the facts and data from what you believe or feel.'],
  ['whatCanBeDone', 'That is evidence, not opinion. What can be done: can this be solved as it stands, or should we reframe it to something more achievable?']
];

/** A seed without its closing full stop, so the sentence around it keeps one. */
const bare = (text) => String(text).trim().replace(/[.]+$/, '');

const nodesNamed = (run, name) => run.nodes.filter((node) => parseSlot(node.slot)?.name === name);

/** The links a slot needs to pass its tool's check: each satisfied the simplest way. */
function linksFor(run, slot) {
  const name = parseSlot(slot)?.name;
  if (run.tool === 'lotus_blossom' && name === 'idea') {
    const petals = petalsOf(run);
    const solution = nodesNamed(run, 'solution').find((node) => (petals.get(node.id)?.length ?? 0) < 8);
    return solution ? [{ from: slot, to: solution.slot, kind: 'petal' }] : [];
  }
  if (run.tool === 'lotus_blossom' && name === 'preferred') {
    const idea = nodesNamed(run, 'idea').at(-1);
    return idea ? [{ from: slot, to: idea.slot, kind: 'marks' }] : [];
  }
  if (run.tool === 'duncker' && name === 'solution') {
    const pathway = nodesNamed(run, 'pathway').at(-1);
    return pathway ? [{ from: slot, to: pathway.slot, kind: 'under' }] : [];
  }
  if (run.tool === 'swot' && QUADRANTS.includes(name)) {
    const option = nodesNamed(run, 'option').at(-1);
    return option ? [{ from: slot, to: option.slot, kind: 'of' }] : [];
  }
  if (run.tool === 'morphological') return morphLinks(run, slot, name);
  if (run.tool === 'feedback_matrix' && (name === 'why' || name === 'how')) {
    const theme = nodesNamed(run, 'theme').at(-1);
    return theme ? [{ from: slot, to: theme.slot, kind: 'of' }] : [];
  }
  if (run.tool === 'fifteen_percent' && name === 'chosen') {
    const picked = new Set(run.edges.filter((edge) => edge.kind === 'picks').map((edge) => edge.to));
    const action = nodesNamed(run, 'action').find((node) => !picked.has(node.id));
    return action ? [{ from: slot, to: action.slot, kind: 'picks' }] : [];
  }
  return [];
}

function morphLinks(run, slot, name) {
  const subjects = subjectsOf(run);
  if (name === 'attribute') {
    const thinnest = subjects.reduce((best, subject) => (!best || attributesOf(run, subject.id).length < attributesOf(run, best.id).length ? subject : best), null);
    return thinnest ? [{ from: slot, to: thinnest.slot, kind: 'of' }] : [];
  }
  if (name === 'contradiction') {
    const firsts = subjects.slice(0, 2).map((subject) => attributesOf(run, subject.id)[0]).filter(Boolean);
    return firsts.length === 2 ? firsts.map((attr) => ({ from: slot, to: attr.slot, kind: 'pair' })) : [];
  }
  if (name === 'scenario') {
    const paired = new Set(contradictionPairs(run).flat());
    return subjects.flatMap((subject) => {
      const attrs = attributesOf(run, subject.id);
      const pick = attrs.find((attr) => !paired.has(attr.id)) ?? attrs[0];
      return pick ? [{ from: slot, to: pick.slot, kind: 'picks' }] : [];
    });
  }
  return [];
}

/** The node and links for an answer, with a tag and text the tool will accept. */
function fillNode(run, slot, text, tag = null) {
  const name = parseSlot(slot)?.name;
  const edges = linksFor(run, slot);
  const node = { slot, text };
  if (run.tool === 'problem_reduction' && slot === 'priority') {
    node.text = Array.from({ length: countSlots(run, 'sub') }, (_, i) => i + 1).join(', ');
  }
  const tags = TOOLS[run.tool].nodeTags?.[name];
  if (tags) node.tag = tag ?? tags.find((t) => !checkNode(run, { ...node, tag: t }, edges)) ?? tags[0];
  const proposeTasks = canPropose(run, node) ? [{ slot, title: text.split(/\s+/).slice(0, 8).join(' '), due: null }] : [];
  return { node, edges, proposeTasks };
}

/**
 * The slot, text and tag an answer goes to: a `<slot name>:` hint for an open slot (or a
 * Kanban column for the next card), else the choice when a Decide tool can take it, else
 * the first open slot.
 */
function placement(run, answer) {
  const open = nextSlots(run);
  const hint = /^([a-z_]+):\s*(.*)$/is.exec(answer);
  if (hint) {
    const name = hint[1].toLowerCase();
    const text = hint[2].trim();
    const slot = open.find((s) => parseSlot(s)?.name === name);
    if (slot) return { slot, text, tag: null };
    const card = open.find((s) => parseSlot(s)?.name === 'card');
    if (run.tool === 'kanban' && card && KANBAN_COLUMNS.includes(name)) return { slot: card, text, tag: name };
  }
  if (open.includes(CHOICE_SLOT)) return { slot: CHOICE_SLOT, text: answer, tag: null };
  return { slot: open.find((s) => s !== 'root') ?? 'root', text: answer, tag: null };
}

/** The tag an answer's wording implies, for the tools whose tags the scripted coach reads from text. */
function tagFromText(run, slot, text) {
  const name = parseSlot(slot)?.name;
  if (run.tool === 'double_loop' && name === 'recurs') return /^yes\b/i.test(text) || /again|came back|recur/i.test(text) ? 'yes' : 'no';
  if (run.tool === 'feedback_matrix' && name === 'theme') {
    if (/\b(more|keep)\b/i.test(text)) return 'do_more';
    return /\?|unclear/i.test(text) ? 'question' : 'change';
  }
  return null;
}

const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

/** The review's date as the waiting panel shows it ("Mon, 2 Nov"), or a plain phrase when it has none. */
function dueText(session) {
  const due = session.reviewState?.due;
  return due ? new Date(`${due}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'its date';
}

/** The after action review's opening: how it went, with the task counts when the page sent them. */
function reviewOpening(session) {
  const counts = session.taskSnapshot?.byStatus;
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;
  return total ? `Let's look at how it went. ${counts.done} of ${total} tasks are done. ` : 'Let\'s look at how it went. ';
}

const REOPEN_REASON = 'The governing assumption was set upstream; changing it at the source lets the fix hold.';

/** What the coach says when the choice is placed: the leader, when the tool can tell. */
function choiceMessage(run) {
  const leader = run.tool === 'decision_matrix' ? matrixTotals(run)?.leader : null;
  const option = leader != null ? options(run)[leader] : null;
  return option ? `The scores lead with ${option.title ?? option.text}; carrying your choice into Implement.` : 'Carrying your choice into Implement.';
}

/** `cause 1` → `cause:1`, `problem` → `problem`. */
function slotFrom(words) {
  return words.trim().toLowerCase().replace(/\s+(\d+)$/, ':$1').replace(/\s+/g, '_');
}

/** Parse `link: <slot words> to <slot words>, <kind>` into a link in slot form, or null. */
function parseLink(text) {
  const match = /^link:\s*(.+?)\s+to\s+(.+?)\s*,\s*([a-z_ ]+?)\s*$/i.exec(text);
  return match ? { from: slotFrom(match[1]), to: slotFrom(match[2]), kind: slotFrom(match[3]) } : null;
}

const base = { node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, lightning: null };

/**
 * Lightning runs: the coach asks the current box, reads a reply starting yes or no (then
 * optional words) as the answer, takes a goal, learn, next or cannot line of three words or
 * more as the note, and treats `escalate` as asking for the full process.
 */
const LIGHTNING_NOTE_NODES = ['goal', 'learn', 'next', 'cannot'];

function lightningMessage(state, before) {
  const entry = currentEntry(state);
  if (!entry) return 'That run is done.';
  const def = LIGHTNING_NODES[entry.node];
  const strategy = def.kind === 'strategy' ? ` Try it on your snag, then say what you did and whether it worked.` : '';
  return `${before}Next: ${def.label}${/[?.]$/.test(def.label) ? '' : '.'}${strategy}`;
}

function lightningTurn(session, last) {
  const state = session.lightning;
  const entry = currentEntry(state);
  const turn = (verdict, message, lightning = null, extra = {}) => ({ ...base, verdict, message, lightning, ...extra });
  if (!entry) return turn('clarify', 'That run is done. Say "it came back" if it returns.');
  const def = LIGHTNING_NODES[entry.node];
  const asking = `${def.label}${def.kind === 'strategy' ? ' Try it on your snag, then say what you did and whether it worked.' : ''}`;
  if (session.turns.length === 1 || last === 'It came back.') return turn('clarify', asking);
  if (/^escalate$/i.test(last.trim())) {
    return turn('clarify', 'This sounds bigger than a quick pass. The full process may suit it better.', null, { suggestion: { kind: 'escalate', reason: 'Named as needing the full process.' } });
  }
  const reply = /^(yes|no)\b[\s,.]*(.*)$/is.exec(last.trim());
  const answer = reply?.[1].toLowerCase();
  const words = reply?.[2].trim() ?? '';
  const chartAnswered = reply && !words && /^(yes|no)\.$/i.test(last.trim()) && state.path.at(-2)?.answer === answer;
  if (chartAnswered) return turn('clarify', lightningMessage(state, 'Noted. '));
  const note = words || undefined;
  if (isQuestion(entry.node) || (def.kind === 'strategy' && entry.node !== 'cannot')) {
    if (!answer) return turn('clarify', `Start with yes or no. ${asking}`);
    const step = { node: entry.node, answer, ...(note ? { note } : {}) };
    return turn('accept', lightningMessage(applyStep(state, step, session.updatedAt), ''), step);
  }
  if (LIGHTNING_NOTE_NODES.includes(entry.node)) {
    if (wordCount(last) < 3) return turn('clarify', 'Say a little more about that.');
    const step = { node: entry.node, note: last.trim() };
    return turn('accept', lightningMessage(applyStep(state, step, session.updatedAt), ''), step);
  }
  return turn('clarify', asking);
}

export async function scriptedCoach(session) {
  if (session.kind === 'lightning') {
    const turn = session.turns.at(-1);
    return lightningTurn(session, turn?.role === 'user' ? turn.text : '');
  }
  const latest = session.turns.at(-1);
  const last = latest?.role === 'user' ? latest.text : '';
  if (session.runner?.mode === 'boundary') {
    const left = session.steps?.[session.runner.leaving];
    if (skippedUntouched(left)) {
      const then = session.phase === 'finished' ? 'The whole problem is on the record now.' : 'Tell me what you notice here; the first tool for this step is ready below.';
      return { ...base, verdict: 'clarify', message: `Fair enough, nothing was done in that step, so there is nothing to look back on. ${then}` };
    }
    return { ...base, verdict: 'clarify', message: 'Fair enough, that step is behind us now. Before we go on: what did you learn about how you tend to work through problems in that step?' };
  }
  if (session.pendingLearning) {
    if (waitingForReview(session)) {
      return { ...base, verdict: 'clarify', learning: last || null, message: `Thank you, that is worth keeping. Improve picks up at your review on ${dueText(session)}.` };
    }
    const hasTool = session.phase !== 'finished' && session.model && defaultToolFor(session.model.id, session.phase);
    const message = session.phase === 'finished'
      ? 'Thank you, that is worth keeping. The whole problem is on the record now; come back to it whenever you need to.'
      : hasTool
        ? 'Thank you, that is worth keeping. Let us open the next step with a tool that fits; start it when you are ready.'
        : 'Thank you, that is worth keeping. There is no tool for this step yet, so tell me what you notice here, or move on when you are ready.';
    return { ...base, verdict: 'clarify', learning: last || null, message };
  }
  if (session.phase === 'finished') {
    return { ...base, verdict: 'clarify', message: 'The whole problem is on the record. Anything you add now is a note for next time; what would you want to remember?' };
  }
  if (session.phase === 'frame') {
    if (session.turns.length === 1) {
      // Escalated from Lightning: the carried seeds come first, for the person to confirm or change.
      const seeds = session.frameSeeds;
      if (seeds) {
        return { ...base, verdict: 'clarify', message: `Carried over from Lightning. Goal: ${bare(seeds.goal ?? 'not set')}. What is true: ${bare(seeds.whatIsTrue ?? 'nothing tried yet')}. Is that still right, or what would you change?` };
      }
      return { ...base, verdict: 'clarify', message: FRAME[0][1] };
    }
    const missing = FRAME.filter(([key]) => !session.frame[key]);
    const [key] = missing[0];
    const frame = { [key]: last };
    if (missing.length === 1) {
      return { ...base, verdict: 'accept', frame, message: 'Clear enough to work with. I suggest the problem solving process, starting with 5 Whys, because there is one symptom here with a likely single chain of cause.', model: { id: 'seven_step', reason: 'A real problem that will need analysis and a decision.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom, likely one chain.' }, skillsSeen: ['analysis'] };
    }
    return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
  }
  const run = activeRun(session);
  if (!run && waitingForReview(session)) {
    return { ...base, verdict: 'clarify', message: `Improve picks up at your review on ${dueText(session)}. Until then, tell me anything you notice.` };
  }
  if (!run && session.reviewState?.status === 'reviewing' && toolsForPlanStep(session.model.id, session.phase).includes('after_action_review')) {
    return { ...base, verdict: 'clarify', suggestion: { kind: 'next_tool', tool: 'after_action_review', reason: 'The results are in; compare them with the aim.' }, message: 'The results are in. An after action review compares what you meant to happen with what did; start it when you are ready.' };
  }
  if (!run && !defaultToolFor(session.model.id, session.phase)) return { ...base, verdict: 'clarify', message: 'There is no tool for this step yet. Tell me what you notice, or move on when you are ready.' };
  if (!run) {
    const tool = defaultToolFor(session.model.id, session.phase);
    return { ...base, verdict: 'clarify', suggestion: { kind: 'next_tool', tool, reason: 'A good first tool for this step.' }, message: `Pick a tool to start this step; ${TOOLS[tool].name} is a good first one, and we will work through it one question at a time together.` };
  }
  if (!last) {
    const first = TOOLS[run.tool].steps[0];
    const chosen = TOOLS[run.tool].step === 'implement' ? chosenOption(session) : null;
    const carry = chosen ? `We are carrying forward: ${chosen.title}. ` : run.tool === 'after_action_review' ? reviewOpening(session) : '';
    return { ...base, verdict: 'clarify', message: `${carry}Let's start the ${TOOLS[run.tool].name}. ${first.title}: ${first.prompt}` };
  }
  if (/^link:/i.test(last)) {
    const edge = parseLink(last);
    const idOf = (slot) => run.nodes.find((node) => node.slot === slot)?.id ?? null;
    if (!edge || !canEdge(run, idOf(edge.from), idOf(edge.to), edge.kind)) {
      return { ...base, verdict: 'clarify', message: `That link does not fit the ${TOOLS[run.tool].name}. Say it as "link: cause 1 to problem, plus", between things already on the map.` };
    }
    return { ...base, verdict: 'accept', edges: [edge], skillsSeen: ['analysis'], message: 'Linked. What else does that lead to, and does it make it more or less?' };
  }
  if (/^switch:/i.test(last) && run.tool !== 'problem_tree') {
    return { ...base, verdict: 'clarify', suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: last.replace(/^switch:\s*/i, '') || 'The causes branch.' }, message: 'Then a single chain will not hold it. A problem tree lets the causes branch; shall we switch?' };
  }
  const nextHint = /^next:\s*([a-z_]+)\s*$/i.exec(last);
  if (nextHint) {
    const tool = nextHint[1].toLowerCase();
    if (TOOLS[tool] && toolsForPlanStep(session.model.id, session.phase).includes(tool)) {
      return { ...base, verdict: 'clarify', suggestion: { kind: 'next_tool', tool, reason: 'Named as the next tool.' }, message: `Then let us go on with ${TOOLS[tool].name}; start it when you are ready.` };
    }
    return { ...base, verdict: 'clarify', message: 'That tool does not belong to this step. Pick one of the step\'s own tools.' };
  }
  const reopenHint = /^reopen:\s*([a-z]+)\s*$/i.exec(last);
  if (reopenHint) {
    const book = reopenHint[1].toLowerCase();
    const problem = ['define', 'analyse'].includes(book) ? reopenProblem(session, book) : 'Only Define or Analyse can be reopened.';
    if (problem) return { ...base, verdict: 'clarify', message: problem };
    return { ...base, verdict: 'clarify', suggestion: { kind: 'reopen_step', step: book, reason: REOPEN_REASON }, message: `Then the fix belongs in ${book === 'define' ? 'Define' : 'Analyse'}. Reopen it, change what the assumption shaped, and move on to come back here.` };
  }
  const placed = placement(run, last);
  const { slot, text } = placed;
  const tag = placed.tag ?? tagFromText(run, slot, text);
  if (wordCount(text) < 6) {
    return { ...base, verdict: 'challenge', ...fillNode(run, slot, text, tag), proposeTasks: [], skillsMissing: ['analysis'], message: 'That is too thin to stand on yet. It reads like a symptom rather than a cause. Can you say what specifically happens, and when?' };
  }
  const nameAdvice = run.tool === 'five_cs' && slot === 'correspond' ? namingProblem(text) : null;
  if (nameAdvice) {
    return { ...base, verdict: 'challenge', ...fillNode(run, slot, text, tag), proposeTasks: [], skillsMissing: ['critical_thinking'], message: `That name needs one more thing: ${nameAdvice} Then it can be found and trusted later. What is the full name?` };
  }
  if (run.tool === 'after_action_review' && slot === 'learned' && wordCount(text) <= longestEarlier(run)) {
    return { ...base, verdict: 'challenge', ...fillNode(run, slot, text, tag), proposeTasks: [], skillsMissing: ['reflective_thinking'], message: `Learning is the heart of the review, yet this is shorter than what you said about what happened. Tell me more: what will you keep, change or try next time, and why?` };
  }
  const message = slot === CHOICE_SLOT ? choiceMessage(run) : 'That holds up: it names a process, not a person. Now, why does that happen? Base your answer on what you just said.';
  return { ...base, verdict: 'accept', ...fillNode(run, slot, text, tag), skillsSeen: ['analysis'], message };
}
