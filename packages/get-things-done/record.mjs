// packages/get-things-done/record.mjs
// The action record Gear Shifter writes to a Tasks page: composed from the session (never from
// the coach's words), as Decision Maker's decision record is, with a digest per section so a
// later change offers a dated update. The basis helpers and the offer rules are Decision
// Maker's (both books' Explore steps work the same way); the sections, provenance and caption
// are Gear Shifter's own. Shared by the server's prompt and, in Plan 5, the page.
import { isComplete } from '../problem-solver/machine.mjs';
import { parseSlot } from '../problem-solver/slots.mjs';
import { stepName } from '../problem-solver/steps.mjs';
import { TOOLS } from '../problem-solver/tools/index.mjs';
import { basisOf, dateWords, mainModel, offerFor } from '../decision-book/record.mjs';
import { entry as catalogueEntry } from './catalogue.mjs';
import { COMMIT_ID, EXPERIMENT_REVIEW_ID } from './commit-slots.mjs';
import { REVIEW_TOOL } from './model.mjs';

const keptRuns = (session, stepId) => (session.steps?.[stepId]?.runs ?? []).filter((run) => run.status !== 'switched');
const nameOf = (node) => parseSlot(node.slot)?.name;
const firstIn = (run, name) => (run ? run.nodes.find((node) => nameOf(node) === name)?.text ?? null : null);
const techniqueName = (id) => TOOLS[id]?.name ?? id;
const worked = (session) => keptRuns(session, 'explore').filter((run) => run.nodes.length);

/**
 * The latest complete experiment (switched runs never count), or null.
 * @param {import('../problem-solver/types').PsSession} session
 */
export function commitSource(session) {
  return keptRuns(session, 'commit').filter((run) => run.tool === COMMIT_ID && isComplete(run)).at(-1) ?? null;
}

/** The day the experiment was set: when its check-back was accepted, else the session's last change. */
function setOn(session, run) {
  const node = run.nodes.find((item) => nameOf(item) === 'check_back');
  const turn = session.turns?.find((item) => item.id === node?.turnId);
  return String(turn?.createdAt ?? session.updatedAt ?? '').slice(0, 10);
}

/**
 * What the page's provenance graphic shows: the main technique's emblem inside its section's,
 * and the caption. Null before a complete experiment.
 * @returns {{ technique: string | null, section: string | null, techniques: string[], date: string, caption: string } | null}
 */
export function actionProvenance(session) {
  const run = commitSource(session);
  if (!run) return null;
  const main = mainModel(session);
  const techniques = worked(session).map((item) => techniqueName(item.tool)).filter((name, i, all) => all.indexOf(name) === i);
  const date = setOn(session, run);
  const caption = `Worked with The Get Things Done Book · ${main ? techniqueName(main) : 'the experiment'} · ${dateWords(date)}`;
  return { technique: main, section: main ? catalogueEntry(main)?.section ?? null : null, techniques, date, caption };
}

/** What happened, from Review's latest kept run: the experiment review, or Project Evaluation. */
function outcomeLines(session) {
  const run = keptRuns(session, 'review').filter((item) => [EXPERIMENT_REVIEW_ID, REVIEW_TOOL].includes(item.tool)).at(-1);
  if (!run) return [];
  if (run.tool === EXPERIMENT_REVIEW_ID) {
    return [['changed', 'Changed'], ['cost', 'Cost'], ['keep', 'Keep']].map(([slot, label]) => firstIn(run, slot) && `${label}: ${firstIn(run, slot)}`);
  }
  const groups = TOOLS[REVIEW_TOOL].chart.groups;
  const entries = run.nodes.filter((node) => nameOf(node) === 'entry').map((node) => `${groups.find((g) => g.id === node.tag)?.label ?? 'Note'}: ${node.text}`);
  const reflection = firstIn(run, 'reflection');
  return [...entries, reflection && `What it shows: ${reflection}`];
}

/** A session that went deeper from a Quick start: its first action and how it started. */
function startLines(session) {
  const seeds = session.frameSeeds;
  if (seeds?.from !== 'start') return [];
  const way = seeds.way === 'countdown' ? 'a countdown cue' : seeds.way === 'interval' ? 'a protected interval' : null;
  return [seeds.action && `First action: ${seeds.action}`, way && `Started with ${way}${seeds.cue ? `: ${seeds.cue}` : ''}`];
}

/**
 * `{ title, version, sections: [{ key, heading, lines }] }`, or null before a complete
 * experiment. Empty sections are left out. Once Review has a run, what happened joins the
 * record (and so offers an update).
 */
export function composeActionRecord(session) {
  const run = commitSource(session);
  if (!run) return null;
  const basis = basisOf(session);
  const restsOn = run.nodes.filter((node) => nameOf(node) === 'rests_on').map((node) => {
    const uses = basis[node.id];
    return uses ? `${node.text} (uses ${uses.map((b) => `${b.model}: ${b.title}`).join('; ')})` : node.text;
  });
  const techniques = worked(session).map((item) => `${techniqueName(item.tool)}${isComplete(item) ? '' : ' (part done)'}`);
  const raw = [
    ['result', 'The result that matters', [firstIn(run, 'result')]],
    ['rests_on', 'What it rests on', restsOn],
    ['next_action', 'Next action', [firstIn(run, 'next_action')]],
    ['start', 'How it starts', [firstIn(run, 'start')]],
    ['check_back', 'Check back on', [dateWords(firstIn(run, 'check_back'))]],
    ['change_course', 'What would change course', [firstIn(run, 'change_course')]],
    ['need', 'What needed to move', [session.frame?.need]],
    ['quick_start', 'Began as a Quick start', startLines(session)],
    ['known', 'What was known', [session.frame?.known]],
    ['techniques', 'Techniques used', techniques],
    ['outcome', 'What happened', outcomeLines(session)],
    ['learnings', 'How it got done', (session.learnings ?? []).map((item) => `${session.model ? stepName(session.model.id, item.step) : item.step}: ${item.text}`)]
  ];
  const sections = raw.map(([key, heading, lines]) => ({ key, heading, lines: lines.filter(Boolean) })).filter((section) => section.lines.length);
  return { title: `Action record: ${session.title}`, version: 1, sections };
}

/**
 * What the record card offers now, or null: `write`, `update` or `graphic`, by Decision
 * Maker's rules (decision-book/record.mjs recordOffer). Only shift sessions have one.
 */
export function actionOffer(session) {
  if (session.kind !== 'shift') return null;
  return offerFor(session, composeActionRecord, actionProvenance);
}
