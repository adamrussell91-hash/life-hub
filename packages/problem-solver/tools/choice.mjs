// packages/problem-solver/tools/choice.mjs
import { hasSlot } from '../slots.mjs';

/** The slot every Decide tool ends with: the option carried into Implement as its aim. */
export const CHOICE_SLOT = 'choice';

/**
 * Wraps a Decide tool definition so it ends with the chosen option. `choice` opens once the
 * tool's own minimum is met; the tool's other slots stay open; the tool is complete only
 * with a choice. Returns a frozen definition.
 */
export function withChoice(def) {
  return Object.freeze({
    ...def,
    steps: Object.freeze([...def.steps, { id: 'choose', title: 'Choose', prompt: 'Name the option to carry into Implement, and why, in light of what this tool showed. The coach names the leading option first; the choice is yours.' }]),
    slots: Object.freeze({ ...def.slots, [CHOICE_SLOT]: 'The option chosen to carry into Implement as its aim, and why' }),
    nextSlots(run) {
      const base = def.nextSlots(run);
      return !hasSlot(run, CHOICE_SLOT) && def.complete(run) ? [...base, CHOICE_SLOT] : base;
    },
    complete(run) {
      return def.complete(run) && hasSlot(run, CHOICE_SLOT);
    }
  });
}
