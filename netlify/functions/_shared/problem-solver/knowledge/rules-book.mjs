// netlify/functions/_shared/problem-solver/knowledge/rules-book.mjs
// The Rules Book coach's knowledge, in our own words (the repo is public: no book sentences).
// The catalogue lines and the per-rule notes are built from the tools themselves, so a rule's
// "use it when", steps and watch-fors are written once, in packages/rules-book/tools/.
import { CATALOGUE, SECTIONS, entry as catalogueEntry } from '../../../../../packages/rules-book/catalogue.mjs';
import { GROUPS } from '../../../../../packages/rules-book/route.mjs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';

export const STANCE = `THE BOOK'S STANCE
The Rules Book collects rules of thumb: lenses that sometimes show something useful, never laws of nature. Offer one rule that fits the situation, say plainly where it may not fit, and let the person test it with a small experiment. A rule is worth keeping only while it is true to what was observed and useful for the purpose; when it stops being either, drop it. Never present a rule as proven, and never use one to win an argument.`;

/** The model check that runs through every session, whichever rule is in play. */
export const MODEL_CHECKS = `THE MODEL CHECK (run it in every session, in a few words each time)
- Truth check: separate what the person observed from what they inferred. A distressing reading can feel like a fact. Name the observed part, name the interpreted part, and take the feeling seriously without treating the story as settled.
- Usefulness and limits check: every rule is a simplification. Ask whether it is still useful for this purpose and what would make the person drop it here. A flawed rule can still be useful; a tidy one can still mislead. Also ask whether a favourite method is being applied only because it is at hand.
Use them at Ground (observation versus interpretation), when offering the rule (its limit or a counter-lens), at Act (an observation that could overturn the reading) and at Review (did the reading hold, is the rule still useful).`;

export const GROUP_GUIDE = `THE GROUPS
The book's four parts are four places a situation can sit:
${GROUPS.map((g) => `- ${g.id}: ${g.label}`).join('\n')}
Place the situation from the person's answer to "which part of life is this in?". Record one id in frame.group, or two joined with "+" when it truly sits at both (workplace+people). Use only these ids. Time, deadlines, meetings, teams and commitments are workplace; a change, an idea or a new way of doing things is change; yourself, a manager, a colleague or a misunderstanding is people; a bigger choice, your sense of self or a way of explaining things is life.`;

/**
 * The situations Ground names, each with the groups and rules to look at first. The rules are a
 * starting point, not the only choice.
 */
export const SITUATIONS = Object.freeze([
  Object.freeze({ id: 'slipping_time', name: 'work that keeps slipping', groups: ['workplace'], look: ['rb_parkinson', 'rb_hofstadter', 'rb_three_three_three', 'rb_pareto'] }),
  Object.freeze({ id: 'crowded_commitments', name: 'a crowded calendar or a tempting yes', groups: ['workplace'], look: ['rb_plotz', 'rb_triviality', 'rb_brooks', 'rb_murphy'] }),
  Object.freeze({ id: 'measure_or_value', name: 'numbers or effort that miss the point', groups: ['workplace'], look: ['rb_goodhart', 'rb_locksmith', 'rb_ketchup'] }),
  Object.freeze({ id: 'proposed_change', name: 'a change, an idea or a new way of working', groups: ['change'], look: ['rb_chesterton', 'rb_unintended', 'rb_kiss', 'rb_amara', 'rb_maya', 'rb_ikea', 'rb_strummer'] }),
  Object.freeze({ id: 'people_friction', name: 'a misunderstanding or a difficult manager', groups: ['people'], look: ['rb_wiio', 'rb_jaspers', 'rb_peter', 'rb_one_step'] }),
  Object.freeze({ id: 'fit_and_growth', name: 'how much challenge or comfort is right', groups: ['people'], look: ['rb_comfort', 'rb_region_beta', 'rb_goldilocks', 'rb_big_fish'] }),
  Object.freeze({ id: 'bigger_choice', name: 'a bigger choice or a story that has set hard', groups: ['life'], look: ['rb_ten_ten_ten', 'rb_korzybski', 'rb_occam', 'rb_morrison'] })
]);

export const SITUATION_GUIDE = `SITUATIONS (name one in a few words when you select a rule)
${SITUATIONS.map((o) => `- ${o.name} (groups ${o.groups.join(', ')}): look first at ${o.look.join(', ')}`).join('\n')}
Offer one rule and one limit: a plausible way the rule could mislead here, or a neighbouring rule that pulls the other way.`;

export const RULES_TRAPS = `TRAPS (challenge these too, naming the skill)
- presenting a rule as a law, or using it to end a discussion (critical_thinking)
- an interpretation placed on the chart as if it were an observation (critical_thinking)
- fitting the situation to a favourite rule instead of choosing the rule for the situation (metacognition)
- stacking several rules instead of trying one and seeing what happens (metacognition)
- an experiment too big or too vague to start today, or with no check time (decision_making)
- blaming a person rather than looking at how the situation is set up (logical_reasoning)
- expecting the app to run a timer, a reminder or a habit for you (critical_thinking)
- quoting the book or a named thinker; paraphrase the idea instead, and never present an unverified attribution as history`;

/** Entries folded into another, by the names they go by. */
const MERGED_NAMES = Object.freeze({
  rb_canada: 'The Canada Principle',
  rb_agnes_allen: 'Agnes Allen’s Law',
  rb_clothes_chair: 'The Clothes-Chair Principle',
  rb_three_minutes: 'Less Than Three Minutes',
  rb_lindy: 'Lindy’s Law',
  rb_sutton: 'Sutton’s Law',
  rb_write_it_down: 'Write It Down',
  rb_two_sides: 'The Law of Two Sides',
  rb_gall: 'Gall’s Law',
  rb_brach: 'Brach’s Law',
  rb_box: 'Box’s Law',
  rb_instrument: 'The Law of the Instrument'
});

/** What a reused tool does differently as this book's variant. */
function variantLines(tool) {
  if (tool.variantOf === 'pareto') {
    return ['Variant of Problem Solver\'s Pareto analysis: the figures and ranking are the same, but eighty/twenty is a guide and the split will often differ. The last stretch of finishing can cost out of proportion, so ask where adequate is good enough, and keep genuinely essential finishing work. The reflection covers results at work, friendships and sources of stress. The chart ends with a reflection, not a chosen option; Act takes over.'];
  }
  if (tool.variantOf === 'dm_conflict') {
    return ['Variant of the Decision Book\'s conflict model: instead of six responses, one narrow move. Each side offers a small step toward the other, and the two steps have to open a shared possibility (the joint contribution), which needs an entry of its own before the chart is done. Never put words in the other side\'s mouth: their step is what they might offer.'];
  }
  return [];
}

const GROUP = Object.fromEntries(SECTIONS.map((s) => [s.key, s.route]));
const ids = (list) => list.join(', ');
const pairsOf = (id) => TOOLS[id]?.pairsWell ?? [];

/** The rules a session's Explore can open: registered catalogue entries. */
const isRule = (id) => Boolean(catalogueEntry(id) && TOOLS[id]);

/** One line per rule: id, group and tier, use it when, the book's see also and ours. */
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
  if (tool.variantOf === 'pareto') return `Minimum: a target, at least three items with a figure each, then the reflection; ${MET}`;
  if (tool.family === 'list') return `Minimum: ${chart.minEntries ?? 3} entries across ${chart.minGroups ?? 2} groups, then the reflection; ${MET}`;
  if (tool.family === 'path') return `Minimum: every stage on its path; ${MET}`;
  if (tool.family === 'curve') return `Minimum: one marker on the curve, then the reflection; ${MET}`;
  if (tool.family === 'plot') return `Minimum: ${chart.minPoints ?? 1} point placed, then the reflection; ${MET}`;
  if (tool.family === 'tension') return `Minimum: the sides filled and the gap named, then the reflection; ${MET}`;
  if (tool.family === 'quadrant') return `Minimum: ${chart.minItems ?? 3} items in ${chart.minCells ?? 2} cells, then the reflection; ${MET}`;
  return `Minimum: ${MET}`;
}

/** Rules whose chart needs counts the generic list cannot enforce, said in plain words. */
const RULE_COUNTS = Object.freeze({
  rb_three_three_three: 'Counts: exactly one project in the three-hour group and exactly three items in each of the two supporting groups. The three hours are an intention the person holds, never a timer the app runs. Tasks under three minutes are done when they turn up; the maintenance list holds the longer ones. If the person offers a second project or a fourth item, challenge it and keep the count.',
  rb_parkinson: 'Counts: three finished versions, two intermediate and one final, each a complete usable version, never a draft in pieces. Do not turn the effort profile into a prescribed duration.',
  rb_ten_ten_ten: 'Counts: exactly three horizons, ten minutes, ten months and ten years. Do not swap in ten days or ten weeks.',
  rb_jaspers: 'Attribution: the name is the conventional title and the attribution to the named philosopher is unverified. Paraphrase the idea; never quote or credit it as established. The gap on the chart is qualitative: do not read the circle sizes as measured capacity.',
  rb_region_beta: 'The chart is qualitative: the band and the 1 to 10 controls are display conveniences, not scores or cut-offs.',
  rb_maya: 'The chart is qualitative: the band and the 1 to 10 controls are display conveniences, not scores or cut-offs.',
  rb_ketchup: 'The curve is a schematic of a delayed surge, not a time estimate.',
  rb_triviality: 'The curve is a schematic of how attention drifts, not a quantitative law.',
  rb_peter: 'Compare roles and skills for the new job. Do not label a person incompetent, and do not read the illustration as a measured scale.',
  rb_amara: 'Ask for an evidence checkpoint: expectation is not proof, and neither is waiting.',
  rb_korzybski: 'The truth check and the usefulness check are this rule\'s core: observed versus interpreted, then whether the model is still useful and what would make the person drop it.'
});

/**
 * The active rule's note: a cached system block of its own, so only the rule in use is sent.
 * Steps, slot meanings, the minimum, watch-fors, the exercise in our words, the entries it
 * carries and a variant's own rules.
 */
export function techniqueNote(id) {
  const tool = TOOLS[id];
  const item = catalogueEntry(id);
  if (!tool || !item) return null;
  const tier = item.tier === 'lens'
    ? 'Lens: explain the idea in two sentences, ask for the one marker or answer it needs, and it is done.'
    : 'Worksheet: work its steps in order, one slot per answer.';
  return [
    `RULE NOTE: ${tool.name} (${id}), group ${GROUP[item.section]}`,
    tier,
    `Use it when: ${tool.when}`,
    `Steps:\n${tool.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}`,
    `Slot meanings: ${Object.entries(tool.slots).map(([k, v]) => `${k} = ${v}${tool.nodeTags?.[k] ? ` (tag: ${tool.nodeTags[k].join('|')})` : ''}`).join('; ')}`,
    `Link kinds: ${tool.edgeKinds.join(', ') || 'none'}`,
    minimumLine(tool),
    ...(RULE_COUNTS[id] ? [RULE_COUNTS[id]] : []),
    `Watch for: ${tool.failureModes.join(' ')}`,
    ...variantLines(tool),
    ...(item.merged.length ? [`Also carries: ${item.merged.map((m) => MERGED_NAMES[m] ?? m).join(', ')} (already folded into its steps and watch-fors).`] : []),
    'Remember the model check: keep what was observed apart from what was inferred, and name what would make the person drop this rule here.',
    ...(tool.exercise ? [`Exercise (offer once, when the minimum is met, as an experiment with a check time, never a timer): ${tool.exercise}`] : [])
  ].join('\n');
}

/** Follow-ups for "another angle": the book's see also first, then ours, Rules Book rules only. */
export function anotherAngle(id, done = []) {
  const item = catalogueEntry(id);
  if (!item) return { book: [], ours: [] };
  const skip = new Set([id, ...done]);
  const book = item.seeAlso.filter((other) => isRule(other) && !skip.has(other));
  const ours = pairsOf(id).filter((other) => isRule(other) && !skip.has(other) && !book.includes(other));
  return { book, ours };
}
