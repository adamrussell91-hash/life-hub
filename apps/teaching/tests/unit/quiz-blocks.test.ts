import { describe, it, expect, vi } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { PublishableLessonSchema, type Lesson } from '@/schemas/lesson';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { listPublishBlockIssues } from '@/schemas/publish-block-issues';
import { mountQuestionBuilder } from '@/quiz/builder';
import { mountQuestionPlayer } from '@/quiz/player';
import { blankQuestion, splitQuestion, markResponse, type QuizQuestion, type QuizResponse } from '@/quiz/core';
import { PEDAGOGICAL_MODES } from '@/curriculum/pedagogical-mode';

const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

describe('quiz lessons and blocks', () => {
  it('adds Quiz as a lesson type and both blocks as lesson-only learning blocks', () => {
    expect(PEDAGOGICAL_MODES).toContain('quiz');
    const drop = createBlock('question_drop', 'd1');
    const question = createBlock('quiz_question', 'q1');
    expect(BlockSchema.parse(drop).block_type).toBe('question_drop');
    expect(BlockSchema.parse(question).block_type).toBe('quiz_question');
    expect(BLOCK_GROUPS.find((g) => g.label === 'Learning')?.types).toEqual(expect.arrayContaining(['question_drop', 'quiz_question']));
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('question_drop');
  });

  it('blocks publishing a drop with no target, an unfinished question, or a quiz question outside a quiz', () => {
    const drop = createBlock('question_drop', 'd1');
    const question = createBlock('quiz_question', 'q1');
    const messages = listPublishBlockIssues([drop, question]).map((i) => i.message);
    expect(messages).toContain('Choose the quiz this Question drop feeds into');
    expect(messages).toContain('Write the question.');
    const now = new Date().toISOString();
    const lesson = {
      id: 'l1', title: 'Monday', slug: 'monday', status: 'active', created_at: now, updated_at: now, schema_version: 1,
      type: 'lesson', unit_id: 'u1', sequence: 1, blocks: [question]
    } as unknown as Lesson;
    const result = PublishableLessonSchema.safeParse(lesson);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('Quiz questions only work in a lesson set to Quiz');
  });

  it('prints a quiz question without its answer and shows the teacher the answer', () => {
    const block = createBlock('quiz_question', 'q1') as Extract<Block, { block_type: 'quiz_question' }>;
    block.content.question = { id: 'q1', kind: 'short_answer', prompt: 'Who narrates?', marks: 1, accepted: ['Ono'] };
    expect(renderBlock(block, 'teacher').textContent).toContain('Accepts: Ono');
    expect(renderBlock(block, 'print').textContent).not.toContain('Ono');
    expect(renderBlock(block, 'student').textContent).not.toContain('Ono');
  });
});

describe('question builder', () => {
  it('builds a multiple choice question from boxes and ticks', () => {
    const onChange = vi.fn();
    const builder = mountQuestionBuilder({ question: blankQuestion('multiple_choice', 'q', 1), audience: 'student', marks: { min: 1, max: 3 }, onChange });
    expect(builder.problem()).toBe('Write the question.');
    type(builder.root.querySelector('textarea')!, 'Which is a metaphor?');
    const options = builder.root.querySelectorAll<HTMLInputElement>('.qz-row .qz-input');
    ['Time is a thief', 'Like a ghost', 'As brave as', 'Bang'].forEach((text, i) => type(options[i]!, text));
    expect(builder.problem()).toBe('Tick the right answer.');
    const marks = builder.root.querySelectorAll<HTMLInputElement>('.qz-row__mark');
    marks[0]!.checked = true;
    marks[0]!.dispatchEvent(new Event('change'));
    expect(builder.problem()).toBeNull();
    const q = builder.get() as Extract<QuizQuestion, { kind: 'multiple_choice' }>;
    expect(q.correct).toEqual([q.options[0]!.id]);
    expect(onChange).toHaveBeenCalled();
  });

  it('blanks fill-the-gap words by tapping them', () => {
    const builder = mountQuestionBuilder({ question: blankQuestion('fill_gap', 'q', 1), audience: 'student', onChange: () => undefined });
    type(builder.root.querySelector('textarea')!, 'Shall I compare thee');
    expect(builder.problem()).toBe('Blank out at least one word.');
    const chip = [...builder.root.querySelectorAll<HTMLButtonElement>('.qz-gap-chip')].find((b) => b.textContent === 'compare')!;
    chip.click();
    expect((builder.get() as Extract<QuizQuestion, { kind: 'fill_gap' }>).passage).toBe('Shall I [[compare]] thee');
    expect(builder.problem()).toBeNull();
  });

  it('keeps marks inside the block’s range and only offers allowed kinds', () => {
    const builder = mountQuestionBuilder({ question: blankQuestion('true_false', 'q', 9), audience: 'student', kinds: ['true_false', 'short_answer'], marks: { min: 1, max: 2 }, onChange: () => undefined });
    expect(builder.get().marks).toBe(2);
    const kinds = [...builder.root.querySelectorAll('select option')].map((o) => (o as HTMLOptionElement).value);
    expect(kinds).toEqual(['true_false', 'short_answer']);
  });
});

describe('question player', () => {
  it('collects a response and shows the marked result with the right answer', () => {
    const full: QuizQuestion = { id: 'q', kind: 'ordering', prompt: 'Order these', marks: 2, items: [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }, { id: 'c', text: 'Third' }] };
    const { question, key } = splitQuestion(full);
    let response: QuizResponse | null = null;
    const player = mountQuestionPlayer({ question, onChange: (r) => (response = r) });
    expect(response).toEqual({ order: question.kind === 'ordering' ? question.items.map((i) => i.id) : [] });
    player.querySelector<HTMLButtonElement>('button[data-dir="down"]')!.click();
    expect((response as unknown as { order: string[] }).order).toHaveLength(3);
    const mark = markResponse(key, response);
    const marked = mountQuestionPlayer({ question, response, result: { mark, key } });
    expect(marked.querySelector('.qz-result')).not.toBeNull();
    if (mark.correct === false) expect(marked.textContent).toContain('Answer: 1. First');
    expect(marked.querySelectorAll('button:not(:disabled)').length).toBe(0);
  });

  it('answers multiple choice with a tap', () => {
    const { question } = splitQuestion({ id: 'q', kind: 'multiple_choice', prompt: 'Pick', marks: 1, options: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }], correct: ['a'] });
    const onChange = vi.fn();
    const player = mountQuestionPlayer({ question, onChange });
    const yes = [...player.querySelectorAll<HTMLButtonElement>('.qz-choice')].find((b) => b.textContent?.includes('Yes'))!;
    yes.click();
    expect(yes.getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenCalledWith({ selected: [expect.any(String)] });
  });
});

describe('marked view without the answer', () => {
  it('colours a right pick green even when the answer is held back', () => {
    const { question, key } = splitQuestion({ id: 'q', kind: 'true_false', prompt: 'Sky is blue', marks: 1, answer: true });
    const mark = markResponse(key, { value: true });
    const view = mountQuestionPlayer({ question, response: { value: true }, result: { mark, key: null } });
    const trueBtn = [...view.querySelectorAll<HTMLButtonElement>('.qz-toggle')].find((b) => b.textContent === 'True')!;
    expect(trueBtn.dataset.state).toBe('right');
    const mc = splitQuestion({ id: 'm', kind: 'multiple_choice', prompt: 'Pick', marks: 1, options: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }], correct: ['a'] });
    const yes = mc.question.kind === 'multiple_choice' ? mc.question.options.find((o) => o.text === 'Yes')!.id : '';
    const mcView = mountQuestionPlayer({ question: mc.question, response: { selected: [yes] }, result: { mark: markResponse(mc.key, { selected: [yes] }), key: null } });
    expect([...mcView.querySelectorAll<HTMLButtonElement>('.qz-choice')].find((b) => b.textContent?.includes('Yes'))!.dataset.state).toBe('right');
    expect(mcView.textContent).not.toContain('Answer:');
  });
});
