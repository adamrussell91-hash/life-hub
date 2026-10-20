// packages/problem-solver/case-file.mjs
// The case file Document writes to a Tasks page: composed from the session (never by the
// coach), with a digest per section so the page and the server can tell what changed since
// it was written. Shared by the server's prompt and the page's card so the two cannot drift.
import { isComplete } from './machine.mjs';
import { parseSlot } from './slots.mjs';
import { chosenOption, planStepForBook, stepName } from './steps.mjs';
import { nameVersion } from './naming.mjs';

/** Sections that never call for an update on their own (every step boundary adds a learning). */
const QUIET = new Set(['learnings']);

const keptRuns = (session) => Object.values(session.steps ?? {}).flatMap((step) => step.runs).filter((run) => run.status !== 'switched');
const latest = (session, tool, test = () => true) => keptRuns(session).filter((run) => run.tool === tool && test(run)).at(-1) ?? null;
const texts = (run, name) => (run ? run.nodes.filter((node) => parseSlot(node.slot)?.name === name).map((node) => node.text) : []);
const first = (run, name) => texts(run, name)[0] ?? null;

/**
 * The latest complete 5 Cs run the case file is built from, or null.
 * @param {import('./types').PsSession} session
 * @returns {import('./types').PsToolRun | null}
 */
export function caseFileSource(session) {
  return latest(session, 'five_cs', isComplete);
}

/**
 * `{ title, version, sections: [{ key, heading, lines }] }`, or null before a complete 5 Cs run.
 * Empty sections are left out. Improve's latest learned, double-loop strategies and feedback
 * actions are included (Plan 6 hook).
 * @param {import('./types').PsSession} session
 * @returns {import('./types').PsCaseFile | null}
 */
export function composeCaseFile(session) {
  const five = caseFileSource(session);
  if (!five) return null;
  const km = latest(session, 'knowledge_management');
  const aar = latest(session, 'after_action_review');
  const loop = latest(session, 'double_loop');
  const feedback = latest(session, 'feedback_matrix');
  const chosen = chosenOption(session);
  const title = first(five, 'correspond');
  const frame = session.frame ?? {};
  const raw = [
    ['purpose', 'Purpose', [first(five, 'contextualise')]],
    ['problem', 'The problem', [session.title, frame.goal && `Goal: ${frame.goal}`, frame.whatIsTrue && `What was true: ${frame.whatIsTrue}`]],
    ['decision', 'What was decided', [chosen?.text]],
    ['actions', 'Actions', (session.proposedTasks ?? []).filter((p) => p.status === 'confirmed').map((p) => p.title)],
    ['kept', 'What to keep', texts(five, 'condense')],
    ['learned', 'What was learned', [first(aar, 'learned'), ...texts(loop, 'strategy').map((t) => `New strategy: ${t}`), ...texts(feedback, 'action').map((t) => `From feedback: ${t}`)]],
    ['knowledge', 'Knowledge captured', [...texts(km, 'explicit').map((t) => `Written down: ${t}`), ...texts(km, 'tacit').map((t) => `Know-how: ${t}`), first(km, 'share') && `Shared: ${first(km, 'share')}`, first(km, 'review') && `Review: ${first(km, 'review')}`]],
    ['corrections', 'Corrections', [first(five, 'correct')]],
    ['filed', 'Where it is filed', [first(five, 'categorise')]],
    ['learnings', 'How it was solved', (session.learnings ?? []).map((item) => `${session.model ? stepName(session.model.id, item.step) : item.step}: ${item.text}`)]
  ];
  const sections = raw.map(([key, heading, lines]) => ({ key, heading, lines: lines.filter(Boolean) })).filter((section) => section.lines.length);
  return { title, version: nameVersion(title) ?? 1, sections };
}

/**
 * A short stable hash (FNV-1a, 32 bits, hex).
 * @param {string} text
 * @returns {string}
 */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * @param {import('./types').PsCaseFile} file
 * @returns {Record<string, string>}
 */
export function sectionDigests(file) {
  return Object.fromEntries(file.sections.map((section) => [section.key, hashText(JSON.stringify([section.heading, section.lines]))]));
}

/**
 * What the case-file card offers now, or null:
 * - `write`: no case file yet (version from the name, else 1), every section;
 * - `update`: written before and a section other than the learnings changed (version + 1).
 * Held until Document is reached, while a Document tool is part-done (one write takes in the
 * whole step), during a review, and when the person said Not now to exactly this content.
 * @param {import('./types').PsSession} session
 * @returns {import('./types').PsCaseFileOffer | null}
 */
export function caseFileOffer(session) {
  if (!session.model || session.status === 'archived') return null;
  const document = planStepForBook(session.model.id, 'document');
  if (!document || !session.steps?.[document]) return null;
  if (session.reviewState?.status === 'reviewing') return null;
  if (session.phase === document && session.steps[document].runs.some((run) => run.status === 'active' && !isComplete(run))) return null;
  const file = composeCaseFile(session);
  if (!file) return null;
  const digests = sectionDigests(file);
  const key = hashText(JSON.stringify(digests));
  if (session.caseFileDeclined === key) return null;
  const record = session.caseFile;
  if (!record) return { kind: 'write', version: file.version, file, digests, key, changed: file.sections.map((s) => s.key) };
  const changed = file.sections.filter((s) => record.sections[s.key] !== digests[s.key]).map((s) => s.key);
  if (!changed.some((k) => !QUIET.has(k))) return null;
  return { kind: 'update', version: record.version + 1, file, digests, key, changed };
}
