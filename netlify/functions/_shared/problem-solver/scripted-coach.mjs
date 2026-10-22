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
import { MODELS } from '../../../../packages/problem-solver/models.mjs';
import { namingProblem } from '../../../../packages/problem-solver/naming.mjs';
import { chosenOption, defaultToolFor, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { applyStep, currentEntry, isQuestion, LIGHTNING_NODES } from '../../../../packages/problem-solver/lightning.mjs';
import * as quickFlow from '../../../../packages/decision-book/quick.mjs';
import { FEEDBACK_ID, RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
import { basisCandidates } from '../../../../packages/decision-book/record.mjs';
import { isRecordDate } from '../../../../packages/decision-book/tools/record.mjs';
import { anotherAngle } from './knowledge/decision-book.mjs';
import { validateCoachTurn } from './coach-schema.mjs';
import { activeRun, currentStep, followOn, reopenProblem, skippedUntouched, waitingForReview } from './session.mjs';

/**
 * Deterministic coach for local dev and tests. Short answers (under six words) are challenged.
 * An answer starting `switch:` suggests switching to Problem tree (the browser walk uses it).
 * An answer like `link: cause 1 to problem, plus` adds that link between nodes already placed.
 * An answer like `option: …` places in that open slot (a Kanban card may use a column instead,
 * `doing: …`). Once a Decide tool can take its choice, an answer with no hint is the choice.
 * `next: <tool id>` suggests that tool when it belongs to the step, and `reopen: define` (or
 * `analyse`) suggests reopening that step once double-loop learning allows it. A third frame
 * answer containing `model: polya` (or `triz`) chooses that model. A 5 Cs name
 * that breaks a strict naming rule is challenged with that rule's advice. A decision session
 * takes its opening message as the decision, then asks who it is about and what is known; the
 * compass comes from the wording (team, others, them … → others; improve, better, change … →
 * improve). In a decision session, once a model meets its minimum, `another angle` suggests the
 * next model from its see also (as `next_model`, read through the coach schema like a live reply)
 * and `decide` suggests moving on to Decide. The decision record takes its slots in order (a
 * `reason:` hint adds another reason); each reason rests on the first Explore node it has not
 * yet used, and the review needs a YYYY-MM-DD date. In Review, a feedback analysis force reads
 * as expected when it says expected, thought, hoped or planned, otherwise as actual. A quadrant
 * model's item goes in the cell its words name ("… do immediately").
 */
const FRAME = [
  ['goal', 'What is the goal, as an ideal state rather than a fix? Say what good looks like.'],
  ['whatIsTrue', 'Good, that is a clear aim. Now, what is actually true here? Separate the facts and data from what you believe or feel.'],
  ['whatCanBeDone', 'That is evidence, not opinion. What can be done: can this be solved as it stands, or should we reframe it to something more achievable?']
];

const DECISION_FRAME = [
  ['decision', 'What are you deciding, or trying to see clearly? Put it in one sentence.'],
  ['compass', 'Clear. Who is this about, you or other people, and do you want to understand it or to improve it?'],
  ['known', 'Good. What do you already know: the options, the facts, the deadline and what is at stake?']
];

const SHIFT_FRAME = [
  ['need', 'What needs to move? Put it in one sentence.'],
  ['route', 'Clear. Where is it stuck: before you start, while doing it, with other people, in changing course, or after it is done?'],
  ['known', 'Good. What do you already know: the deadline, the people, what you have tried and what is at stake?']
];

/**
 * Why each model fits, for a third frame answer naming it with `model: polya` or `model: triz`
 * (the walks use it). Every model's first step takes Define tools, so 5 Whys comes first for all.
 */
const MODEL_REASONS = {
  seven_step: 'A real problem that will need analysis and a decision.',
  polya: 'A bounded problem with a clear test of success.',
  triz: 'Improving one thing makes another worse.'
};

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
  // A Decision Book model's required link: the first placed node the tool lets it join.
  const kind = TOOLS[run.tool].requiredLinks?.[name]?.kind;
  if (kind) {
    const candidate = { ...run, nodes: [...run.nodes, { id: '__candidate__', slot }] };
    const to = run.nodes.find((node) => canEdge(candidate, '__candidate__', node.id, kind));
    return to ? [{ from: slot, to: to.slot, kind }] : [];
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
  // The decision record moves on in order: a further reason needs its hint.
  if (run.tool === RECORD_ID) return { slot: open.find((s) => parseSlot(s)?.name !== 'reason') ?? open[0], text: answer, tag: null };
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
  if (run.tool === FEEDBACK_ID && name === 'force') return /\b(expected|thought|hoped|planned)\b/i.test(text) ? 'expected' : 'actual';
  // A Decision Book quadrant item names its cell in words ("… do immediately").
  const cells = TOOLS[run.tool].chart?.cells;
  if (cells && name === 'item') return cells.find((cell) => text.toLowerCase().includes(cell.label.toLowerCase()))?.id ?? null;
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

/** The compass quadrant the scripted coach hears in an answer. */
function heardCompass(text) {
  const who = /\b(team|others?|they|them|staff|people|partner|colleagues?|my (son|daughter|kids|class))\b/i.test(text) ? 'others' : 'self';
  const aim = /\b(improve|better|change|fix|grow|lead|develop)\b/i.test(text) ? 'improve' : 'understand';
  return `${who}_${aim}`;
}

/** The route station the scripted coach hears in an answer; doing it, when nothing else is named. */
function heardRoute(text) {
  if (/\b(finished|done with|afterwards|look back|review|wrapped up)\b/i.test(text)) return 'after';
  if (/\b(team|others?|they|them|people|colleagues?|partner|staff)\b/i.test(text)) return 'others';
  if (/\b(change|differently|direction|pivot|new way)\b/i.test(text)) return 'differently';
  if (/\b(before|plan|planning|prepare|haven.t started|start)\b/i.test(text)) return 'before';
  return 'doing';
}

/** Gear Shifter framing: the opening message is the need; then the route, then what is known. */
function shiftFrameTurn(session, last) {
  const missing = SHIFT_FRAME.filter(([key]) => !session.frame[key]);
  const [key] = missing[0];
  const frame = { [key]: key === 'route' ? heardRoute(last) : last };
  if (missing.length > 1) return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
  const first = toolsForPlanStep('gear_shifter', 'explore')[0];
  return {
    ...base,
    verdict: 'accept',
    frame,
    message: first ? 'That frames it. I suggest starting with one technique that fits where it is stuck. Shall we begin?' : 'That frames it. Pick a technique from the shelf when you are ready.',
    suggestion: first ? { kind: 'next_tool', tool: first, reason: 'A first technique that fits where it is stuck.' } : null,
    skillsSeen: ['decision_making']
  };
}

/** Decision framing: the opening message is the decision; then the compass, then what is known. */
function decisionFrameTurn(session, last) {
  const missing = DECISION_FRAME.filter(([key]) => !session.frame[key]);
  const [key] = missing[0];
  const frame = { [key]: key === 'compass' ? heardCompass(last) : last };
  if (missing.length > 1) return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
  const first = toolsForPlanStep('decision_book', 'explore')[0];
  return asCoachReply({
    verdict: 'accept',
    frame,
    message: 'That frames it well. I suggest starting with one model that lays out the sides to weigh. Shall we begin?',
    suggestion: first ? { kind: 'next_model', tool: first, reason: 'A first model with clear sides to weigh.' } : null,
    skillsSeen: ['decision_making']
  });
}

/** A decision turn read through the coach schema, as a live reply is (so next_model becomes next_tool). */
function asCoachReply(raw) {
  const result = validateCoachTurn(raw);
  if (!result.ok) throw new Error(`Scripted decision turn is invalid: ${result.error}`);
  return result.value;
}

/** The Explore node a new reason rests on: the first one no placed reason uses yet, else the first. */
function restsOn(session) {
  const candidates = basisCandidates(session);
  const used = new Set(Object.values(session.basis ?? {}).flat().map((ref) => ref.nodeId));
  const pick = candidates.find((c) => !used.has(c.nodeId)) ?? candidates[0];
  return pick ? [{ tool: pick.tool, slot: pick.slot }] : [];
}

/**
 * A decision session's own turns, or null to fall through to the shared ones: opening a step's
 * model, another angle, Decide, the decision record's reasons and date, and the review.
 */
function decisionTurn(session, last, run) {
  if (!run && waitingForReview(session)) return { ...base, verdict: 'clarify', message: `Review picks up on ${dueText(session)}. Press Review now if the results are already in.` };
  if (!run && session.reviewState?.status === 'reviewing' && session.phase === 'review') {
    return asCoachReply({ verdict: 'clarify', suggestion: { kind: 'next_model', tool: FEEDBACK_ID, reason: 'Compare what you expected with what happened.' }, message: 'The results are in. The feedback analysis sets what you expected beside what happened; start it when you are ready.' });
  }
  if (!run && session.phase === 'explore') {
    const first = toolsForPlanStep(session.model.id, 'explore')[0];
    return asCoachReply({ verdict: 'clarify', suggestion: { kind: 'next_model', tool: first, reason: 'A first model with clear sides to weigh.' }, message: 'Pick a model from the shelf, or start with this one: it lays out the sides to weigh.' });
  }
  if (!run) return null;
  if (/^another angle\b/i.test(last.trim()) && session.phase === 'explore') {
    if (!followOn(session)) return { ...base, verdict: 'clarify', message: 'Finish this model first: it is not at its minimum yet. What goes next on the chart?' };
    const used = (currentStep(session)?.runs ?? []).map((item) => item.tool);
    const { book, ours } = anotherAngle(run.tool, used);
    const tool = book[0] ?? ours[0];
    if (!tool) return { ...base, verdict: 'clarify', suggestion: { kind: 'next_step', reason: 'No other angle is listed; settle the decision.' }, message: 'There is no other angle listed for this one. Shall we settle the decision?' };
    return asCoachReply({ verdict: 'clarify', suggestion: { kind: 'next_model', tool, reason: `Another angle on the same decision: ${TOOLS[tool].name}.` }, message: `Another angle would help: ${TOOLS[tool].name} looks at it from a different side. Start it when you are ready.` });
  }
  if (/^decide\b/i.test(last.trim()) && session.phase === 'explore') {
    return { ...base, verdict: 'clarify', suggestion: { kind: 'next_step', reason: 'The models have done their work.' }, message: 'Then let us settle it. Move on to Decide when you are ready.' };
  }
  if (run.tool !== RECORD_ID) return null;
  const { slot, text } = placement(run, last);
  const name = parseSlot(slot)?.name;
  if (name === 'review') {
    const date = /\d{4}-\d{2}-\d{2}/.exec(text)?.[0];
    if (!isRecordDate(date)) return { ...base, verdict: 'clarify', message: 'Give the review a date, written like 2027-01-21. When will you look at what happened?' };
    return { ...base, verdict: 'accept', node: { slot, text: date }, skillsSeen: ['metacognition'], message: 'Review set for that date; confirm it on the card. The decision record is complete.' };
  }
  if (wordCount(text) < 6) return null;
  if (name === 'reason') {
    return { ...base, verdict: 'accept', node: { slot, text }, basis: restsOn(session), skillsSeen: ['decision_making'], message: 'That reason rests on what the model showed. Now, what would make you rethink: what would you notice?' };
  }
  return null;
}

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

/**
 * A quick decision walked by rule. The tests are set with `tests: one? / two? / three?`, or `use
 * those` for the suggested three; a test takes yes or no; the trigger, action and closing boxes
 * take a few words; the check takes a date (YYYY-MM-DD) or `no`. `go deeper` (or `escalate`)
 * suggests a full decision.
 */
const QUICK_ASKS = {
  tests: `Set three yes/no tests before you answer any, such as: ${quickFlow.SUGGESTED_TESTS.join(' ')} Say "tests: one? / two? / three?", or "use those".`,
  trigger: 'Now a Stop Rule. If this happens, you stop or rethink: what would you notice?',
  action: 'And then you will do what? Agree it now.',
  check: 'Do you want a dated check on how it went? Give a date, or say no.',
  learn: 'What did this teach you about how you decide?',
  next: 'What next?'
};

function quickMessage(state, before = '') {
  const entry = quickFlow.currentEntry(state);
  if (!entry) return `${before}That is decided. Press It came back if the call comes up again.`;
  const outcome = quickFlow.outcomeOf(state);
  const ended = entry.node === 'trigger' ? 'Three yeses: go ahead. ' : entry.node === 'learn' && outcome === 'stop' && !state.path.some((e) => e.round === state.rounds && e.node === 'learn' && e.note) ? 'A no, so do not go ahead. ' : '';
  const ask = quickFlow.isTest(entry.node) ? quickFlow.testLabel(state, entry.node) : QUICK_ASKS[entry.node];
  return `${before}${ended}${ask}`;
}

function quickTurn(session, last) {
  const state = session.quick;
  const entry = quickFlow.currentEntry(state);
  const turn = (verdict, message, quick = null, extra = {}) => ({ ...base, verdict, message, quick, ...extra });
  if (!entry) return turn('clarify', 'That is decided. Say "it came back" if the call comes up again.');
  if (session.turns.length === 1 || last === 'It came back.') return turn('clarify', quickMessage(state));
  if (/^(escalate|go deeper)$/i.test(last.trim())) {
    return turn('clarify', 'This sounds bigger than a quick call. A full decision may suit it better.', null, { suggestion: { kind: 'escalate', reason: 'Named as needing a full decision.' } });
  }
  const accept = (step, skills = ['decision_making']) => turn('accept', quickMessage(quickFlow.applyStep(state, step, session.updatedAt)), step, { skillsSeen: skills });
  const kind = quickFlow.QUICK_NODES[entry.node].kind;
  if (kind === 'tests') {
    const tests = /^use those\b/i.test(last.trim()) ? [...quickFlow.SUGGESTED_TESTS] : (/^tests:\s*(.+)$/is.exec(last.trim())?.[1].split('/').map((t) => t.trim()).filter(Boolean) ?? []);
    if (tests.length !== 3) return turn('clarify', QUICK_ASKS.tests);
    return accept({ node: 'tests', tests }, ['critical_thinking']);
  }
  if (kind === 'test') {
    const reply = /^(yes|no)\b[\s,.]*(.*)$/is.exec(last.trim());
    const answer = reply?.[1].toLowerCase();
    const words = reply?.[2].trim() ?? '';
    // A Yes or No pressed on the chart has already moved the run on.
    if (reply && !words && /^(yes|no)\.$/i.test(last.trim()) && state.path.at(-2)?.answer === answer) return turn('clarify', quickMessage(state, 'Noted. '));
    if (!answer) return turn('clarify', `Yes or no: ${quickFlow.testLabel(state, entry.node)}`);
    return accept({ node: entry.node, answer, ...(words ? { note: words } : {}) });
  }
  if (kind === 'check') {
    const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(last)?.[1];
    if (date && quickFlow.isCheckDate(date)) return accept({ node: 'check', note: date }, ['metacognition']);
    if (/^(no|skip)\b/i.test(last.trim())) return accept({ node: 'check', answer: 'no' });
    return turn('clarify', QUICK_ASKS.check);
  }
  if (wordCount(last) < 2) return turn('clarify', 'Say a little more about that.');
  return accept({ node: entry.node, note: last.trim() }, entry.node === 'learn' ? ['metacognition'] : ['decision_making']);
}

export async function scriptedCoach(session) {
  if (session.kind === 'lightning') {
    const turn = session.turns.at(-1);
    return lightningTurn(session, turn?.role === 'user' ? turn.text : '');
  }
  if (session.kind === 'quick') {
    const turn = session.turns.at(-1);
    return quickTurn(session, turn?.role === 'user' ? turn.text : '');
  }
  const latest = session.turns.at(-1);
  const last = latest?.role === 'user' ? latest.text : '';
  if (session.runner?.mode === 'boundary') {
    const left = session.steps?.[session.runner.leaving];
    if (skippedUntouched(left)) {
      const then = session.phase === 'finished' ? 'The whole problem is on the record now.' : 'Tell me what you notice here; the first tool for this step is ready below.';
      return { ...base, verdict: 'clarify', message: `Fair enough, nothing was done in that step, so there is nothing to look back on. ${then}` };
    }
    const how = session.kind === 'decision' ? 'decide' : session.kind === 'shift' ? 'get things done' : 'tend to work through problems';
    return { ...base, verdict: 'clarify', message: `Fair enough, that step is behind us now. Before we go on: what did you learn about how you ${how} in that step?` };
  }
  if (session.pendingLearning) {
    if (waitingForReview(session)) {
      const step = session.kind === 'decision' || session.kind === 'shift' ? 'Review' : 'Improve';
      return { ...base, verdict: 'clarify', learning: last || null, message: `Thank you, that is worth keeping. ${step} picks up at your review on ${dueText(session)}.` };
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
    if (session.kind === 'decision') return decisionFrameTurn(session, last || session.turns[0].text);
    if (session.kind === 'shift') return shiftFrameTurn(session, last || session.turns[0].text);
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
      const hinted = /\bmodel:\s*([a-z_]+)/i.exec(last)?.[1]?.toLowerCase();
      const id = MODEL_REASONS[hinted] ? hinted : 'seven_step';
      return { ...base, verdict: 'accept', frame, message: `Clear enough to work with. I suggest ${MODELS[id].name.replace(/^The /, 'the ')}, starting with 5 Whys, because there is one symptom here with a likely single chain of cause.`, model: { id, reason: MODEL_REASONS[id] }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom, likely one chain.' }, skillsSeen: ['analysis'] };
    }
    return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
  }
  const run = activeRun(session);
  if (session.kind === 'decision') {
    const own = decisionTurn(session, last, run);
    if (own) return own;
  }
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
    const carry = chosen ? `We are carrying forward: ${chosen.title}. ` : run.tool === 'after_action_review' || (run.tool === FEEDBACK_ID && session.reviewState?.status === 'reviewing') ? reviewOpening(session) : '';
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
  const message = slot === CHOICE_SLOT ? choiceMessage(run)
    : session.kind === 'decision' ? 'That holds up, and it is on the chart. What goes next: what else belongs here?'
      : 'That holds up: it names a process, not a person. Now, why does that happen? Base your answer on what you just said.';
  return { ...base, verdict: 'accept', ...fillNode(run, slot, text, tag), skillsSeen: ['analysis'], message };
}
