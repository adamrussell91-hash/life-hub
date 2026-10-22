// packages/problem-solver/tools/five-whys.mjs
// 5 Whys, built by fiveWhysTool. The default build is Problem Solver's own tool (at least five
// whys, up to eight). Options make another book's variant: Gear Shifter's stops at a root the
// evidence supports, so `minWhys` is 1 (five is a guide) and, with `evidence`, each why needs
// its evidence before the chain goes on or the root opens.
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

export const MIN_WHYS = 5;
export const MAX_WHYS = 8;

const DEFAULTS = Object.freeze({
  id: 'five_whys',
  name: '5 Whys',
  kind: 'diagnostic',
  when: 'One clear symptom with a likely single chain of cause.',
  step: 'define',
  failureModes: [
    'Stopping at a symptom instead of a process, occurrence or activity.',
    'A single chain when the causes clearly branch (switch to a problem tree).',
    'Blaming a person rather than a process.',
    'Whys that are not checked against evidence.'
  ],
  steps: [
    { id: 'state', title: 'State the problem', prompt: 'Define the problem clearly in one sentence or statement.' },
    { id: 'ask', title: 'Ask why?', prompt: 'Ask why a minimum of five times. Base each why on the answer before it, until you reach the root cause. Seven or eight may be needed; usually five is enough.' },
    { id: 'specific', title: 'Be specific', prompt: 'The final why should point to a specific process, occurrence, action or activity, not something generic like "not enough time" or "not enough budget".' }
  ],
  slots: { problem: 'The problem statement', why: 'An answer to "why?" about the line above', root: 'The specific root cause' }
});

const EVIDENCE = 'What shows the why above is true (something seen, measured or checked)';

/**
 * @param {object} [options] any of the default fields above, plus:
 * @param {number} [options.minWhys] whys before the root may open (default 5)
 * @param {number} [options.maxWhys] the most whys (default 8)
 * @param {boolean} [options.evidence] each why needs its evidence before the chain goes on
 */
export function fiveWhysTool(options = {}) {
  const def = { ...DEFAULTS, ...options };
  const minWhys = options.minWhys ?? MIN_WHYS;
  const maxWhys = options.maxWhys ?? MAX_WHYS;
  if (!Number.isInteger(minWhys) || minWhys < 1 || minWhys > maxWhys) throw new Error(`5 Whys ${def.id}: minWhys runs from 1 to maxWhys`);
  const evidence = Boolean(options.evidence);
  const variant = def.id !== DEFAULTS.id;
  /** True when every why so far has its evidence (always, without the option). */
  const checked = (run) => !evidence || countSlots(run, 'evidence') >= countSlots(run, 'why');
  return Object.freeze({
    id: def.id,
    name: def.name,
    kind: def.kind,
    when: def.when,
    step: def.step,
    failureModes: def.failureModes,
    steps: def.steps,
    ...(def.exercise ? { exercise: def.exercise } : {}),
    ...(variant ? { variantOf: 'five_whys' } : {}),
    slots: evidence ? { ...def.slots, evidence: def.slots.evidence ?? EVIDENCE } : def.slots,
    edgeKinds: [],
    nextSlots(run) {
      if (!hasSlot(run, 'problem')) return ['problem'];
      if (hasSlot(run, 'root')) return [];
      if (!checked(run)) return [`evidence:${countSlots(run, 'why')}`];
      return open(nextIndexed(run, 'why', maxWhys), countSlots(run, 'why') >= minWhys ? 'root' : null);
    },
    complete(run) {
      return hasSlot(run, 'root');
    }
  });
}

export const fiveWhys = fiveWhysTool();
