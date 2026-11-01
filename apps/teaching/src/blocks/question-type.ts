import type { Block } from '@/schemas/block';
import { blankQuestion, QUIZ_KIND_INFO, QUIZ_QUESTION_KINDS, type QuizQuestionKind } from '@/quiz/core';
import { formatsFor, withFormat } from '@/blocks/formats/registry';

/**
 * One Question block for the teacher. Underneath there are still two: a quiz
 * question (its answers go into the quiz go and its score) and a written
 * question (handed in as written work: Markbook columns, Returned work, next
 * steps). The Question type list offers both, and picking across swaps the
 * block in place, same id, keeping the question's wording.
 */

type QuizBlock = Extract<Block, { block_type: 'quiz_question' }>;
type WrittenBlock = Extract<Block, { block_type: 'question_set' }>;
export type QuestionBlock = QuizBlock | WrittenBlock;

const WRITTEN = 'written:';

export const QUIZ_GROUP_LABEL = 'In the quiz';
export const WRITTEN_GROUP_LABEL = 'Written work: handed in, you mark it';

/** The quiz kinds, for the written editor's list. */
export function quizTypeOptions(): Array<{ value: string; label: string }> {
  return QUIZ_QUESTION_KINDS.map((kind) => ({ value: kind, label: QUIZ_KIND_INFO[kind].label }));
}

/** The written formats, for the quiz editor's list. Standard reads as Written answer. */
export function writtenTypeOptions(): Array<{ value: string; label: string }> {
  return formatsFor('question_set').map((f) => ({ value: `${WRITTEN}${f.id}`, label: f.id === 'standard' ? 'Written answer' : f.label }));
}

export function isWrittenType(value: string): boolean {
  return value.startsWith(WRITTEN);
}

function firstPrompt(block: QuestionBlock): string {
  return block.block_type === 'quiz_question' ? block.content.question.prompt ?? '' : block.content.questions[0]?.prompt ?? '';
}

/** The block as the type picked: `written:<format>` or a quiz kind. Same id, same wording. */
export function convertQuestionBlock(block: QuestionBlock, value: string): QuestionBlock {
  const prompt = firstPrompt(block);
  // Everything but the type and content carries over: id, visibility, layout, dates.
  const { block_type: _type, content: _content, ...shared } = block;
  if (isWrittenType(value)) {
    const model = block.block_type === 'quiz_question' && 'model_answer' in block.content.question ? block.content.question.model_answer : undefined;
    const written: WrittenBlock =
      block.block_type === 'question_set'
        ? block
        : ({
            ...shared,
            block_type: 'question_set',
            content: { questions: [{ id: `${block.id}_q1`, prompt, kind: 'short_answer', response_space: 'medium', ...(model ? { model_answer: model } : {}) }] }
          } as WrittenBlock);
    return withFormat(written, value.slice(WRITTEN.length));
  }
  const kind = value as QuizQuestionKind;
  const question = { ...blankQuestion(kind, block.id), prompt };
  const model = block.block_type === 'question_set' ? block.content.questions[0]?.model_answer : undefined;
  if (model && (kind === 'extended_response' || kind === 'explain_effect')) Object.assign(question, { model_answer: model });
  return { ...shared, block_type: 'quiz_question', content: { question } } as QuizBlock;
}

/** A new Question in a lesson type whose player has no quiz starts as a written question. */
export function questionForLesson(block: Block, quizRuns: boolean): Block {
  if (quizRuns || block.block_type !== 'quiz_question') return block;
  return convertQuestionBlock(block, `${WRITTEN}standard`);
}
