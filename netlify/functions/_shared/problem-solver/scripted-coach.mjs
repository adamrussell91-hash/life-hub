// netlify/functions/_shared/problem-solver/scripted-coach.mjs
import { canEdge, canPropose, checkNode, nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { countSlots, parseSlot } from '../../../../packages/problem-solver/slots.mjs';
import { petalsOf } from '../../../../packages/problem-solver/tools/lotus-blossom.mjs';
import { CHOICE_SLOT } from '../../../../packages/problem-solver/tools/choice.mjs';
import { matrixTotals, options } from '../../../../packages/problem-solver/tools/decision-matrix.mjs';
import { attributesOf, contradictionPairs, subjectsOf } from '../../../../packages/problem-solver/tools/morphological.mjs';
import { KANBAN_COLUMNS } from '../../../../packages/problem-solver/tools/kanban.mjs';
import { QUADRANTS } from '../../../../packages/problem-solver/tools/swot.mjs';
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { chosenOption, defaultToolFor } from '../../../../packages/problem-solver/steps.mjs';
import { activeRun } from './session.mjs';

/**
 * Deterministic coach for local dev and tests. Short answers (under six words) are challenged.
 * An answer starting `switch:` suggests switching to Problem tree (the browser walk uses it).
 * An answer like `link: cause 1 to problem, plus` adds that link between nodes already placed.
 * An answer like `option: …` places in that open slot (a Kanban card may use a column instead,
 * `doing: …`). Once a Decide tool can take its choice, an answer with no hint is the choice.
 */
const FRAME = [
  ['goal', 'What is the goal, as an ideal state rather than a fix? Say what good looks like.'],
  ['whatIsTrue', 'Good, that is a clear aim. Now, what is actually true here? Separate the facts and data from what you believe or feel.'],
  ['whatCanBeDone', 'That is evidence, not opinion. What can be done: can this be solved as it stands, or should we reframe it to something more achievable?']
];

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

const base = { node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null };

export async function scriptedCoach(session) {
  const latest = session.turns.at(-1);
  const last = latest?.role === 'user' ? latest.text : '';
  if (session.runner?.mode === 'boundary') {
    return { ...base, verdict: 'clarify', message: 'Fair enough, that step is behind us now. Before we go on: what did you learn about how you tend to work through problems in that step?' };
  }
  if (session.pendingLearning) {
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
    if (session.turns.length === 1) return { ...base, verdict: 'clarify', message: FRAME[0][1] };
    const missing = FRAME.filter(([key]) => !session.frame[key]);
    const [key] = missing[0];
    const frame = { [key]: last };
    if (missing.length === 1) {
      return { ...base, verdict: 'accept', frame, message: 'Clear enough to work with. I suggest the problem solving process, starting with 5 Whys, because there is one symptom here with a likely single chain of cause.', model: { id: 'seven_step', reason: 'A real problem that will need analysis and a decision.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom, likely one chain.' }, skillsSeen: ['analysis'] };
    }
    return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
  }
  const run = activeRun(session);
  if (!run && !defaultToolFor(session.model.id, session.phase)) return { ...base, verdict: 'clarify', message: 'There is no tool for this step yet. Tell me what you notice, or move on when you are ready.' };
  if (!run) return { ...base, verdict: 'clarify', message: 'Pick a tool to start this step, and we will work through it one question at a time together.' };
  if (!last) {
    const first = TOOLS[run.tool].steps[0];
    const chosen = TOOLS[run.tool].step === 'implement' ? chosenOption(session) : null;
    const carry = chosen ? `We are carrying forward: ${chosen.title}. ` : '';
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
  const { slot, text, tag } = placement(run, last);
  if (text.split(/\s+/).filter(Boolean).length < 6) {
    return { ...base, verdict: 'challenge', ...fillNode(run, slot, text, tag), proposeTasks: [], skillsMissing: ['analysis'], message: 'That is too thin to stand on yet. It reads like a symptom rather than a cause. Can you say what specifically happens, and when?' };
  }
  const message = slot === CHOICE_SLOT ? choiceMessage(run) : 'That holds up: it names a process, not a person. Now, why does that happen? Base your answer on what you just said.';
  return { ...base, verdict: 'accept', ...fillNode(run, slot, text, tag), skillsSeen: ['analysis'], message };
}
