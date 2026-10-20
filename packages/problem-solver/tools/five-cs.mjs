// packages/problem-solver/tools/five-cs.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';
import { namingProblem } from '../naming.mjs';

/** The five Cs in the order they are worked (and the pie's clockwise order from the top left). */
export const FIVE_CS = Object.freeze(['contextualise', 'categorise', 'condense', 'correct', 'correspond']);
const CONDENSE_MAX = 8;

/** The Cs that have an answer, in order. */
export function filledCs(run) {
  return FIVE_CS.filter((c) => countSlots(run, c) > 0);
}

/** The accepted name, or null. */
export function correspondName(run) {
  return run.nodes.find((node) => node.slot === 'correspond')?.text ?? null;
}

export const fiveCs = Object.freeze({
  id: 'five_cs',
  name: '5 Cs documentation',
  kind: 'record',
  step: 'document',
  when: 'At the end of a problem, to leave a record someone can find and use later: why it exists, where it lives, what it keeps, what was corrected and what it is called. The case file is built from it.',
  failureModes: [
    'Keeping everything instead of the few things that matter.',
    'A name only the person would understand, or one with no date or version.',
    'No purpose, so nobody knows why the record exists or who it is for.',
    'Known errors left in place instead of corrected or noted.'
  ],
  steps: [
    { id: 'contextualise', title: 'Purpose', prompt: 'Why keep this record, and who is it for: learning, accountability, handing over, next time?' },
    { id: 'categorise', title: 'Where it lives', prompt: 'Where will it be filed, under what heading, and who can see it?' },
    { id: 'condense', title: 'Keep the essentials', prompt: 'What are the few things worth keeping? One per answer.' },
    { id: 'correct', title: 'Correct', prompt: 'What was wrong or has changed since, and what did you fix? Note who, what, when and why, or say nothing needs correcting.' },
    { id: 'correspond', title: 'Name it', prompt: 'A short name that says what it holds, with the date as YYYYMMDD, a version such as v1, and Final.' }
  ],
  slots: {
    contextualise: 'Why the record is kept and who it is for',
    categorise: 'Where it is filed, under what heading, and who can see it',
    condense: 'One essential worth keeping',
    correct: 'What was corrected or has changed (who, what, when, why), or that nothing needs correcting',
    correspond: 'The record\'s name, exactly as agreed'
  },
  edgeKinds: [],
  nextSlots(run) {
    for (const slot of ['contextualise', 'categorise']) if (!hasSlot(run, slot)) return [slot];
    if (!countSlots(run, 'condense')) return ['condense:1'];
    if (!hasSlot(run, 'correct')) return open(nextIndexed(run, 'condense', CONDENSE_MAX), 'correct');
    return hasSlot(run, 'correspond') ? [] : ['correspond'];
  },
  complete(run) {
    return FIVE_CS.every((c) => countSlots(run, c) > 0);
  },
  /** Refuses an accepted name that breaks a strict naming rule; a challenge may still carry it. */
  strictNode(run, node) {
    if (parseSlot(node.slot)?.name !== 'correspond') return null;
    const problem = namingProblem(node.text);
    return problem ? `The name breaks a naming rule: ${problem}` : null;
  },
  promptNote(run) {
    if (!nextSlotsOpen(run, 'correspond')) return null;
    return 'Put the agreed name exactly in node.text. It is refused unless it has a YYYYMMDD date, a version such as v1 and "Final", is at most 260 characters, and uses only letters, digits and spaces. You judge whether it says what it holds and avoids names or abbreviations only the person would know; challenge if not.';
  }
});

function nextSlotsOpen(run, slot) {
  return fiveCs.nextSlots(run).includes(slot);
}
