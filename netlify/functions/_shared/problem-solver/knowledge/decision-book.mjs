// netlify/functions/_shared/problem-solver/knowledge/decision-book.mjs
// Decision Maker's coach knowledge, in our own words (the repo is public: no book sentences).
// The catalogue lines and the per-model notes are built from the tools themselves, so a model's
// "use it when", steps and watch-fors are written once, in packages/decision-book/models/.
import { CATALOGUE, SECTIONS } from '../../../../../packages/decision-book/catalogue.mjs';
import { COMPASS } from '../../../../../packages/decision-book/compass.mjs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';

export const STANCE = `THE BOOK'S STANCE
The Decision Book's models simplify on purpose. A model does not hand over an answer: it asks a sharper question, and the answer comes from the person working it with their own facts. When someone wants the model to decide for them, say so kindly and ask the model's next question. A model that does not fit is put down, never forced.`;

export const COMPASS_GUIDE = `THE SECTION COMPASS
The book's four sections form a 2×2: who the question is about (yourself or others) against what the person wants (to understand or to improve).
${COMPASS.map((q) => `- ${q.id}: ${q.label} (section ${q.section})`).join('\n')}
Place the question from the person's answer to "who is it about, and what do you want?". Record one id in frame.compass, or two joined with "+" when the question truly spans both (self_improve+others_improve). Use only these ids. Most decisions about your own next move are self_improve; wanting to see why you keep choosing the same way is self_understand.`;

export const DECISION_TRAPS = `DECISION TRAPS (challenge these too, naming the skill)
- deciding before the options are on the table (decision_making)
- a single option dressed up as a choice: "should I do X" with no real alternative, not even "not now" (decision_making)
- criteria nobody could check afterwards (critical_thinking)
- the sunk-cost pull: keeping on because of what is already spent (metacognition)
- status-quo bias: treating "stay as I am" as free of cost (critical_thinking)
- overconfidence: certainty beyond the evidence (metacognition)
- letting the most vivid example or the first number heard set the answer (critical_thinking)
- blaming a person rather than looking at the situation (logical_reasoning)
- a "decision" with no first step and nothing that would make you rethink (decision_making)`;

/**
 * Companion passes the spec gives two reused Problem Solver tools. They live in the per-model
 * note, not in new slots: answers go into the tool's own slots.
 */
export const COMPANIONS = Object.freeze({
  morphological: 'SCAMPER companion: once the box has a promising combination, run one SCAMPER pass over it, one prompt per message: substitute, combine, adapt, modify (bigger or smaller), put to another use, eliminate, reverse or rearrange. An idea that holds up goes into the box as a new attribute in its open slot.',
  double_loop: 'Espoused theory and theory in use: when naming a governing assumption, ask what the person says guides them, then what their actual behaviour shows guides them. The gap between the two is often the assumption to name. Both go in the governing slots, not new ones.'
});

const familyWord = (family) => (family === 'oneoff' ? 'own chart' : family === 'table' ? 'Problem Solver chart' : `${family} chart`);
const ids = (list) => list.join(', ');

/** Our pairs-well links: a Decision Maker model's own list; a reused tool has none. */
const pairsOf = (id) => TOOLS[id]?.pairsWell ?? [];

/** One line per catalogue model: id, where it sits, use it when, the book's see also and ours. */
export function catalogueLines() {
  return CATALOGUE.map((entry) => {
    const tool = TOOLS[entry.id];
    const links = [
      entry.seeAlso.length ? `Book's see also: ${ids(entry.seeAlso)}.` : '',
      pairsOf(entry.id).length ? `Pairs well (ours): ${ids(pairsOf(entry.id))}.` : ''
    ].filter(Boolean).join(' ');
    return `- ${entry.id} (${tool.name}) [s${entry.section} ${entry.tier}]: ${tool.when}${links ? ` ${links}` : ''}`;
  }).join('\n');
}

/** The section headings the catalogue lines refer to. */
export const SECTION_LINE = `Sections: ${SECTIONS.map((s) => `s${s.id} ${s.title}`).join('; ')}.`;

/**
 * The active model's note: a cached system block of its own, so only the model in use is sent.
 * Steps, slot meanings, watch-fors, the book's exercise in our words, and any companion pass.
 */
export function modelNote(id) {
  const tool = TOOLS[id];
  const entry = CATALOGUE.find((item) => item.id === id);
  if (!tool || !entry) return null;
  const tier = entry.tier === 'lens'
    ? 'Lens: explain the idea in two sentences, ask for the one marker or answer it needs, and it is done.'
    : 'Worksheet: work its steps in order, one slot per answer.';
  return [
    `MODEL NOTE: ${tool.name} (${id}), section ${entry.section}, ${familyWord(entry.family)}`,
    tier,
    `Use it when: ${tool.when}`,
    `Steps:\n${tool.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}`,
    `Slot meanings: ${Object.entries(tool.slots).map(([k, v]) => `${k} = ${v}${tool.nodeTags?.[k] ? ` (tag: ${tool.nodeTags[k].join('|')})` : ''}`).join('; ')}`,
    `Link kinds: ${tool.edgeKinds.join(', ') || 'none'}`,
    `Watch for: ${tool.failureModes.join(' ')}`,
    ...(entry.reuse ? ['Reused from Problem Solver: where its words say Implement, read Decide.'] : []),
    ...(tool.exercise ? [`Exercise (offer once, when the minimum is met): ${tool.exercise}`] : []),
    ...(COMPANIONS[id] ? [COMPANIONS[id]] : [])
  ].join('\n');
}

/** Follow-ups for "another angle": the book's see also first, then ours, without repeats. */
export function anotherAngle(id, done = []) {
  const entry = CATALOGUE.find((item) => item.id === id);
  if (!entry) return { book: [], ours: [] };
  const skip = new Set([id, ...done]);
  const book = entry.seeAlso.filter((other) => TOOLS[other] && !skip.has(other));
  const ours = pairsOf(id).filter((other) => TOOLS[other] && !skip.has(other) && !book.includes(other));
  return { book, ours };
}
