// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  createAnthropicStreamer,
  DEFAULT_MODEL,
  messageForAnthropicHttpError
} from '../../netlify/functions/_shared/anthropic-stream.mts';
import { CURRENT_SONNET_MODEL } from '@/ai/models';

const SSE_REPLY = [
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
  'data: {"type":"message_stop"}',
  ''
].join('\n');

async function modelSentFor(model?: string): Promise<string> {
  const fetchImpl = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(SSE_REPLY, { status: 200 })
  );
  const streamer = createAnthropicStreamer('test-key', fetchImpl as unknown as typeof fetch);
  for await (const _event of streamer.streamMessage({
    system: 'S',
    messages: [{ role: 'user', content: 'Hi' }],
    tools: [],
    model
  })) {
    /* drain */
  }
  const init = fetchImpl.mock.calls[0]?.[1];
  return (JSON.parse(String(init?.body)) as { model: string }).model;
}

describe('messageForAnthropicHttpError', () => {
  it('points at Netlify env when Anthropic rejects the key', () => {
    expect(
      messageForAnthropicHttpError(
        401,
        JSON.stringify({ error: { type: 'authentication_error', message: 'invalid x-api-key' } })
      )
    ).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('surfaces model rejection details', () => {
    expect(
      messageForAnthropicHttpError(
        404,
        JSON.stringify({ error: { type: 'not_found_error', message: 'model: claude-x' } })
      )
    ).toContain('claude-x');
  });

  it('marks rate limits clearly', () => {
    expect(
      messageForAnthropicHttpError(
        429,
        JSON.stringify({ error: { type: 'rate_limit_error', message: 'Overloaded' } })
      )
    ).toMatch(/rate limit/i);
  });
});

describe('createAnthropicStreamer model resolution', () => {
  it('sends the current model when the caller asks for a retired one', async () => {
    await expect(modelSentFor('claude-sonnet-4-20250514')).resolves.toBe(CURRENT_SONNET_MODEL);
  });

  it('defaults when the caller sends no model', async () => {
    await expect(modelSentFor()).resolves.toBe(DEFAULT_MODEL);
  });
});
