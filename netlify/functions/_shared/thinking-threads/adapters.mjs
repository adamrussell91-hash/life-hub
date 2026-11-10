// netlify/functions/_shared/thinking-threads/adapters.mjs
// Result -> packet (spec section 4): what comes back from a detour, in one shape for every tool.
// { answer (one line), detail (short), restsOn: [], openQuestions: [], actions: [] (suggestions
// only), source: { tool, sessionId } }. Composed from the session's placed nodes, never from the
// coach's chat.
import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
import { chosenOption } from '../../../../packages/problem-solver/steps.mjs';
import { RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
import { COMMIT_ID as GEAR_COMMIT } from '../../../../packages/get-things-done/commit-slots.mjs';
import { COMMIT_ID as RULES_COMMIT } from '../../../../packages/rules-book/commit-slots.mjs';
import { COMMIT_ID as CHANGE_COMMIT } from '../../../../packages/change-book/commit-slots.mjs';
import { COMMIT_ID as COLLAB_COMMIT } from '../../../../packages/collaboration-book/commit-slots.mjs';
import { COMMIT_ID as COMM_COMMIT } from '../../../../packages/communication-book/commit-slots.mjs';

export const PACKET_TOOLS = Object.freeze([
  'problem-solver', 'decision-book', 'get-things-done', 'rules-book', 'change-book',
  'collaboration-book', 'communication-book', 'question-book', 'knowledge-protocols'
]);

const COMMIT_TOOL = Object.freeze({
  'get-things-done': GEAR_COMMIT,
  'rules-book': RULES_COMMIT,
  'change-book': CHANGE_COMMIT,
  'collaboration-book': COLLAB_COMMIT,
  'communication-book': COMM_COMMIT
});

const ANSWER_MAX = 200;
const DETAIL_MAX = 600;
const ITEM_MAX = 300;
const ITEMS_MAX = 8;

const line = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const items = (values) => [...new Set((values ?? []).map((v) => line(v, ITEM_MAX)).filter(Boolean))].slice(0, ITEMS_MAX);

function packet(tool, sessionId, { answer, detail = '', restsOn = [], openQuestions = [], actions = [] }) {
  return {
    answer: line(answer, ANSWER_MAX) || 'No answer came back.',
    detail: line(detail, DETAIL_MAX),
    restsOn: items(restsOn),
    openQuestions: items(openQuestions),
    actions: items(actions),
    source: { tool, sessionId: String(sessionId ?? '') }
  };
}

const keptRuns = (session) => Object.values(session.steps ?? {}).flatMap((step) => step.runs ?? []).filter((run) => run.status !== 'switched');
const nameOf = (node) => parseSlot(node.slot)?.name;
const textsIn = (run, name) => (run?.nodes ?? []).filter((node) => nameOf(node) === name).map((node) => node.title ?? node.text);
const latestRun = (session, toolId) => keptRuns(session).filter((run) => run.tool === toolId && run.nodes?.length).at(-1) ?? null;

/** Titles of the Explore nodes a record rests on (`session.basis`), as Decision Maker keeps them. */
function basisTitles(session) {
  const runs = keptRuns(session);
  return Object.values(session.basis ?? {}).flat().map((ref) => {
    const node = runs.find((run) => run.id === ref.runId)?.nodes.find((n) => n.id === ref.nodeId);
    return node ? node.title ?? node.text : null;
  }).filter(Boolean);
}

/** Decision Maker: the choice and what it rests on. */
function fromDecision(session) {
  const run = latestRun(session, RECORD_ID);
  const reasons = textsIn(run, 'reason');
  return packet('decision-book', session.id, {
    answer: textsIn(run, 'decision')[0] ?? session.summary ?? session.title,
    detail: reasons.join(' '),
    restsOn: [...reasons, ...basisTitles(session)],
    openQuestions: textsIn(run, 'trigger').map((t) => `Rethink if: ${t}`),
    actions: textsIn(run, 'first_step')
  });
}

/** A book's commit slots: result, rests_on, next_action, change_course. */
function fromCommit(tool, session) {
  const run = latestRun(session, COMMIT_TOOL[tool]);
  const restsOn = textsIn(run, 'rests_on');
  return packet(tool, session.id, {
    answer: textsIn(run, 'result')[0] ?? session.summary ?? session.title,
    detail: restsOn[0] ?? session.summary ?? '',
    restsOn: [...restsOn, ...basisTitles(session)],
    openQuestions: textsIn(run, 'change_course'),
    actions: textsIn(run, 'next_action')
  });
}

/** Problem Solver: the step outcome (the chosen option when Decide has one), else the coach's summary. */
function fromProblemSolver(session) {
  const chosen = chosenOption(session);
  const last = keptRuns(session).filter((run) => run.nodes?.length).at(-1) ?? null;
  const lastNode = last?.nodes.at(-1);
  return packet('problem-solver', session.id, {
    answer: chosen?.text ?? lastNode?.title ?? lastNode?.text ?? session.summary ?? session.title,
    detail: session.summary ?? '',
    restsOn: Object.values(session.frame ?? {}).filter((v) => typeof v === 'string'),
    openQuestions: chosen?.contested ? ['The chosen option was kept against the coach’s objection.'] : []
  });
}

/** Thought Starter: the lines the person ticked to send back ({ id?, lines: string[] }). */
function fromQuestions(record) {
  const lines = (record?.lines ?? []).map((l) => line(l, ITEM_MAX)).filter(Boolean);
  return packet('question-book', record?.id ?? record?.sessionId, {
    answer: lines[0] ?? 'Nothing was sent back.',
    detail: lines.slice(1).join(' '),
    restsOn: lines.slice(1),
    openQuestions: record?.openQuestions ?? []
  });
}

/** A protocol run: keyFinding -> answer, summary -> detail, openQuestions. Protocols never suggest actions. */
function fromProtocol(session) {
  const summary = session?.summary ?? {};
  return packet('knowledge-protocols', session?.id, {
    answer: summary.keyFinding ?? summary.title ?? 'Run completed.',
    detail: typeof summary.summary === 'string' ? summary.summary : '',
    openQuestions: Array.isArray(summary.openQuestions) ? summary.openQuestions : []
  });
}

/** The packet for a finished detour, from its tool's session (or Thought Starter's ticked record). */
export function packetFrom(tool, sessionOrRecord) {
  if (tool === 'decision-book') return fromDecision(sessionOrRecord);
  if (COMMIT_TOOL[tool]) return fromCommit(tool, sessionOrRecord);
  if (tool === 'problem-solver') return fromProblemSolver(sessionOrRecord);
  if (tool === 'question-book') return fromQuestions(sessionOrRecord);
  if (tool === 'knowledge-protocols') return fromProtocol(sessionOrRecord);
  throw Object.assign(new Error(`No packet adapter for ${tool}.`), { status: 400, code: 'validation_error' });
}
