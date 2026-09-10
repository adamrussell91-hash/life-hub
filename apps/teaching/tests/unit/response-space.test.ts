import { describe, it, expect } from 'vitest';
import { BlockSchema, QuestionItemSchema, ResponseSpaceSchema } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { createQuestionSetEditor } from '@/blocks/editors';
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

    const space = root.querySelector(
      '.block-editor__question-response-space'
    ) as HTMLSelectElement;
    expect(space).toBeTruthy();
    expect(space.value).toBe('medium');
    space.value = 'extended';
    space.dispatchEvent(new Event('change'));
    expect(latest.content.questions[0]?.response_space).toBe('extended');

    const kind = root.querySelector('.block-editor__question-kind') as HTMLSelectElement;
    kind.value = 'multiple_choice';
    kind.dispatchEvent(new Event('change'));
    expect(latest.content.questions[0]?.response_space).toBeUndefined();
    expect(
      (root.querySelector('.block-editor__question-response-space') as HTMLSelectElement | null)
        ?.hidden
    ).toBe(true);
  });
});
