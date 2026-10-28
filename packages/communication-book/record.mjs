// packages/communication-book/record.mjs
// The record the Communication Book writes to a Tasks page: composed from the session (never from
// the coach's words), as the Collaboration Book's action record is, with a digest per section so a
// later change offers a dated update. The basis helpers and the offer rules are Decision Maker's.
import { isComplete } from '../problem-solver/machine.mjs';
import { parseSlot } from '../problem-solver/slots.mjs';
import { stepName } from '../problem-solver/steps.mjs';
import { TOOLS } from '../problem-solver/tools/index.mjs';
import { basisOf, dateWords, mainModel, offerFor } from '../decision-book/record.mjs';
import { entry as catalogueEntry } from './catalogue.mjs';
import { COMMIT_ID, REVIEW_ID } from './commit-slots.mjs';

const keptRuns = (session, stepId) => (session.steps?.[stepId]?.runs ?? []).filter((run) => run.status !== 'switched');
const nameOf = (node) => parseSlot(node.slot)?.name;
const firstIn = (run, name) => (run ? run.nodes.find((node) => nameOf(node) === name)?.text ?? null : null);
const modelName = (id) => TOOLS[id]?.name ?? id;
const worked = (session) => keptRuns(session, 'explore').filter((run) => run.nodes.length);

/** The latest complete step (switched runs never count), or null. */
export function commitSource(session) {
  return keptRuns(session, 'commit').filter((run) => run.tool === COMMIT_ID && isComplete(run)).at(-1) ?? null;
}

/** The day the next step was committed to: when its date was accepted, else the session's last change. */
function setOn(session, run) {
  const node = run.nodes.find((item) => nameOf(item) === 'check_back');
  const turn = session.turns?.find((item) => item.id === node?.turnId);
  return String(turn?.createdAt ?? session.updatedAt ?? '').slice(0, 10);
}

/** What the page's provenance caption shows. Null before a complete step. */
export function actionProvenance(session) {
  const run = commitSource(session);
  if (!run) return null;
  const main = mainModel(session);
  const models = worked(session).map((item) => modelName(item.tool)).filter((name, i, all) => all.indexOf(name) === i);
  const date = setOn(session, run);
  const caption = `Worked with The Communication Book · ${main ? modelName(main) : 'the next conversation'} · ${dateWords(date)}`;
  return { technique: main, section: main ? catalogueEntry(main)?.section ?? null : null, techniques: models, date, caption };
}

/** What happened, from Review's latest kept run. */
function outcomeLines(session) {
  const run = keptRuns(session, 'review').filter((item) => item.tool === REVIEW_ID).at(-1);
  if (!run) return [];
  return [['happened', 'Happened'], ['landed', 'How it landed'], ['keep', 'The approach']].map(([slot, label]) => firstIn(run, slot) && `${label}: ${firstIn(run, slot)}`);
}

/**
 * `{ title, version, sections: [{ key, heading, lines }] }`, or null before a complete
 * step. Empty sections are left out.
 */
export function composeActionRecord(session) {
  const run = commitSource(session);
  if (!run) return null;
  const basis = basisOf(session);
  const restsOn = run.nodes.filter((node) => nameOf(node) === 'rests_on').map((node) => {
    const uses = basis[node.id];
    return uses ? `${node.text} (uses ${uses.map((b) => `${b.model}: ${b.title}`).join('; ')})` : node.text;
  });
  const models = worked(session).map((item) => `${modelName(item.tool)}${isComplete(item) ? '' : ' (part done)'}`);
  const raw = [
    ['result', 'What would show it went better', [firstIn(run, 'result')]],
    ['rests_on', 'What it rests on', restsOn],
    ['next_action', 'The next conversation', [firstIn(run, 'next_action')]],
    ['owner', 'Who takes it', [firstIn(run, 'owner')]],
    ['check_back', 'Come back on', [dateWords(firstIn(run, 'check_back'))]],
    ['change_course', 'What would change course', [firstIn(run, 'change_course')]],
    ['situation', 'The exchange', [session.frame?.situation]],
    ['wanted', 'A better exchange would be', [session.frame?.outcome]],
    ['models', 'Models used', models],
    ['outcome', 'What happened', outcomeLines(session)],
    ['learnings', 'How it went', (session.learnings ?? []).map((item) => `${session.model ? stepName(session.model.id, item.step) : item.step}: ${item.text}`)]
  ];
  const sections = raw.map(([key, heading, lines]) => ({ key, heading, lines: lines.filter(Boolean) })).filter((section) => section.lines.length);
  return { title: `Communication Book: ${session.title}`, version: 1, sections };
}

/** What the record card offers now, or null: `write`, `update` or `graphic`. Only communication sessions have one. */
export function actionOffer(session) {
  if (session.kind !== 'talk') return null;
  return offerFor(session, composeActionRecord, actionProvenance);
}
