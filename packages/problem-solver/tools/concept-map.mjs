// packages/problem-solver/tools/concept-map.mjs
// Concept mapping, built by conceptMapTool. The default build is Problem Solver's own Define tool.
// Another id makes a variant for another book: it keeps the central theme, the concepts and the
// labelled links, takes that book's words, step and link kinds, and can end with a reflection
// (`options.reflection`, the slot's description) once the map is at its minimum.
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

const DEFAULTS = Object.freeze({
  id: 'concept_map',
  name: 'Concept mapping',
  kind: 'diagnostic',
  when: 'Many interacting factors; a messy system that needs a holistic view.',
  step: 'define',
  failureModes: [
    'No clear central theme, so the map sprawls.',
    'Concepts with no labelled linkage.',
    'Every link the same kind, hiding hierarchy and cross-links.'
  ],
  steps: [
    { id: 'simple', title: 'Keep it simple', prompt: 'Select a central theme or idea. Identify key concepts related to it. Use keywords or short phrases, not sentences.' },
    { id: 'linkages', title: 'Create linkages', prompt: 'Hierarchical links show sequence or cause and effect. Association links connect related concepts. Cross-links connect concepts in different areas of the map.' }
  ],
  slots: { theme: 'The central theme', concept: 'A key concept, a few words' },
  edgeKinds: ['association', 'hierarchical', 'cross']
});

/**
 * @param {object} [options] any of the default fields above, plus:
 * @param {string} [options.reflection] a last slot, `reflection`, described by this text
 */
export function conceptMapTool(options = {}) {
  const def = { ...DEFAULTS, ...options };
  const variant = def.id !== DEFAULTS.id;
  const reflecting = Boolean(options.reflection);
  const mapped = (run) => hasSlot(run, 'theme') && countSlots(run, 'concept') >= 3 && run.edges.length >= 2;
  return Object.freeze({
    id: def.id,
    name: def.name,
    kind: def.kind,
    when: def.when,
    step: def.step,
    failureModes: def.failureModes,
    steps: def.steps,
    ...(def.exercise ? { exercise: def.exercise } : {}),
    ...(def.pairsWell ? { pairsWell: def.pairsWell } : {}),
    ...(variant ? { variantOf: 'concept_map' } : {}),
    slots: reflecting ? { ...def.slots, reflection: options.reflection } : def.slots,
    edgeKinds: def.edgeKinds,
    nextSlots(run) {
      if (!hasSlot(run, 'theme')) return ['theme'];
      return open(nextIndexed(run, 'concept', 20), reflecting && mapped(run) && !hasSlot(run, 'reflection') ? 'reflection' : null);
    },
    complete(run) {
      return mapped(run) && (!reflecting || hasSlot(run, 'reflection'));
    }
  });
}

export const conceptMap = conceptMapTool();
