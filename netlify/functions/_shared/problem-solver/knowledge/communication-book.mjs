// netlify/functions/_shared/problem-solver/knowledge/communication-book.mjs
// The Communication Book coach's knowledge, in our own words (the repo is public: no book
// sentences). The catalogue lines and the per-model notes are built from the tools themselves, so
// a model's "use it when", steps and watch-fors are written once, in
// packages/communication-book/tools/.
import { CATALOGUE, SECTIONS, entry as catalogueEntry } from '../../../../../packages/communication-book/catalogue.mjs';
import { GROUPS } from '../../../../../packages/communication-book/route.mjs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';

export const STANCE = `THE BOOK'S STANCE
The Communication Book is a catalogue of separate ideas about conversations at work, with oneself, in close relationships and in the messages around us. It is a shelf to choose from, with no programme to work through. Start from one real exchange, offer one model that fits it, say plainly where it may fit only partly, and let the person reject it. A model earns its place while it helps the next conversation go better; when it stops helping, set it down.`;

/** The four stages that run through every session, whichever model is in play. */
export const COMM_CHECKS = `THE FOUR STAGES (run them in every session, in a few words each time)
- Name the exchange. Who is involved, what was said or needs saying, and what would a better exchange be? Is the person preparing, repairing, listening or making sense of a message? Ask about their own part before reading anyone else's motives.
- Choose one lens and say why it fits. Keep the book's distinctions: what was said is not what was heard; a request leaves the other person free to say no; an apology never obliges anyone to forgive.
- Work one real example, with the model's own categories. Keep what was said or seen apart from guesses about it, and draft any question or reply in the person's own words.
- Commit to the next conversation and come back to it: who takes it, the first words and a date. Say the reply aloud once if it helps, and check how it might be heard. On review, ask how it landed for the other person, not only how it felt to say.
The book's theories come from different decades and fields; attribute them to the book and never present them as settled modern evidence. Its anecdotes and dated figures are examples, never facts or advice about health.`;

export const GROUP_GUIDE = `THE GROUPS
The book's five sections fall into three kinds of communication situation:
${GROUPS.map((g) => `- ${g.id}: ${g.label}`).join('\n')}
Place the exchange from the person's answer to "is this mostly about preparing what to say, a relationship, or making sense of a message?". Record one id in frame.group, or two joined with "+" when it truly sits at both (prepare+relate). Use only these ids. Persuading, presenting, meetings, feedback, negotiating and leading are prepare; listening, apologising, accusations, closeness, misunderstandings with someone close and talk with oneself are relate; a message, an email, a claim, a medium, a frame, a reading of something said, and how an exchange will be remembered are read.`;

/**
 * The kinds of communication difficulty Select names, each with the groups and models to look at
 * first, after the book's natural groupings. The models are a starting point, never the only one.
 */
export const LENSES = Object.freeze([
  Object.freeze({ id: 'persuading', name: 'getting someone to agree or act', groups: ['prepare'], look: ['cm_persuasion', 'cm_salami', 'cm_social_judgement', 'cm_negotiation', 'cm_rhetoric'] }),
  Object.freeze({ id: 'presenting', name: 'saying something clearly to a group', groups: ['prepare', 'read'], look: ['cm_storytelling', 'cm_rhetoric', 'cm_six_words', 'cm_meetings', 'cm_cooperative'] }),
  Object.freeze({ id: 'leading', name: 'feedback, leading and group agreement', groups: ['prepare'], look: ['cm_feedback', 'cm_boss_talk', 'cm_groupthink', 'cm_meetings', 'cm_intercultural'] }),
  Object.freeze({ id: 'misheard', name: 'a gap between what was said and what was heard', groups: ['relate', 'read'], look: ['cm_four_layers', 'cm_iceberg', 'cm_speech_act', 'cm_decoding', 'cm_second_order', 'cm_cooperative'] }),
  Object.freeze({ id: 'repair', name: 'blame, conflict or repair', groups: ['relate'], look: ['cm_nonviolent', 'cm_apology', 'cm_transactional', 'cm_game_theory', 'cm_expectancy', 'cm_peak_end'] }),
  Object.freeze({ id: 'closeness', name: 'listening and getting closer', groups: ['relate'], look: ['cm_listening', 'cm_proust', 'cm_expectancy', 'cm_intercultural', 'cm_staircase', 'cm_self_talk'] }),
  Object.freeze({ id: 'messages', name: 'judging a message, a claim or a medium', groups: ['read'], look: ['cm_lasswell', 'cm_framing', 'cm_sophism', 'cm_medium', 'cm_uses', 'cm_standpoint', 'cm_decoding'] })
]);

export const LENS_GUIDE = `KINDS OF DIFFICULTY (name one in a few words when you select a model)
${LENSES.map((o) => `- ${o.name} (groups ${o.groups.join(', ')}): look first at ${o.look.join(', ')}`).join('\n')}
Offer one model and one limit: a plausible way the model could mislead here, or a neighbouring model that pulls the other way.`;

export const COMM_TRAPS = `TRAPS (challenge these too, naming the skill)
- reading the other person's motives before the person has looked at their own part (metacognition)
- a guess about what someone meant placed on the chart as if it were said (critical_thinking)
- a theory or story from the book treated as settled evidence (critical_thinking)
- predicting how someone talks from their nationality, gender or role instead of asking them (critical_thinking)
- a perfect script for a reply nobody can control (logical_reasoning)
- an apology or a closing line expected to settle a harm the other person has not settled (logical_reasoning)
- fitting the exchange to a favourite model instead of choosing the model for the exchange (metacognition)
- a next conversation with no one to take it, no first words, or no date to come back to it (decision_making)
- quoting the book or a named thinker; paraphrase the idea instead`;

/** Entries folded into another, by the names they go by. */
const MERGED_NAMES = Object.freeze({
  cm_silence: 'The Spiral of Silence',
  cm_cultivation: 'The Cultivation Theory',
  cm_small_talk: 'Small Talk',
  cm_white_lies: 'White Lies',
  cm_watzlawick: 'Watzlawick’s Axiom Theory',
  cm_euphemisms: 'Euphemisms',
  cm_fomo: 'The FoMO Phenomenon'
});

/** What a reused tool does differently as this book's variant. */
function variantLines(tool) {
  if (tool.variantOf === 'perspective_shift') {
    return ['Variant of Problem Solver\'s perspective shift: it does not list stakeholders and their needs. It watches how each person is looking (the second-order observer watching the first-order one), names the blind spot neither can see from where they stand, and ends on a description both could recognise. The original perspective shift is there if the person wants every affected party mapped.'];
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
  if (tool.family === 'path' && chart.variant === 'flow') return `Minimum: one route through the checks to an end, then the reflection; ${MET}`;
  if (tool.family === 'path') return `Minimum: every stage on its path${chart.loop ? ' (one full round)' : ''}, then the reflection; ${MET}`;
  if (tool.family === 'quadrant') return `Minimum: ${chart.minItems ?? 3} items in ${chart.minCells ?? 2} cells, then the reflection; ${MET}`;
  return `Minimum: ${MET}`;
}

/** Models whose chart or subject needs care the generic family cannot enforce, said in plain words. */
const MODEL_NOTES = Object.freeze({
  cm_apology: 'The Sorry Matrix keeps the book\'s own labels in their printed places: forgiving without forgetting is "resentful" (top left), forgetting without forgiving is "dysfunctional" (bottom right). Say they are the book\'s labels if they surprise the person; never swap them. Forgiveness stays the other person\'s choice: the person can work on the apology and the repair, never on the outcome.',
  cm_intercultural: 'An individual-preference lens: use the three styles to ask what this person prefers, never to predict anyone from their nationality. Most people and places mix the styles, as the book itself says.',
  cm_boss_talk: 'The four cells carry the book\'s tongue-in-cheek labels for preaching water and drinking wine (asking for one thing, doing another). Place behaviours and standards, never the people on the team, and never use the labels as names for anyone.',
  cm_feedback: 'The book\'s axes are tone (negative to positive, left to right) and effect (destructive to constructive, upwards). They are not Decision Maker\'s feedback box or Problem Solver\'s feedback matrix; keep them apart.',
  cm_game_theory: 'The book\'s example is a shared agreement about gifts: there are no confessions, sentences or numeric payoffs, so it is not the prisoner\'s dilemma. Keep it to what each person expects of the other.',
  cm_persuasion: 'Keep to the book\'s six principles; do not add the later seventh. Use them to check the honesty of the person\'s own case, never as tactics on someone.',
  cm_self_talk: 'A reflection on how the person talks to themselves, never therapy. If the inner voice sounds persistently crushing or the person mentions harming themselves, say plainly that a doctor or other professional is the right help.',
  cm_expectancy: 'The distance bands are the book\'s rough guide for one culture, not rules. Ask what the other person expects instead of assuming it.',
  cm_transactional: 'Parent, adult and child are states anyone moves between in a moment, never labels for whole personalities.',
  cm_peak_end: 'A lens for how an exchange will be remembered, never a way to make a harm smaller with a good ending.',
  cm_proust: 'The three checks are the book\'s rule of thumb for open questions; a question that fails one can be reworked rather than dropped.',
  cm_groupthink: 'It also carries the Spiral of Silence (people hold back views they expect to be alone with) and the Cultivation Theory (a view repeated often enough feels like the whole picture).',
  cm_four_layers: 'It also carries Watzlawick\'s axioms: silence still says something, and a repeating exchange is kept going by both sides\' responses.',
  cm_lasswell: 'This reads how a message travels; it never settles whether a claim is true.'
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
    'Remember stage three: one real exchange, what was said kept apart from guesses, and the person\'s own part checked first.',
    ...(tool.exercise ? [`Exercise (offer once, when the minimum is met, as a small next step with a date): ${tool.exercise}`] : [])
  ].join('\n');
}

/** Follow-ups for "another angle": the book's see also first, then ours, Communication Book models only. */
export function anotherAngle(id, done = []) {
  const item = catalogueEntry(id);
  if (!item) return { book: [], ours: [] };
  const skip = new Set([id, ...done]);
  const book = item.seeAlso.filter((other) => isModel(other) && !skip.has(other));
  const ours = pairsOf(id).filter((other) => isModel(other) && !skip.has(other) && !book.includes(other));
  return { book, ours };
}
