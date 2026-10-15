import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { buildAiStaticPrompt } from '@/ai/context';
import {
  estimateCostUsd,
  pickLane,
  runLessonAiJob,
  type ModelReply,
  type ModelRequest
} from '@/ai/job-runner';
import type { AiJob } from '@/ai/jobs';
import type { Lesson } from '@/schemas/lesson';

const lesson: Lesson = {
  id: 'lesson_butterflies',
  title: 'The Remedy of Butterflies',
  slug: 'remedy',
  status: 'active',
  unit_id: 'unit_1',
  sequence: 1,
  blocks: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  schema_version: 1
} as Lesson;

function job(overrides: Partial<AiJob> = {}): AiJob {
  return {
    id: 'ai_job_1',
    lesson_id: lesson.id,
    agent: 'ann',
    status: 'working',
    snapshot_at: lesson.updated_at,
    message: 'Turn this glossary into flashcards: Vermin | pests',
    scope: 'lesson',
    created_at: '2026-01-03T00:00:00.000Z',
    ...overrides
  };
}

function flashcards(count: number) {
  const block = createBlock('flashcards', 'fc_1') as Extract<ReturnType<typeof createBlock>, { block_type: 'flashcards' }>;
  const sample = block.content.cards[0]!;
  block.content.cards = Array.from({ length: count }, (_, i) => ({ ...sample, id: `card_${i}`, front: `T${i}`, back: `D${i}` }));
  return block;
}

function insertReply(count: number, model: string): ModelReply {
  return {
    model,
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: 'Here are your cards.' },
      { type: 'tool_use', name: 'propose_insert_blocks', input: { position: 'below', blocks: [flashcards(count)] } }
    ],
    usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 }
  };
}

const base = { lesson, agentName: "Ann O'Tation", protocol: 'Be precise.' };

describe('pickLane', () => {
  it('sends conversions to the fast lane and judgement to the standard lane', () => {
    expect(pickLane({ message: 'Make flip cards from this glossary' })).toBe('fast');
    expect(pickLane({ message: 'Why is my hinge question weak?' })).toBe('standard');
    expect(pickLane({ message: 'x', action: 'shorten' })).toBe('fast');
    expect(pickLane({ message: 'flashcards', protocol_id: 'lesson-diagnosis' })).toBe('standard');
  });
});

describe('runLessonAiJob', () => {
  it('returns a valid proposal from the cheap model with a cached prompt prefix', async () => {
    const calls: ModelRequest[] = [];
    const result = await runLessonAiJob({
      ...base,
      job: job(),
      complete: async (request) => {
        calls.push(request);
        return insertReply(5, request.model);
      }
    });
    expect(result.status).toBe('done');
    expect(result.proposal?.kind).toBe('insert_blocks');
    expect(result.response).toBe('Here are your cards.');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe('claude-haiku-5-5');
    expect(calls[0]!.system.map((b) => b.cache_control?.type)).toEqual(['ephemeral', 'ephemeral']);
    expect(calls[0]!.system[0]!.text).toContain('Limits: say so before you build');
    expect(result.usage[0]!.cost_usd).toBeGreaterThan(0);
  });

  it('steps up to Sonnet with the validation error when the cheap answer breaks a limit', async () => {
    const calls: ModelRequest[] = [];
    const result = await runLessonAiJob({
      ...base,
      job: job(),
      complete: async (request) => {
        calls.push(request);
        return insertReply(calls.length === 1 ? 35 : 18, request.model);
      }
    });
    expect(calls.map((c) => c.model)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);
    expect(calls[1]!.messages.at(-1)!.content).toContain('failed validation');
    expect(result.status).toBe('done');
    expect(result.usage.map((u) => u.outcome)).toEqual(['invalid', 'ok']);
  });

  it('reports an error instead of hanging when every attempt fails', async () => {
    const result = await runLessonAiJob({
      ...base,
      job: job(),
      complete: async () => {
        throw new Error('network down');
      }
    });
    expect(result.status).toBe('error');
    expect(result.error).toBe('network down');
  });

  it('accepts a plain text answer with no proposal', async () => {
    const result = await runLessonAiJob({
      ...base,
      job: job({ message: 'Is the lesson too long?' }),
      complete: async (request) => ({ model: request.model, stop_reason: 'end_turn', content: [{ type: 'text', text: 'It is fine.' }] })
    });
    expect(result).toMatchObject({ status: 'done', response: 'It is fine.' });
    expect(result.proposal).toBeUndefined();
  });

  it('keeps alternating turns when history repeats a role', async () => {
    let request: ModelRequest | null = null;
    await runLessonAiJob({
      ...base,
      job: job({
        message: 'Now shorter',
        history: [
          { role: 'assistant', content: 'Hello' },
          { role: 'user', content: 'First' },
          { role: 'user', content: 'Second' }
        ]
      }),
      complete: async (r) => {
        request = r;
        return { stop_reason: 'end_turn', content: [] };
      }
    });
    expect(request!.messages).toEqual([{ role: 'user', content: 'First\n\nSecond\n\nNow shorter' }]);
  });
});

describe('prompt caching', () => {
  it('builds a byte-identical static prefix on every call', () => {
    const a = buildAiStaticPrompt({ agentName: 'Ann', protocol: 'P' });
    const b = buildAiStaticPrompt({ agentName: 'Ann', protocol: 'P' });
    expect(a).toBe(b);
  });

  it('estimates cost from usage', () => {
    expect(
      estimateCostUsd('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 0 })
    ).toBe(2);
    expect(estimateCostUsd('unknown', { input_tokens: 10 })).toBe(0);
  });
});
