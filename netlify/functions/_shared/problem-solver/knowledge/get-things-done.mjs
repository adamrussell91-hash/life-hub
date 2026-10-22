// netlify/functions/_shared/problem-solver/knowledge/get-things-done.mjs
// Gear Shifter's coach knowledge, in our own words (the repo is public: no book sentences).
// The catalogue lines and the per-technique notes are built from the tools themselves, so a
// technique's "use it when", steps and watch-fors are written once, in packages/get-things-done/tools/.
import { CATALOGUE, SECTIONS, entry as catalogueEntry } from '../../../../../packages/get-things-done/catalogue.mjs';
import { ROUTE } from '../../../../../packages/get-things-done/route.mjs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';

export const STANCE = `THE BOOK'S STANCE
The Get Things Done Book offers techniques to try, not rules to obey. Pick one that fits where the work is stuck, try it as a small experiment, and keep what works. Getting more done is not the goal for its own sake: the aim is to move the thing that matters. When someone wants a system that runs their day for them, say kindly that the app prepares the experiment and they run it.`;

export const ROUTE_GUIDE = `THE ROUTE
The book's five sections are five stations on a loop, in the order a piece of work lives through them:
${ROUTE.map((r) => `- ${r.id}: ${r.label}`).join('\n')}
Place the work from the person's answer to "where is it stuck?". Record one id in frame.route, or two joined with "+" when it truly sits at both (before+doing). Use only these ids. A start that keeps slipping is doing; work not yet shaped is before; anything that turns on someone else is others; a sense that the way itself is wrong is differently; looking back on something finished is after.`;

/**
 * The obstacles Discern names, each with the stations and techniques to look at first. The
 * techniques are a starting point, not the only choice.
 */
export const OBSTACLES = Object.freeze([
  Object.freeze({ id: 'no_priority', name: 'no clear priority', stations: ['before', 'doing'], look: ['gt_to_do_list', 'gt_triage', 'gt_five_twenty_five_rule', 'gt_tactics_versus_strategies'] }),
  Object.freeze({ id: 'avoided_start', name: 'an avoided start', stations: ['doing'], look: ['gt_procrastination', 'gt_five_second_rule', 'gt_pomodoro', 'gt_paralysis_by_analysis'] }),
  Object.freeze({ id: 'broken_attention', name: 'broken attention', stations: ['doing', 'before'], look: ['gt_deep_work', 'gt_inbox_management', 'gt_compartmentalisation', 'gt_batching', 'gt_bursty_communication'] }),
  Object.freeze({ id: 'too_little_capacity', name: 'too little capacity', stations: ['before', 'differently'], look: ['gt_budgeting', 'gt_kanban', 'gt_circle_of_competence', 'gt_circle_of_influence'] }),
  Object.freeze({ id: 'other_people', name: 'other people', stations: ['others'], look: ['gt_radical_transparency', 'gt_appreciation', 'gt_likeability', 'gt_delphi_method', 'gt_brainstorming', 'gt_structured_evaluation'] }),
  Object.freeze({ id: 'worn_out_energy', name: 'worn-out energy', stations: ['before', 'after'], look: ['gt_motivation', 'gt_routines', 'gt_reversed_effort', 'gt_transactional_model'] })
]);

export const OBSTACLE_GUIDE = `OBSTACLES (name one in a few words when you discern)
${OBSTACLES.map((o) => `- ${o.name} (stations ${o.stations.join(', ')}): look first at ${o.look.join(', ')}`).join('\n')}
If no single obstacle explains it and the whole project needs attention, recommend gt_getting_a_project_done: its stations point to the techniques for each stage.`;

export const GEAR_TRAPS = `TRAPS (challenge these too, naming the skill)
- planning used as a way to avoid starting (metacognition)
- a next action too big or too vague to start today (decision_making)
- stacking techniques instead of trying one and seeing what happens (metacognition)
- mistaking busyness or hours spent for output (critical_thinking)
- a check-back that never comes: no date, or one nobody will notice (decision_making)
- blaming a person rather than looking at how the work is set up (logical_reasoning)
- expecting the app to run a timer, a reminder or a habit for you (critical_thinking)`;

/** Entries folded into another, by the names they go by. */
const MERGED_NAMES = Object.freeze({
  gt_new_work: 'New Work',
  gt_myth_of_achievement: 'The Myth of Achievement',
  gt_matthew_effect: 'The Matthew Effect'
});

/** What a reused Problem Solver tool does differently as the book's variant. */
const COLUMN_WORDS = Object.freeze({ todo: 'To do', doing: 'Doing', review: 'Review', done: 'Done' });
function variantLines(tool) {
  if (tool.variantOf === 'kanban') {
    const columns = tool.nodeTags.card.map((c) => COLUMN_WORDS[c] ?? c);
    const limit = tool.suggestedWip === 3 ? 'three' : String(tool.suggestedWip);
    return [`Variant of Problem Solver's Kanban: the columns are ${columns.slice(0, -1).join(', ')} and ${columns.at(-1)} (card tags ${tool.nodeTags.card.join('|')}). Suggest a limit of ${limit} cards in Doing as a start, not a rule. Each card can carry effort, help and urgency.`];
  }
  if (tool.variantOf === 'five_whys') {
    return ['Variant of Problem Solver\'s 5 Whys: five is a guide, not a minimum. Check each answer against evidence before asking the next why, and stop at a root the evidence supports that the person can act on.'];
  }
  return [];
}

const STATION = Object.fromEntries(SECTIONS.map((s) => [s.key, s.route]));
const ids = (list) => list.join(', ');
const pairsOf = (id) => TOOLS[id]?.pairsWell ?? [];

/** The techniques a shift session's Explore can open: registered catalogue entries. */
const isTechnique = (id) => Boolean(catalogueEntry(id) && TOOLS[id]);

/** One line per technique: id, station and tier, use it when, the book's see also and ours. */
export function catalogueLines() {
  return CATALOGUE.map((item) => {
    const tool = TOOLS[item.id];
    const links = [
      item.seeAlso.length ? `Book's see also: ${ids(item.seeAlso)}.` : '',
      pairsOf(item.id).length ? `Pairs well (ours): ${ids(pairsOf(item.id))}.` : ''
    ].filter(Boolean).join(' ');
    return `- ${item.id} (${tool.name}) [${STATION[item.section]}, ${item.tier}]: ${tool.when}${links ? ` ${links}` : ''}`;
  }).join('\n');
}

/** The station names the catalogue lines refer to. */
export const SECTION_LINE = `Stations and sections: ${SECTIONS.map((s) => `${s.route} = ${s.title}`).join('; ')}.`;

/** What the chart needs before it counts as done, from its config, in plain words. */
function minimumLine(tool) {
  const chart = tool.chart ?? {};
  const MET = 'the state says MINIMUM MET when it is reached.';
  if (tool.family === 'list') return `Minimum: ${chart.minEntries ?? 3} entries across ${chart.minGroups ?? 2} groups, then the reflection; ${MET}`;
  if (tool.family === 'quadrant') return `Minimum: ${chart.minItems ?? 3} items in ${chart.minCells ?? 2} cells, then the reflection; ${MET}`;
  if (tool.family === 'path' && chart.rounds) return `Minimum: ${chart.minRounds ?? 1} full round of the stages; ${MET}`;
  if (tool.family === 'path') return `Minimum: every stage on its path; ${MET}`;
  if (tool.family === 'curve') return `Minimum: one marker on the curve, then the reflection; ${MET}`;
  if (tool.family === 'scales') return `Minimum: every scale scored; ${MET}`;
  if (tool.family === 'ratings') return `Minimum: the ideas, criteria and raters named, every score in, a recommendation and the decision owner; ${MET}`;
  return `Minimum: ${MET}`;
}

/** Getting a Project Done's stations, each with the techniques the book points to there. */
function stationLines(tool) {
  const stages = tool.chart?.stages?.filter((stage) => stage.tools?.length) ?? [];
  return stages.length ? [`Stations and their techniques (offer these as the next technique at each stage):\n${stages.map((s) => `  ${s.label}: ${s.tools.join(', ')}`).join('\n')}`] : [];
}

/**
 * The active technique's note: a cached system block of its own, so only the technique in use
 * is sent. Steps, slot meanings, the minimum, watch-fors, the exercise in our words, the entries
 * it carries and a variant's own rules.
 */
export function techniqueNote(id) {
  const tool = TOOLS[id];
  const item = catalogueEntry(id);
  if (!tool || !item) return null;
  const tier = item.tier === 'lens'
    ? 'Lens: explain the idea in two sentences, ask for the one marker or answer it needs, and it is done.'
    : 'Worksheet: work its steps in order, one slot per answer.';
  return [
    `TECHNIQUE NOTE: ${tool.name} (${id}), station ${STATION[item.section]}`,
    tier,
    `Use it when: ${tool.when}`,
    `Steps:\n${tool.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}`,
    `Slot meanings: ${Object.entries(tool.slots).map(([k, v]) => `${k} = ${v}${tool.nodeTags?.[k] ? ` (tag: ${tool.nodeTags[k].join('|')})` : ''}`).join('; ')}`,
    `Link kinds: ${tool.edgeKinds.join(', ') || 'none'}`,
    minimumLine(tool),
    `Watch for: ${tool.failureModes.join(' ')}`,
    ...variantLines(tool),
    ...(item.reuse ? ['Reused from Problem Solver: where its words say Implement, read Commit.'] : []),
    ...(item.merged.length ? [`Also carries: ${item.merged.map((m) => MERGED_NAMES[m] ?? m).join(', ')} (already folded into its steps and watch-fors).`] : []),
    ...stationLines(tool),
    ...(tool.exercise ? [`Exercise (offer once, when the minimum is met, as an experiment with a check-back, never a timer): ${tool.exercise}`] : [])
  ].join('\n');
}

/** Follow-ups for "another angle": the book's see also first, then ours, Gear Shifter techniques only. */
export function anotherAngle(id, done = []) {
  const item = catalogueEntry(id);
  if (!item) return { book: [], ours: [] };
  const skip = new Set([id, ...done]);
  const book = item.seeAlso.filter((other) => isTechnique(other) && !skip.has(other));
  const ours = pairsOf(id).filter((other) => isTechnique(other) && !skip.has(other) && !book.includes(other));
  return { book, ours };
}
