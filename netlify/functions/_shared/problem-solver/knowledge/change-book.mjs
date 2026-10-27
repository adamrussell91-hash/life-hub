// netlify/functions/_shared/problem-solver/knowledge/change-book.mjs
// The Change Book coach's knowledge, in our own words (the repo is public: no book sentences).
// The catalogue lines and the per-model notes are built from the tools themselves, so a model's
// "use it when", steps and watch-fors are written once, in packages/change-book/tools/.
import { CATALOGUE, SECTIONS, entry as catalogueEntry } from '../../../../../packages/change-book/catalogue.mjs';
import { ANY_GROUP, GROUPS } from '../../../../../packages/change-book/route.mjs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';

export const STANCE = `THE BOOK'S STANCE
The Change Book is a catalogue of separate models for how things change, in the world and in a life. It is a shelf to choose from, with no programme to work through. Offer one model that fits the change, say plainly where it may fit only partly, and let the person try one small step they can undo. A model earns its place while it helps the person see the change more clearly; when it stops helping, set it down. Present every model as one lens among several, and leave the person free to argue with it.`;

/** The four stages that run through every session, whichever model is in play. */
export const CHANGE_CHECKS = `THE FOUR STAGES (run them in every session, in a few words each time)
- Name the change and what should stay. Novelty is never the goal in itself: ask what is valuable and worth keeping before anything moves. Anti-Change can open or close any session for exactly this.
- Select one lens that fits. Use Science, Objectivity or Othering to question a story; Meaning of Life or Decision to compare choices; Change to see who carries the cost; Swarm Intelligence to look at how a group decides.
- Make one example concrete. Work the chosen chart on one real example. Keep the evidence the person saw apart from their interpretation, and name one assumption that could turn out wrong.
- Choose a small, reversible step and a review date. Name the people it affects and what it keeps.
Dated forecasts, figures and snapshots in the book are examples from when it was written. Treat them as examples, and look for current evidence before leaning on any of them.`;

export const GROUP_GUIDE = `THE GROUPS
The book's four main parts are four places a change can sit:
${GROUPS.map((g) => `- ${g.id}: ${g.label}`).join('\n')}
Place the change from the person's answer to "where does it sit?". Record one id in frame.group, or two joined with "+" when it truly sits at both (self+mine). Use only these ids. A system, a society, a market or a way of knowing is world; a judgment about yourself or other people, an identity or a choice of what matters is self; your own habits, attention, time, pressures and decisions are mine; a team, an organisation, a community or a shared future is ours. Anti-Change (${ANY_GROUP.join(', ')}) belongs to every group.`;

/**
 * The kinds of change Select names, each with the groups and models to look at first, after the
 * book's natural groupings. The models are a starting point, never the only choice.
 */
export const LENSES = Object.freeze([
  Object.freeze({ id: 'question_story', name: 'a story or claim worth questioning', groups: ['world', 'self'], look: ['ch_science', 'ch_objectivity', 'ch_othering', 'ch_rhizome', 'ch_counterculture'] }),
  Object.freeze({ id: 'what_matters', name: 'a choice about what matters', groups: ['self', 'mine'], look: ['ch_meaning_of_life', 'ch_decision', 'ch_sustainability', 'ch_future'] }),
  Object.freeze({ id: 'attention_pressure', name: 'attention, pressure or who carries the cost', groups: ['mine'], look: ['ch_change', 'ch_multitasking', 'ch_unhappiness', 'ch_transparency'] }),
  Object.freeze({ id: 'systems', name: 'a system or a group that reacts to change', groups: ['ours', 'world'], look: ['ch_swarm_intelligence', 'ch_braess', 'ch_preemption', 'ch_innovation', 'ch_climate_disaster', 'ch_three_t'] }),
  Object.freeze({ id: 'keep_valuable', name: 'what is worth keeping through the change', groups: ['mine', 'ours', 'world', 'self'], look: ['ch_anti_change', 'ch_change', 'ch_sustainability'] })
]);

export const LENS_GUIDE = `KINDS OF CHANGE (name one in a few words when you select a model)
${LENSES.map((o) => `- ${o.name} (groups ${o.groups.join(', ')}): look first at ${o.look.join(', ')}`).join('\n')}
Offer one model and one limit: a plausible way the model could mislead here, or a neighbouring model that pulls the other way.`;

export const CHANGE_TRAPS = `TRAPS (challenge these too, naming the skill)
- change for its own sake, with nothing named that should stay (critical_thinking)
- an interpretation placed on the chart as if it were evidence (critical_thinking)
- a dated forecast or figure from the book treated as a current fact (critical_thinking)
- fitting the change to a favourite model instead of choosing the model for the change (metacognition)
- stacking several models instead of trying one and seeing what happens (metacognition)
- a step too big, too hard to undo, or with no review date (decision_making)
- forgetting the people the change lands on (logical_reasoning)
- quoting the book or a named thinker; paraphrase the idea instead`;

/** Entries folded into another, by the names they go by. */
const MERGED_NAMES = Object.freeze({
  ch_back_of_napkin: 'The Back-of-the-Napkin Model',
  ch_prejudice: 'The Prejudice Model',
  ch_dictatorship: 'The Dictatorship Model'
});

/** What a reused tool does differently as this book's variant. */
function variantLines(tool) {
  if (tool.variantOf === 'concept_map') {
    return ['Variant of Problem Solver\'s concept map: the theme is the person, at the centre, as the book\'s own drawing has it; the concepts are the roles, places and contexts where a side of them shows up; the links run sideways (association or cross), with no hierarchy. The book argues for a network with no centre, yet its drawing keeps "you" in the middle: say so once, and treat the centre as a starting point. The map ends with a reflection on what is different now, described as a new direction with no ranking.'];
  }
  return [];
}

const GROUP = Object.fromEntries(SECTIONS.map((s) => [s.key, s.route ?? 'any group']));
const ids = (list) => list.join(', ');
const pairsOf = (id) => TOOLS[id]?.pairsWell ?? [];

/** The models a session's Explore can open: registered catalogue entries. */
const isModel = (id) => Boolean(catalogueEntry(id) && TOOLS[id]);

/** One line per model: id, group and tier, use it when, the book's see also and ours. */
export function catalogueLines() {
  return CATALOGUE.map((item) => {
    const tool = TOOLS[item.id];
    const links = [
      item.seeAlso.length ? `Book's see also: ${ids(item.seeAlso)}.` : '',
      pairsOf(item.id).length ? `Pairs well (ours): ${ids(pairsOf(item.id))}.` : ''
    ].filter(Boolean).join(' ');
    return `- ${item.id} (${tool.name}) [${GROUP[item.section]}, ${item.tier}]: ${tool.when}${links ? ` ${links}` : ''}`;
  }).join('\n');
}

/** The group names the catalogue lines refer to. */
export const SECTION_LINE = `Groups: ${GROUPS.map((g) => `${g.id} = ${g.label}`).join('; ')}; any group = the appendix, open to every session.`;

/** What the chart needs before it counts as done, from its config, in plain words. */
function minimumLine(tool) {
  const chart = tool.chart ?? {};
  const MET = 'the state says MINIMUM MET when it is reached.';
  if (tool.variantOf === 'concept_map') return `Minimum: you at the centre, at least three contexts and two links, then the reflection; ${MET}`;
  if (tool.family === 'list') return `Minimum: ${chart.minEntries ?? 3} entries across ${chart.minGroups ?? 2} groups, then the reflection; ${MET}`;
  if (tool.family === 'path') return `Minimum: every stage on its path; ${MET}`;
  if (tool.family === 'curve') return `Minimum: one marker on the curve, then the reflection; ${MET}`;
  if (tool.family === 'quadrant') return `Minimum: ${chart.minItems ?? 3} items in ${chart.minCells ?? 2} cells, then the reflection; ${MET}`;
  if (tool.family === 'scales') return `Minimum: every series scored with the chart's controls (${(chart.series ?? [{ label: 'Now' }]).map((s) => s.label).join(' and ')}), then the reflection; ${MET}`;
  if (tool.family === 'time_value') return `Minimum: the workday named, the star scored once with the chart's controls (time and value for every mode), then the reflection; ${MET}`;
  if (tool.family === 'attribution') return `Minimum: the table scored once with the chart's controls (the feeling now and in three years, every force in both columns), both arrows answered, then the reflection; ${MET}`;
  return `Minimum: ${MET}`;
}

/** Models whose chart needs care the generic family cannot enforce, said in plain words. */
const MODEL_NOTES = Object.freeze({
  ch_multitasking: 'A split star: the top half is TIME, each mode\'s share of the working day, 0 to 100; the bottom half is VALUE, what each mode was worth, 1 to 10. The modes are a (with people, face to face), b (in the cloud: email, messages, chat), c (alone, focused) and d (switching among the other three, and inside c). Each time is its own estimate and switching overlaps the others, so the four can add up to less or more than 100: never ask for a total of 100, and never correct one that passes it. The person sets time and value with the chart\'s controls and saves; a later save keeps the earlier profile, drawn faintly, so offer a re-score after a change. The chart flags a mode that takes a lot and is worth little (time 25 or more, value 4 or less) and one worth a lot that gets little (value 8 or more, time 15 or less): start the comparison from those. Notes take the mode as their tag.',
  ch_unhappiness: 'A table of forces, scored 1 to 5 everywhere: the feeling now and in three years, and each force\'s influence on it now and in three years. The feeling word is happy by default; the person can swap it for rich, lonely or a word of their own on the chart, and every question then uses that word. Influence, never control. The person scores with the chart\'s controls; then ask the two arrows in order, got_here (what has got them to this point) and get_there (what will get them to the later rating). They can add up to three forces of their own (force slots), which the table then asks them to score too; a note on one takes its tag own_1 to own_3, by slot number. The chart marks each force whose influence moves between the columns and says how many of every 10 influence points go to the person\'s own thoughts and actions, now and later: that share is the point of the model, so ask what it says about how much of the feeling they put down to themselves. Outside pressures (fear, the promise of growth, headlines, beauty and fitness ideals) count under the force they belong to. Name one thing within the person\'s control, and one outside it, without blame.',
  ch_climate_disaster: 'Use it for any ordinary decision under uncertainty: the feared outcome is the person\'s own. The book\'s climate argument is a dated example: never present it as current science.',
  ch_future: 'Every forecast in the book is a dated example. Ask for a prediction with a date and a reason, and a date to look at it again.',
  ch_change: 'The curve is a schematic: the regions are a rough guide, never a measured threshold, and pain is never proof that a change is worth it.',
  ch_transparency: 'The answers stay private by default. Honesty here is about the person\'s own conduct and authority; never press them to expose someone else.',
  ch_braess: 'The road network is the book\'s example. Use it as a prompt to check how people respond to a new option, never as a law about every network.',
  ch_othering: 'Examine the person\'s own judgment, never a ranking of people. Search suggestions, headlines and jokes are where a judgment came from, never a measure of a group.',
  ch_decision: 'The three-day comparison is for reversible choices only.',
  ch_anti_change: 'Membership only: now, after, or both. The overlap has no measured size.'
});

/**
 * The active model's note: a cached system block of its own, so only the model in use is sent.
 * Steps, slot meanings, the minimum, watch-fors, the exercise in our words, the entries it
 * carries and a variant's own rules.
 */
export function techniqueNote(id) {
  const tool = TOOLS[id];
  const item = catalogueEntry(id);
  if (!tool || !item) return null;
  const tier = item.tier === 'lens'
    ? 'Lens: explain the idea in two sentences, ask for the few answers it needs, and it is done.'
    : 'Worksheet: work its steps in order, one slot per answer.';
  return [
    `MODEL NOTE: ${tool.name} (${id}), group ${GROUP[item.section]}`,
    tier,
    `Use it when: ${tool.when}`,
    `Steps:\n${tool.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}`,
    `Slot meanings: ${Object.entries(tool.slots).map(([k, v]) => `${k} = ${v}${tool.nodeTags?.[k] ? ` (tag: ${tool.nodeTags[k].join('|')})` : ''}`).join('; ')}`,
    `Link kinds: ${tool.edgeKinds.join(', ') || 'none'}`,
    minimumLine(tool),
    ...(MODEL_NOTES[id] ? [MODEL_NOTES[id]] : []),
    `Watch for: ${tool.failureModes.join(' ')}`,
    ...variantLines(tool),
    ...(item.merged.length ? [`Also carries: ${item.merged.map((m) => MERGED_NAMES[m] ?? m).join(', ')} (already folded into its steps and watch-fors).`] : []),
    'Remember stage three: one concrete example, the evidence kept apart from the interpretation, and one assumption that could turn out wrong.',
    ...(tool.exercise ? [`Exercise (offer once, when the minimum is met, as a small step with a review date): ${tool.exercise}`] : [])
  ].join('\n');
}

/** Follow-ups for "another angle": the book's see also first, then ours, Change Book models only. */
export function anotherAngle(id, done = []) {
  const item = catalogueEntry(id);
  if (!item) return { book: [], ours: [] };
  const skip = new Set([id, ...done]);
  const book = item.seeAlso.filter((other) => isModel(other) && !skip.has(other));
  const ours = pairsOf(id).filter((other) => isModel(other) && !skip.has(other) && !book.includes(other));
  return { book, ours };
}
