import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBlockSchemaExamples } from '@/ai/block-recipes';
import { buildAiStaticPrompt } from '@/ai/context';

/**
 * The static prompt is the cached prefix of every Teaching AI job. Live test
 * (21 Oct): random option ids in the quiz example changed it on every call, so
 * the prompt cache never hit across jobs.
 */
describe('the static prompt', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is identical between calls, whatever Math.random returns', () => {
    const input = { agentName: "Ann O'Tation", protocol: 'Be Ann.' };
    vi.spyOn(Math, 'random').mockReturnValue(0.123);
    const first = buildAiStaticPrompt(input);
    vi.spyOn(Math, 'random').mockReturnValue(0.987);
    const second = buildAiStaticPrompt(input);
    expect(second).toBe(first);
  });

  it('keeps references to renamed ids consistent', () => {
    const examples = JSON.parse(buildBlockSchemaExamples()) as Array<{ id: string; block_type: string; content: Record<string, unknown> }>;
    const block = examples.find((b) => b.block_type === 'quiz_question')! as { id?: string; content: Record<string, unknown> };
    const quiz = block.content.question as { id: string; options: Array<{ id: string }> };
    expect(block.id).toBe('quiz_question_example');
    expect(quiz.id).toBe('quiz_question_example');
    expect(quiz.options.map((o) => o.id)).toEqual(['quiz_question_1', 'quiz_question_2', 'quiz_question_3', 'quiz_question_4']);
    const categorise = JSON.stringify(examples);
    expect(categorise).not.toMatch(/"id":"[a-z0-9]{8}"/);
  });
});
