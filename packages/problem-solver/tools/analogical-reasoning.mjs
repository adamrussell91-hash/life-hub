// packages/problem-solver/tools/analogical-reasoning.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const MAX_TARGETS = 3;
const MAX_RULES = 8;
const nodeAt = (run, slot) => run.nodes.find((node) => node.slot === slot) ?? null;

/** The current round: its target number, rules placed since that target, and its filter and assessment. */
export function currentRound(run) {
  const round = countSlots(run, 'target');
  const start = run.nodes.findIndex((node) => node.slot === `target:${round}`);
  const rules = start < 0 ? [] : run.nodes.slice(start + 1).filter((node) => parseSlot(node.slot)?.name === 'rule');
  return { round, rules, filtered: nodeAt(run, `filtered:${round}`), assess: nodeAt(run, `assess:${round}`) };
}

export const analogicalReasoning = Object.freeze({
  id: 'analogical_reasoning',
  name: 'Analogical reasoning',
  kind: 'generative',
  step: 'devise',
  when: 'A problem that resembles one already solved somewhere else (another field, another time, someone else\'s life), so its solution can be borrowed and adapted.',
  failureModes: [
    'An analogy that matches on the surface but not on what causes the problem.',
    'Rules that hold for the analogue but not for this problem.',
    'Declaring it solved without testing the borrowed rule.'
  ],
  steps: [
    { id: 'source', title: 'Define the source problem', prompt: 'Name the problem you face and its key characteristics.' },
    { id: 'target', title: 'Identify the analogue', prompt: 'Find a problem solved elsewhere that shares those characteristics, and list them. Park other analogies for later.' },
    { id: 'match', title: 'Match rules', prompt: 'Write rules that hold for both: statements that explain an action, a change, an attribute or a situation.' },
    { id: 'filter', title: 'Filter', prompt: 'Keep the most relevant rules and apply them to your problem.' },
    { id: 'assess', title: 'Assess', prompt: 'Did they solve it? If not, revise, search for another analogue and go round again.' }
  ],
  slots: {
    source: 'The problem faced, with its key characteristics',
    target: 'A solved problem from elsewhere that shares those characteristics',
    rule: 'A rule that holds for both problems',
    filtered: 'The rules kept and how they apply here',
    assess: 'Whether applying them solves the problem, and why',
    retain: 'What to keep from this analogy'
  },
  nodeTags: { assess: ['solved', 'unsolved'] },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'source')) return ['source'];
    const { round, rules, filtered, assess } = currentRound(run);
    if (round === 0) return ['target:1'];
    if (assess) {
      if (assess.tag === 'solved') return hasSlot(run, 'retain') ? [] : ['retain'];
      return round < MAX_TARGETS ? [`target:${round + 1}`] : [];
    }
    if (filtered) return [`assess:${round}`];
    return open(nextIndexed(run, 'rule', countSlots(run, 'rule') + (MAX_RULES - rules.length)), rules.length >= 1 ? `filtered:${round}` : null);
  },
  complete(run) {
    const { round, assess } = currentRound(run);
    return hasSlot(run, 'retain') || (round === MAX_TARGETS && Boolean(assess));
  }
});
