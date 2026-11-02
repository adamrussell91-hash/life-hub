import { visitBlocks } from '@/blocks/walk-blocks';
import type { Block } from '@/schemas/block';
import { taggedSkills, targetPieces } from '@/deep/block-tags';

/**
 * Publish warning: questions that reach no piece and no skill count only
 * towards the lesson's dot points. This never stops a publish.
 */

export type UntaggedQuestions = { total: number; untagged: string[] };

export function untaggedQuestions(blocks: readonly Block[]): UntaggedQuestions {
  let total = 0;
  const untagged: string[] = [];
  visitBlocks([...blocks], (block: Block) => {
    if (block.block_type !== 'quiz_question') return;
    total += 1;
    const q = (block.content as { question?: { pieces?: unknown[]; skills?: unknown[] } }).question;
    const tagged = !!q?.pieces?.length || !!q?.skills?.length || targetPieces(block).length > 0 || taggedSkills(block).length > 0;
    if (!tagged) untagged.push(block.id);
  });
  return { total, untagged };
}

/** The line to show before publishing, or null when every question reaches something. */
export function untaggedLine(found: UntaggedQuestions, lessonHasDotPoints: boolean): string | null {
  const n = found.untagged.length;
  if (!n) return null;
  return lessonHasDotPoints
    ? `${n} of ${found.total} ${found.total === 1 ? 'question has' : 'questions have'} no piece or skill, so ${n === 1 ? 'it only counts' : 'they only count'} towards this lesson's dot points.`
    : `${n} of ${found.total} ${found.total === 1 ? "question doesn't" : "questions don't"} reach anything yet.`;
}
