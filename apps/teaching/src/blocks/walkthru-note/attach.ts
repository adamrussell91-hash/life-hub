import type { Block } from '@/schemas/block';
import { techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';

/**
 * Blocks that embody a technique carry its icon in the teacher's view, opening the same steps.
 * A teacher-only registry: nothing here is stored on the block or reaches students.
 * (Markbook feedback → Whole class feedback has no block to carry it, so it isn't listed.)
 */
const ATTACH: Partial<Record<Block['block_type'], string[]>> = {
  hinge_question: ['w1-check-for-understanding'],
  quiz_question: ['w1-quizzing'],
  question_set: ['w1-quizzing'],
  faded_example: ['w1-worked-examples-and-backward-fading']
};

/** The technique ids a block can carry. Only ids in the catalogue are returned. */
export function attachedTechniques(block: Pick<Block, 'block_type'>): string[] {
  return (ATTACH[block.block_type] ?? []).filter((id) => techniqueById(id));
}
