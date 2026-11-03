import type { Block } from '@/schemas/block';
import { techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';
import { suggestedTechnique } from './attach';

/**
 * What the WalkThru picker shows before the full catalogue: the techniques that suit this kind of
 * block, then the clusters on Adam's own board. Offers only: nothing attaches until he picks one.
 * Ids only; the book's text never lives here.
 */

/** Techniques that suit a block type, best fit first. */
const BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  faded_example: ['w1-worked-examples-and-backward-fading', 'w1-metacognitive-talk', 'w1-scaffolding', 'w1-guided-practice'],
  whiteboard: ['w1-live-modelling', 'w1-metacognitive-talk', 'w1-show-me-boards'],
  equation: ['w1-live-modelling', 'w1-metacognitive-talk', 'w1-worked-examples-and-backward-fading'],
  hinge_question: ['w1-check-for-understanding', 'w2-multiple-choice-questions', 'w1-show-me-boards'],
  quiz_question: ['w1-quizzing', 'w2-multiple-choice-questions', 'w1-check-for-understanding'],
  question_set: ['w1-quizzing', 'w1-tiered-questions-and-problems', 'w2-a-ladder-of-difficulty'],
  flashcards: ['w2-flash-cards', 'w1-peer-supported-retrieval', 'w1-building-fluency'],
  cloze: ['w1-quizzing', 'w1-building-fluency'],
  self_check: ['w2-success-criteria', 'w2-spot-your-mistakes'],
  peer_feedback: ['w2-redrafting', 'w2-success-criteria', 'w1-feedback-as-actions'],
  question_drop: ['w2-make-everyone-think', 'w1-elaborative-interrogation'],
  brainstorm: ['w1-think-pair-share', 'w2-make-everyone-think'],
  continuum_line: ['w1-probing-questions', 'w1-oracy-debating', 'w1-think-pair-share'],
  annotation: ['w1-live-modelling', 'w1-metacognitive-talk', 'w2-exemplars'],
  definition: ['w1-deliberate-vocabulary-development'],
  mind_map: ['w2-dual-coding-mapping', 'w1-big-picture-small-picture'],
  concept_map: ['w2-dual-coding-mapping', 'w1-big-picture-small-picture'],
  diagram: ['w2-dual-coding-diagrams', 'w1-dual-coding'],
  timeline: ['w1-big-picture-small-picture', 'w1-dual-coding'],
  card_stack: ['w2-compare-contrast-and-categorise'],
  classroom_tools: ['w1-cold-calling', 'w2-randomised-questioning'],
  countdown: ['w2-transitions-between-activities'],
  with_teacher: ['w1-guided-practice', 'w1-check-for-understanding'],
  outcomes: ['w2-learning-objectives-vs-tasks', 'w2-success-criteria'],
  concept_features: ['w1-abstract-models-with-concrete-examples'],
  question_quadrant: ['w1-probing-questions', 'w1-process-questions'],
  thinking_reflection: ['w1-metacognitive-talk'],
  fluid_analogy: ['w2-analogies'],
  analogy_close_reading: ['w2-analogies'],
  analogy_pattern: ['w2-analogies'],
  analogy_reverse: ['w2-analogies'],
  analogy_problem: ['w2-analogies'],
  analogy_metaphor: ['w2-analogies'],
  analogy_transfer: ['w2-analogies'],
  analogy_chains: ['w2-analogies'],
  analogy_types: ['w2-analogies', 'w2-compare-contrast-and-categorise']
};

/** An exemplar annotation leads with the techniques it is built on. */
const BY_EXEMPLAR: Readonly<Record<string, readonly string[]>> = {
  single: ['w2-exemplars', 'w1-set-the-standards'],
  compare: ['w2-exemplars', 'w2-compare-contrast-and-categorise', 'w1-set-the-standards'],
  counter: ['w2-exemplars', 'w1-abstract-models-with-concrete-examples', 'w1-head-on-misconceptions']
};

export const recommendedIdsByType = (): Readonly<Record<string, readonly string[]>> => BY_TYPE;
export const recommendedIdsByExemplar = (): Readonly<Record<string, readonly string[]>> => BY_EXEMPLAR;

/** The techniques to offer first for this block, deduplicated, catalogue entries only. */
export function recommendedTechniques(block: Block): string[] {
  const ids: string[] = [];
  const voice = suggestedTechnique(block);
  if (voice) ids.push(voice);
  const exemplar = block.block_type === 'annotation' ? (block.content as { exemplar?: { kind?: string } }).exemplar?.kind : undefined;
  if (exemplar && BY_EXEMPLAR[exemplar]) ids.push(...BY_EXEMPLAR[exemplar]!);
  ids.push(...(BY_TYPE[block.block_type] ?? []));
  return [...new Set(ids)].filter((id) => techniqueById(id)?.kind === 'technique');
}

/** A board cluster as the picker needs it. */
export type ClusterLite = { id: string; name: string; tiles: ReadonlyArray<{ id: string }> };

/**
 * One picker group per board cluster that holds book techniques, in board order. Fusions stay out:
 * a block carries a book technique. A board with only the default cluster reads "On your board".
 */
export function boardGroups(clusters: readonly ClusterLite[]): Array<{ name: string; items: string[] }> {
  const out: Array<{ name: string; items: string[] }> = [];
  const named = clusters.length > 1 || clusters[0]?.id !== 'cl_board';
  for (const cluster of clusters) {
    const items = [...new Set(cluster.tiles.map((t) => t.id))].filter((id) => techniqueById(id)?.kind === 'technique');
    if (!items.length) continue;
    out.push({ name: named ? `On your board · ${cluster.name}` : 'On your board', items });
  }
  return out;
}
