// packages/decision-book/record.mjs
// The decision record Decision Maker writes to a Tasks page: composed from the session (never
// from the coach's words), as Problem Solver's case file is, with a digest per section so a later
// change offers a dated update. It also resolves a reason's basis (the model nodes it rests on)
// and names the provenance the page's graphic shows. Shared by the server's prompt and the page.
import { isComplete } from '../problem-solver/machine.mjs';
import { parseSlot } from '../problem-solver/slots.mjs';
import { stepName } from '../problem-solver/steps.mjs';
import { TOOLS } from '../problem-solver/tools/index.mjs';
import { hashText, sectionDigests } from '../problem-solver/case-file.mjs';
import { catalogueEntry } from './catalogue.mjs';
import { FEEDBACK_ID, RECORD_ID } from './record-slots.mjs';

/** Sections that never call for an update on their own (every step boundary adds a learning). */
const QUIET = new Set(['learnings']);
/** Basis references one reason may carry. */
export const BASIS_MAX = 4;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2027-02-01' -> '1 February 2027'; anything else as written. */
export function dateWords(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? '').trim());
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : String(text ?? '');
}

const keptRuns = (session, stepId) => (session.steps?.[stepId]?.runs ?? []).filter((run) => run.status !== 'switched');
const nameOf = (node) => parseSlot(node.slot)?.name;
const textsIn = (run, name) => (run ? run.nodes.filter((node) => nameOf(node) === name).map((node) => node.text) : []);
const firstIn = (run, name) => textsIn(run, name)[0] ?? null;
const modelName = (id) => TOOLS[id]?.name ?? id;

/**
 * The latest complete decision record run (switched runs never count), or null.
 * @param {import('../problem-solver/types').PsSession} session
 */
export function recordSource(session) {
  return keptRuns(session, 'decide').filter((run) => run.tool === RECORD_ID && isComplete(run)).at(-1) ?? null;
}

/**
 * Explore nodes a reason can rest on: the latest kept run of each model, every placed node.
 * @returns {{ tool: string, slot: string, runId: string, nodeId: string, title: string }[]}
 */
export function basisCandidates(session) {
  const latest = new Map();
  for (const run of keptRuns(session, 'explore')) if (run.nodes.length) latest.set(run.tool, run);
  return [...latest.values()].flatMap((run) => run.nodes.map((node) => ({ tool: run.tool, slot: node.slot, runId: run.id, nodeId: node.id, title: node.title ?? node.text })));
}

/**
 * The coach's basis references (`{ tool, slot }`) that name a placed Explore node, as stored
 * references (`{ runId, nodeId }`), without repeats and at most BASIS_MAX. Others are dropped.
 */
export function resolveBasis(session, refs) {
  const candidates = basisCandidates(session);
  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const hit = candidates.find((c) => c.tool === ref?.tool && c.slot === ref?.slot);
    if (hit && !out.some((item) => item.nodeId === hit.nodeId)) out.push({ runId: hit.runId, nodeId: hit.nodeId });
    if (out.length === BASIS_MAX) break;
  }
  return out;
}

const findNode = (session, ref) => {
  const run = Object.values(session.steps ?? {}).flatMap((step) => step.runs).find((item) => item.id === ref.runId);
  const node = run?.nodes.find((item) => item.id === ref.nodeId);
  return run && node ? { run, node } : null;
};

/**
 * The record chart's basis (`setBasis`): per reason node id, the model and node title it rests on.
 * References whose run or node is gone are left out.
 * @returns {Record<string, { model: string, title: string }[]>}
 */
export function basisOf(session) {
  const out = {};
  for (const [reasonId, refs] of Object.entries(session.basis ?? {})) {
    const list = refs.map((ref) => findNode(session, ref)).filter(Boolean).map(({ run, node }) => ({ model: modelName(run.tool), title: node.title ?? node.text }));
    if (list.length) out[reasonId] = list;
  }
  return out;
}

/**
 * The model the record leans on most: the Explore model its reasons cite most often (the earliest
 * on a tie), else the first kept Explore run with anything placed, else null.
 */
export function mainModel(session) {
  const runs = keptRuns(session, 'explore').filter((run) => run.nodes.length);
  const counts = new Map();
  for (const refs of Object.values(session.basis ?? {})) {
    for (const ref of refs) {
      const hit = findNode(session, ref);
      if (hit) counts.set(hit.run.tool, (counts.get(hit.run.tool) ?? 0) + 1);
    }
  }
  const order = runs.map((run) => run.tool).filter((tool, i, all) => all.indexOf(tool) === i);
  const cited = order.filter((tool) => counts.has(tool)).sort((a, b) => counts.get(b) - counts.get(a))[0];
  return cited ?? order[0] ?? null;
}

/** The date the record was settled: when the review date was accepted, else the session's last change. */
function decidedOn(session, record) {
  const node = record.nodes.find((item) => nameOf(item) === 'review');
  const turn = session.turns?.find((item) => item.id === node?.turnId);
  return String(turn?.createdAt ?? session.updatedAt ?? '').slice(0, 10);
}

/**
 * What the page's provenance graphic shows: the main model's emblem inside its section's, and
 * the caption. Null before a complete record.
 * @returns {{ model: string | null, section: number | null, models: string[], date: string, caption: string } | null}
 */
export function recordProvenance(session) {
  const record = recordSource(session);
  if (!record) return null;
  const main = mainModel(session);
  const models = keptRuns(session, 'explore').filter((run) => run.nodes.length).map((run) => modelName(run.tool)).filter((name, i, all) => all.indexOf(name) === i);
  const date = decidedOn(session, record);
  const caption = `Decided with The Decision Book · ${models.join(', ') || 'the decision record'} · ${dateWords(date)}`;
  return { model: main, section: main ? catalogueEntry(main)?.section ?? null : null, models, date, caption };
}

/** The latest kept feedback analysis in Review, or null. */
const reviewRun = (session) => keptRuns(session, 'review').filter((run) => run.tool === FEEDBACK_ID).at(-1) ?? null;

/**
 * `{ title, version, sections: [{ key, heading, lines }] }`, or null before a complete record.
 * Empty sections are left out. Once Review has a feedback analysis, what happened and what it
 * showed join the record (and so offer an update).
 */
export function composeRecord(session) {
  const record = recordSource(session);
  if (!record) return null;
  const basis = basisOf(session);
  const reasons = record.nodes.filter((node) => nameOf(node) === 'reason').map((node) => {
    const rests = basis[node.id];
    return rests ? `${node.text} (rests on ${rests.map((b) => `${b.model}: ${b.title}`).join('; ')})` : node.text;
  });
  const trigger = firstIn(record, 'trigger');
  const action = firstIn(record, 'action');
  const review = reviewRun(session);
  const actual = review ? review.nodes.filter((node) => nameOf(node) === 'force' && node.tag === 'actual').map((node) => node.text) : [];
  const explored = keptRuns(session, 'explore').filter((run) => run.nodes.length).map((run) => `${modelName(run.tool)}${isComplete(run) ? '' : ' (part done)'}`);
  const raw = [
    ['decision', 'The decision', [firstIn(record, 'decision')]],
    ['reasons', 'Why', reasons],
    ['stop_rule', 'What would make me rethink', [trigger && `If: ${trigger}`, action && `Then: ${action}`]],
    ['first_step', 'First step', [firstIn(record, 'first_step')]],
    ['review', 'Review on', [dateWords(firstIn(record, 'review'))]],
    ['known', 'What was known', [session.frame?.known]],
    ['models', 'Models used', explored],
    ['outcome', 'What happened', [...actual, firstIn(review, 'reflection') && `What it shows: ${firstIn(review, 'reflection')}`]],
    ['learnings', 'How it was decided', (session.learnings ?? []).map((item) => `${session.model ? stepName(session.model.id, item.step) : item.step}: ${item.text}`)]
  ];
  const sections = raw.map(([key, heading, lines]) => ({ key, heading, lines: lines.filter(Boolean) })).filter((section) => section.lines.length);
  return { title: `Decision: ${session.title}`, version: 1, sections };
}

/**
 * What the record card offers now, or null:
 * - `write`: no record on a page yet, every section;
 * - `update`: written before and a section other than the learnings changed (version + 1);
 * - `graphic`: written, nothing changed, but the provenance graphic did not write (retry it).
 * Held until the record is complete, during a review, and when the person said Not now to
 * exactly this content. Only decision sessions have a record.
 */
export function recordOffer(session) {
  if (session.kind !== 'decision') return null;
  return offerFor(session, composeRecord, recordProvenance);
}

/**
 * A book record's offer (write, update or graphic retry; see recordOffer), shared with Gear
 * Shifter's action record. `compose` and `provenance` build the record from the session.
 */
export function offerFor(session, compose, provenanceOf) {
  if (!session.model || session.status === 'archived') return null;
  if (session.reviewState?.status === 'reviewing') return null;
  const file = compose(session);
  if (!file) return null;
  const provenance = provenanceOf(session);
  const digests = sectionDigests(file);
  const key = hashText(JSON.stringify(digests));
  const written = session.caseFile;
  if (!written) return session.caseFileDeclined === key ? null : { kind: 'write', version: file.version, file, digests, key, changed: file.sections.map((s) => s.key), provenance };
  const changed = file.sections.filter((s) => written.sections[s.key] !== digests[s.key]).map((s) => s.key);
  if (changed.some((k) => !QUIET.has(k)) && session.caseFileDeclined !== key) return { kind: 'update', version: written.version + 1, file, digests, key, changed, provenance };
  if (written.graphic === false && session.caseFileDeclined !== key) return { kind: 'graphic', version: written.version, file, digests, key, changed: [], provenance };
  return null;
}
