// packages/problem-solver/tools/double-loop.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

/** 'yes' when the problem recurs (the outer loop is open), 'no', or null before it is answered. */
export function recurs(run) {
  return run.nodes.find((node) => node.slot === 'recurs')?.tag ?? null;
}

/** The box of the book's chart each slot belongs to. */
export const LOOP_STAGE = Object.freeze({
  problem: 'problem',
  single: 'action',
  recurs: 'consequences',
  governing: 'governing',
  reframe: 'governing',
  strategy: 'action',
  test: 'consequences',
  monitor: 'solution'
});

/** The box the latest node sits in (where the travelling marker rests), 'problem' at the start. */
export function loopStage(run) {
  const last = run.nodes.at(-1);
  return last ? LOOP_STAGE[parseSlot(last.slot)?.name] ?? 'problem' : 'problem';
}

export const doubleLoop = Object.freeze({
  id: 'double_loop',
  name: 'Double-loop learning',
  kind: 'review',
  step: 'improve',
  when: 'A problem keeps coming back, or a fix did not hold: correct it within the current rules first, then question the rules, norms and assumptions that keep producing it (Argyris and Schön).',
  failureModes: [
    'Another single-loop fix for a problem that keeps recurring.',
    'Naming a symptom as the governing assumption.',
    'Changing everything at once instead of testing on a small scale.',
    'Blaming people rather than the rules they work within.'
  ],
  steps: [
    { id: 'problem', title: 'Define the problem', prompt: 'From what you know, name the immediate issue to solve.' },
    { id: 'single', title: 'Single loop', prompt: 'How was it corrected within the current system and processes?' },
    { id: 'recurs', title: 'Does it recur?', prompt: 'Did the problem persist or come back? Yes or no, and the evidence.' },
    { id: 'governing', title: 'Question the norms', prompt: 'Which assumptions, rules or beliefs keep producing it?' },
    { id: 'reframe', title: 'Reframe', prompt: 'Look at it from other perspectives and root-cause tools: what is the problem really?' },
    { id: 'strategy', title: 'New strategies', prompt: 'What would address the deeper issue?' },
    { id: 'test', title: 'Test small', prompt: 'How will you try it on a small scale first, and what counts as success?' },
    { id: 'monitor', title: 'Monitor and reflect', prompt: 'Who watches the outcome, and when do you go round again?' }
  ],
  slots: {
    problem: 'The immediate issue to solve',
    single: 'The correction made within the current system',
    recurs: 'Whether the problem persisted or came back, with evidence',
    governing: 'An assumption, rule, norm or belief that keeps producing the problem',
    reframe: 'The problem seen afresh, after questioning the norms',
    strategy: 'A new strategy aimed at the deeper issue',
    test: 'How the change is tested on a small scale, and what counts as success',
    monitor: 'How the outcome is monitored, and when to go round again'
  },
  nodeTags: { recurs: ['yes', 'no'] },
  edgeKinds: [],
  nextSlots(run) {
    for (const slot of ['problem', 'single', 'recurs']) if (!hasSlot(run, slot)) return [slot];
    if (recurs(run) === 'no') return open(hasSlot(run, 'monitor') ? null : 'monitor');
    if (!countSlots(run, 'governing')) return ['governing:1'];
    if (!hasSlot(run, 'reframe')) return open(nextIndexed(run, 'governing', 6), 'reframe');
    if (!countSlots(run, 'strategy')) return ['strategy:1'];
    if (!hasSlot(run, 'test')) return open(nextIndexed(run, 'strategy', 4), 'test');
    return open(hasSlot(run, 'monitor') ? null : 'monitor');
  },
  complete(run) {
    if (!hasSlot(run, 'problem') || !hasSlot(run, 'single') || !recurs(run)) return false;
    return recurs(run) === 'no' || (countSlots(run, 'governing') > 0 && hasSlot(run, 'reframe') && countSlots(run, 'strategy') > 0 && hasSlot(run, 'test'));
  }
});
