import { describe, it, expect } from 'vitest';
import { kitValue, pickKitOption } from './kit-filter';
import { BlockSchema, QuestionItemSchema, ResponseSpaceSchema } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { createQuestionSetEditor } from '@/blocks/editors';
import { renderQuestionSetBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

describe('response_space schema', () => {
  it('accepts all enum values on short_answer', () => {
    for (const response_space of ResponseSpaceSchema.options) {
      expect(
        QuestionItemSchema.parse({
          id: 'q1',
          prompt: 'Explain',
          kind: 'short_answer',
          response_space
        }).response_space
      ).toBe(response_space);
    }
  });

  it('accepts short_answer without response_space (legacy)', () => {
    expect(
      QuestionItemSchema.parse({
        id: 'q1',
        prompt: 'Explain',
        kind: 'short_answer'
      }).response_space
    ).toBeUndefined();
  });

  it('parses question_set with response_space', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'question_set',
      content: {
        questions: [
          {
            id: 'q_a',
            prompt: 'What stands out?',
            kind: 'short_answer',
            response_space: 'long'
          }
        ]
      }
    });
    expect(block.block_type).toBe('question_set');
    if (block.block_type === 'question_set') {
      expect(block.content.questions[0]?.response_space).toBe('long');
    }
  });
});

describe('response_space create defaults', () => {
  it('createBlock question_set defaults short answer to medium', () => {
    const block = createBlock('question_set', 'qs_default');
    expect(block.block_type).toBe('question_set');
    if (block.block_type === 'question_set') {
      expect(block.content.questions[0]?.kind).toBe('short_answer');
      expect(block.content.questions[0]?.response_space).toBe('medium');
    }
  });
});

describe('response_space editor', () => {
  it('selecting None removes writing space in teacher, student and print views', () => {
    let latest = createBlock('question_set', 'qs_none') as Extract<Block, { block_type: 'question_set' }>;
    latest.content.questions[0].prompt = 'Discuss this aloud.';
    const editor = createQuestionSetEditor(latest, (next) => { latest = next; }, () => latest);
    pickKitOption(editor.querySelector('.block-editor__question-response-space'), 'none');
    expect(latest.content.questions[0].response_space).toBe('none');

    const saved = BlockSchema.parse(JSON.parse(JSON.stringify(latest))) as typeof latest;
    for (const mode of ['teacher', 'student', 'print'] as const) {
      const rendered = renderQuestionSetBlock(saved, mode);
      expect(rendered.textContent).toContain('Discuss this aloud.');
      expect(rendered.querySelector('.block-question-set__answer')).toBeNull();
      expect(rendered.querySelector('.block-question-set__answer-label')).toBeNull();
      expect(rendered.querySelector('.block-question-set__response-lines')).toBeNull();
    }
  });

  it.each(['short', 'medium', 'long', 'extended', undefined] as const)(
    'keeps on-screen writing space for %s', (response_space) => {
      const block = createBlock('question_set', 'qs_space') as Extract<Block, { block_type: 'question_set' }>;
      block.content.questions[0].response_space = response_space;
      for (const mode of ['teacher', 'student'] as const) {
        expect(renderQuestionSetBlock(block, mode).querySelector('.block-question-set__answer')).not.toBeNull();
      }
    }
  );

  it('emits response_space for short answer and strips on MC', () => {
    const block = createBlock('question_set', 'qs_editor') as Extract<
      Block,
      { block_type: 'question_set' }
    >;
    let latest = block;
    const root = createQuestionSetEditor(
      block,
      (next) => {
        latest = next;
      },
      () => latest
    );

    const space = root.querySelector('.block-editor__question-response-space');
    expect(space).toBeTruthy();
    expect(kitValue(space)).toBe('medium');
    pickKitOption(space, 'extended');
    expect(latest.content.questions[0]?.response_space).toBe('extended');

    pickKitOption(root.querySelector('.block-editor__question-kind'), 'multiple_choice');
    expect(latest.content.questions[0]?.response_space).toBeUndefined();
    expect(
      (root.querySelector('.block-editor__question-response-space') as HTMLElement | null)
        ?.hidden
    ).toBe(true);
  });
});
