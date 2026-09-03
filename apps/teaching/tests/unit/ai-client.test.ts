import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_STREAM_STALL_MS, streamAiChat, type AiStreamEvent } from '@/ai/client';

const payload = {
  lesson_id: 'lesson_1',
  agent: 'ann' as const,
  message: 'Build a lesson'
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('streamAiChat', () => {
  it('emits a retryable error when the SSE stream goes idle after Thinking…', async () => {
    vi.useFakeTimers();
    const events: AiStreamEvent[] = [];

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"status","text":"Thinking…"}\n\n'));
      }
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body,
        json: async () => ({})
      })
    );

    const done = streamAiChat(payload, (event) => {
      events.push(event);
    });

    for (let i = 0; i < 50 && !events.some((event) => event.type === 'status'); i += 1) {
      await Promise.resolve();
    }
    expect(events.some((event) => event.type === 'status' && event.text === 'Thinking…')).toBe(
      true
    );

    await vi.advanceTimersByTimeAsync(AI_STREAM_STALL_MS + 50);
    await done;

    expect(events.some((event) => event.type === 'status' && event.text === 'Thinking…')).toBe(
      true
    );
    const error = events.find((event) => event.type === 'error');
    expect(error).toMatchObject({ type: 'error', retryable: true });
    expect(error && error.type === 'error' ? error.message : '').toMatch(/try again/i);
  });

  it('emits a retryable error when the stream closes without a done event', async () => {
    const events: AiStreamEvent[] = [];
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"status","text":"Thinking…"}\n\n'));
        controller.close();
      }
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body,
        json: async () => ({})
      })
    );

    await streamAiChat(payload, (event) => {
      events.push(event);
    });

    expect(events.some((event) => event.type === 'error' && event.retryable)).toBe(true);
  });
});
