// packages/problem-solver/tools/concept-map.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

export const conceptMap = Object.freeze({
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
  edgeKinds: ['association', 'hierarchical', 'cross'],
  nextSlots(run) {
    if (!hasSlot(run, 'theme')) return ['theme'];
    return open(nextIndexed(run, 'concept', 20));
  },
  complete(run) {
    return hasSlot(run, 'theme') && countSlots(run, 'concept') >= 3 && run.edges.length >= 2;
  }
});
