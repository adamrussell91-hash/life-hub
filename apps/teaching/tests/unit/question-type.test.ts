import { describe, expect, it, vi } from 'vitest';
import { createBlock, LESSON_BLOCK_GROUPS, INSERT_MENU_LABEL } from '@/blocks/create-block';
import { convertQuestionBlock, questionForLesson } from '@/blocks/question-type';
import { createBlockEditor } from '@/blocks/editors';
import type { Block } from '@/schemas/block';

const quiz = () => {
  const b = createBlock('quiz_question', 'q1');
  if (b.block_type !== 'quiz_question') throw new Error('expected quiz');
  return { ...b, content: { ...b.content, question: { ...b.content.question, prompt: 'Why does the speaker pause?' } } };
};

const typeSelect = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLSelectElement>('select')].find((s) => s.id && root.querySelector(`label[for="${s.id}"]`)?.textContent === 'Question type')!;

describe('one Question block', () => {
  it('the lesson menu offers one Question, no separate Written questions', () => {
    const types = LESSON_BLOCK_GROUPS.flatMap((g) => g.types);
    expect(types).toContain('quiz_question');
    expect(types).not.toContain('question_set');
    expect(INSERT_MENU_LABEL.quiz_question).toBe('Question');
  });

  it('turns a quiz question into a written one in a format, keeping id and wording', () => {
    const next = convertQuestionBlock(quiz(), 'written:because_but_so');
    expect(next.block_type).toBe('question_set');
    expect(next.id).toBe('q1');
    if (next.block_type !== 'question_set') return;
    expect(next.content.format).toBe('because_but_so');
    expect(next.content.questions[0]?.prompt).toBe('Why does the speaker pause?');
  });

  it('turns a written question back into a quiz kind, keeping wording and model answer', () => {
    const written = convertQuestionBlock(quiz(), 'written:standard');
    if (written.block_type !== 'question_set') throw new Error('expected written');
    written.content.questions[0]!.model_answer = 'It builds tension.';
    const back = convertQuestionBlock(written, 'extended_response');
    expect(back.block_type).toBe('quiz_question');
    if (back.block_type !== 'quiz_question') return;
    expect(back.content.question.kind).toBe('extended_response');
    expect(back.content.question.prompt).toBe('Why does the speaker pause?');
    expect((back.content.question as { model_answer?: string }).model_answer).toBe('It builds tension.');
  });

  it('a new Question in a lesson type without a quiz starts written', () => {
    expect(questionForLesson(quiz(), false).block_type).toBe('question_set');
    expect(questionForLesson(quiz(), true).block_type).toBe('quiz_question');
  });

  it('the quiz editor lists the written types and swaps the block when one is picked', () => {
    let page: Block[] = [quiz()];
    const setLessonBlocks = vi.fn((next: Block[]) => { page = next; });
    const root = createBlockEditor(page[0]!, vi.fn(), undefined, { getLessonBlocks: () => page, setLessonBlocks });
    const select = typeSelect(root);
    expect([...select.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['In the quiz', 'Written work: handed in, you mark it']);
    select.value = 'written:question_levels';
    select.dispatchEvent(new Event('change'));
    expect(page[0]?.block_type).toBe('question_set');
  });

  it('the written editor offers the quiz kinds only where the lesson runs a quiz', () => {
    const written = convertQuestionBlock(quiz(), 'written:standard');
    let page: Block[] = [written];
    const ctx = { getLessonBlocks: () => page, setLessonBlocks: (next: Block[]) => { page = next; } };
    expect(typeSelect(createBlockEditor(written, vi.fn(), undefined, { ...ctx, quizRuns: () => false }))).toBeUndefined();
    const root = createBlockEditor(written, vi.fn(), () => page[0]!, { ...ctx, quizRuns: () => true });
    const select = typeSelect(root);
    select.value = 'multiple_choice';
    select.dispatchEvent(new Event('change'));
    expect(page[0]?.block_type).toBe('quiz_question');
  });
});
