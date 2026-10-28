// netlify/functions/_shared/problem-solver/knowledge/collaboration-book.mjs
// The Collaboration Book coach's knowledge, in our own words (the repo is public: no book
// sentences). The catalogue lines and the per-model notes are built from the tools themselves, so
// a model's "use it when", steps and watch-fors are written once, in
// packages/collaboration-book/tools/.
import { CATALOGUE, SECTIONS, entry as catalogueEntry } from '../../../../../packages/collaboration-book/catalogue.mjs';
import { GROUPS } from '../../../../../packages/collaboration-book/route.mjs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';

export const STANCE = `THE BOOK'S STANCE
The Collaboration Book is a catalogue of separate models for how people work together: solving problems, reaching goals and building trust. It is a shelf to choose from, with no programme to work through. Start from one concrete team situation, offer one model that fits it, say plainly where it may fit only partly, and let the person or the team reject it. A model earns its place while it helps people work together better; when it stops helping, set it down.`;

/** The four stages that run through every session, whichever model is in play. */
export const COLLAB_CHECKS = `THE FOUR STAGES (run them in every session, in a few words each time)
- Locate the difficulty. What happened, who was involved and what result would help? Is the need mostly a problem, a goal or trust? Ask about the person's own part before diagnosing anyone else.
- Choose one lens and say why it fits. Keep the book's distinctions: safety against performance is not accountability against safety; the trust triangle needs all three corners at once; consent is not everyone agreeing.
- Work the structure together, with the model's own stages or groups. Give quieter people a way to contribute on their own first. For a group decision, name who moderates, how it will be decided and what is in scope before collecting views.
- Agree an experiment and come back to it: an owner, a next action and a date. A premortem suits a consequential experiment beforehand; a postmortem suits afterwards. When reviewing, ask whether the conditions changed, not only whether the conversation went better.
Dated figures, anecdotes and stories in the book are examples. Never present them as established facts or as advice about safety or health.`;

export const GROUP_GUIDE = `THE GROUPS
The book's three parts are three kinds of team need:
${GROUPS.map((g) => `- ${g.id}: ${g.label}`).join('\n')}
Place the situation from the person's answer to "is this mostly a problem, a goal or trust?". Record one id in frame.group, or two joined with "+" when it truly sits at both (problems+trust). Use only these ids. How a team is sized, organised, decides, gives feedback or recovers is problems; a goal, a plan, a purpose, a metric, a meeting or a request for time is goals; culture, respect, safety, leadership behaviour, inclusion and reading the room are trust.`;

/**
 * The kinds of team difficulty Select names, each with the groups and models to look at first,
 * after the book's natural groupings. The models are a starting point, never the only choice.
 */
export const LENSES = Object.freeze([
  Object.freeze({ id: 'how_organised', name: 'how the team is sized, organised or led', groups: ['problems', 'trust'], look: ['cb_agility', 'cb_two_pizza', 'cb_hybrid', 'cb_run_change', 'cb_tuckman', 'cb_sociocracy'] }),
  Object.freeze({ id: 'how_decided', name: 'how a group decides', groups: ['goals', 'problems'], look: ['cb_consent', 'cb_integrative', 'cb_workshops', 'cb_red_blue', 'cb_premortem'] }),
  Object.freeze({ id: 'what_for', name: 'what the team is working towards', groups: ['goals'], look: ['cb_purpose', 'cb_north_star', 'cb_small_wins', 'cb_cooperation', 'cb_saying_no', 'cb_reorg', 'cb_postmortem'] }),
  Object.freeze({ id: 'speaking_up', name: 'feedback, conflict and speaking up', groups: ['problems', 'trust'], look: ['cb_psych_safety', 'cb_radical_candor', 'cb_ladder', 'cb_bad_apple', 'cb_trust_triangle', 'cb_nunchi'] }),
  Object.freeze({ id: 'trust_and_culture', name: 'trust, culture and how people are treated', groups: ['trust'], look: ['cb_trust_triangle', 'cb_team_culture', 'cb_vulnerability', 'cb_sutton_boss', 'cb_diversity', 'cb_performance_trust', 'cb_servant', 'cb_corporate_culture'] }),
  Object.freeze({ id: 'load_and_reward', name: 'workload, pay and recovery', groups: ['problems', 'trust'], look: ['cb_burnout', 'cb_four_in_one', 'cb_new_pay', 'cb_corporate_culture', 'cb_reciprocity'] })
]);

export const LENS_GUIDE = `KINDS OF DIFFICULTY (name one in a few words when you select a model)
${LENSES.map((o) => `- ${o.name} (groups ${o.groups.join(', ')}): look first at ${o.look.join(', ')}`).join('\n')}
Offer one model and one limit: a plausible way the model could mislead here, or a neighbouring model that pulls the other way.`;

export const COLLAB_TRAPS = `TRAPS (challenge these too, naming the skill)
- diagnosing other people before the person has looked at their own part (metacognition)
- an assumption about someone's motives placed on the chart as if it were seen (critical_thinking)
- a story or figure from the book treated as established fact (critical_thinking)
- expecting a better conversation to fix a problem that the conditions keep creating (logical_reasoning)
- hearing only the loudest voices, or treating silence as agreement (critical_thinking)
- fitting the situation to a favourite model instead of choosing the model for the situation (metacognition)
- stacking several models instead of trying one and seeing what happens (metacognition)
- an experiment with no owner, too big to start, or with no date to come back to it (decision_making)
- quoting the book or a named thinker; paraphrase the idea instead`;

/** Entries folded into another, by the names they go by. */
const MERGED_NAMES = Object.freeze({
  cb_flat: 'Flat Hierarchies',
  cb_positive_intent: 'Assume Positive Intent',
  cb_two_workers: 'Two Workers, Two Levels',
  cb_saying_yes: 'Saying Yes'
});

/** What a reused tool does differently as this book's variant. */
function variantLines(tool) {
  if (tool.variantOf === 'after_action_review') {
    return ['Variant of Problem Solver\'s after action review: four plain questions once the work is done (what happened, why, the lessons, the changes for next time), with a firm rule that nobody is blamed. It does not set the intended result against the actual one; the original review does that, if the person wants it.'];
  }
  if (tool.variantOf === 'dm_maslow') {
    return ['Variant of Decision Maker\'s Maslow pyramids: the book\'s drawing is a parody, with perks stacked on top. Here the base is the working conditions (pay, workload, safety, respect) and the top is the perks. It is a structural point, never a ranking of human needs: the base comes first, and useful support is still welcome.'];
  }
  return [];
}

const GROUP = Object.fromEntries(SECTIONS.map((s) => [s.key, s.route]));
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
export const SECTION_LINE = `Groups: ${GROUPS.map((g) => `${g.id} = ${g.label}`).join('; ')}.`;

/** What the chart needs before it counts as done, from its config, in plain words. */
function minimumLine(tool) {
  const chart = tool.chart ?? {};
  const MET = 'the state says MINIMUM MET when it is reached.';
  if (tool.family === 'list') return `Minimum: ${chart.minEntries ?? 3} entries across ${chart.minGroups ?? 2} groups, then the reflection; ${MET}`;
  if (tool.family === 'path') return `Minimum: every stage on its path${chart.loop ? ' (one full round)' : ''}, then the reflection; ${MET}`;
  if (tool.family === 'quadrant') return `Minimum: ${chart.minItems ?? 3} items in ${chart.minCells ?? 2} cells, then the reflection; ${MET}`;
  if (tool.family === 'scales') return `Minimum: every series scored with the chart's controls (${(chart.series ?? [{ label: 'Now' }]).map((s) => s.label).join(' and ')}), then the reflection; ${MET}`;
  if (tool.family === 'tension') return `Minimum: forces on both sides, then the reflection; ${MET}`;
  return `Minimum: ${MET}`;
}

/** Models whose chart or subject needs care the generic family cannot enforce, said in plain words. */
const MODEL_NOTES = Object.freeze({
  cb_psych_safety: 'The book\'s axes are performance (left to right) and how safe people feel (upwards). Keep them: never swap in the better-known accountability against safety version. Place moments or settings, never people.',
  cb_burnout: 'A reflection on workload and play, never a clinical assessment. If the person describes exhaustion that sounds serious, say plainly that a doctor or other professional is the right help, and keep the session on what the work itself could change.',
  cb_four_in_one: 'The equal-quarter split is the book\'s proposal for how a society could share time, not a target for one person. Score the person\'s own day as Now and the split they would want; the four shares add to 100.',
  cb_trust_triangle: 'All three corners are needed at once; it is never a pick-two trade-off. Place what the other person sees, and check the reading with them rather than diagnosing them.',
  cb_cooperation: 'The four situations are rows, not a 2×2: the book\'s picture does not settle which cell is which, so do not draw or describe one.',
  cb_north_star: 'Who first came up with the idea is not settled; do not credit anyone as its inventor.',
  cb_two_pizza: 'The pizza is a rule of thumb about size, never a headcount to enforce.',
  cb_new_pay: 'Discuss how pay is decided, never anyone\'s actual salary. The book\'s examples are illustrations, not a recommendation.',
  cb_performance_trust: 'The book\'s story is an anecdote, not tested hiring science. Separate evidence for performance from evidence for trust, and never use similarity to the person as a trust score.',
  cb_ladder: 'Keep the book\'s rungs as they are. The generous reading (folded in from Assume Positive Intent) sits at the interpretation rung, and it never excuses behaviour that needs a boundary.',
  cb_consent: 'Name the decision rule before the discussion. Consent asks whether there is a reasoned objection (harm, or a blocked goal), not whether everyone is enthusiastic.',
  cb_integrative: 'One round at a time, with someone keeping the rounds. Clarifying questions are not objections, and objections are taken one at a time.',
  cb_saying_no: 'It also carries Saying Yes: a bounded yes to a possibility worth trying, as an experiment, is as valid an answer as a clear no.',
  cb_purpose: 'It also carries Two Workers, Two Levels: two people can see the same task as a job or as part of something larger; keep both views in the room rather than ranking them.'
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
    'Remember stage three: one concrete example, the person\'s own part checked first, and whose view is still missing.',
    ...(tool.exercise ? [`Exercise (offer once, when the minimum is met, as a small experiment with a date): ${tool.exercise}`] : [])
  ].join('\n');
}

/** Follow-ups for "another angle": the book's see also first, then ours, Collaboration Book models only. */
export function anotherAngle(id, done = []) {
  const item = catalogueEntry(id);
  if (!item) return { book: [], ours: [] };
  const skip = new Set([id, ...done]);
  const book = item.seeAlso.filter((other) => isModel(other) && !skip.has(other));
  const ours = pairsOf(id).filter((other) => isModel(other) && !skip.has(other) && !book.includes(other));
  return { book, ours };
}
