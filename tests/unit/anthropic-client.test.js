import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicClient, AnthropicClientError } from '../../netlify/functions/_shared/anthropic-client.mjs';

function frame(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function sseResponse(frames, status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of frames) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  return new Response(body, { status });
}

test('streams text deltas and a completed tool call from a mocked response', async () => {
  const frames = [
    frame('content_block_start', { index: 0, content_block: { type: 'text' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Logging that ' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'now.' } }),
    frame('content_block_stop', { index: 0 }),
    frame('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'call_1', name: 'log_entry' } }),
    frame('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"type":"meal",' } }),
    frame('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '"date":"2026-08-01","fields":{}}' } }),
    frame('content_block_stop', { index: 1 }),
    frame('message_stop', {})
  ];
  const client = createAnthropicClient({ apiKey: 'k', fetchImpl: async () => sseResponse(frames) });

  const events = [];
  for await (const event of client.streamMessage({ system: 's', messages: [], tools: [] })) events.push(event);

  assert.deepEqual(events, [
    { type: 'text', delta: 'Logging that ' },
    { type: 'text', delta: 'now.' },
    { type: 'tool_call', id: 'call_1', name: 'log_entry', input: { type: 'meal', date: '2026-08-01', fields: {} } },
    { type: 'done' }
  ]);
});

test('maps a 429 response to a retryable error before reading a body', async () => {
  const client = createAnthropicClient({ apiKey: 'k', fetchImpl: async () => new Response(null, { status: 429 }) });
  await assert.rejects(
    (async () => {
      for await (const event of client.streamMessage({ system: '', messages: [], tools: [] })) void event;
    })(),
    error => error instanceof AnthropicClientError && error.code === 'anthropic_unavailable' && error.retryable === true
  );
});

test('requires a non-empty API key', () => {
  assert.throws(() => createAnthropicClient({ apiKey: '' }), TypeError);
});

test('yields a null input when the accumulated tool-call JSON never parses', async () => {
  const frames = [
    frame('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'call_1', name: 'log_entry' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{not valid json' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_stop', {})
  ];
  const client = createAnthropicClient({ apiKey: 'k', fetchImpl: async () => sseResponse(frames) });

  const events = [];
  for await (const event of client.streamMessage({ system: '', messages: [], tools: [] })) events.push(event);

  assert.deepEqual(events, [
    { type: 'tool_call', id: 'call_1', name: 'log_entry', input: null },
    { type: 'done' }
  ]);
});

test('maps a 401 response to a non-retryable error', async () => {
  const client = createAnthropicClient({ apiKey: 'k', fetchImpl: async () => new Response(null, { status: 401 }) });
  await assert.rejects(
    (async () => {
      for await (const event of client.streamMessage({ system: '', messages: [], tools: [] })) void event;
    })(),
    error => error instanceof AnthropicClientError && error.code === 'anthropic_request_failed' && error.retryable === false
  );
});

test('re-throws the underlying error unwrapped when the caller has aborted', async () => {
  const abortController = new AbortController();
  const abortError = new DOMException('The operation was aborted.', 'AbortError');
  const body = new ReadableStream({
    pull() {
      abortController.abort();
      throw abortError;
    }
  });
  const client = createAnthropicClient({ apiKey: 'k', fetchImpl: async () => new Response(body, { status: 200 }) });

  await assert.rejects(
    (async () => {
      for await (const event of client.streamMessage({
        system: '', messages: [], tools: [], signal: abortController.signal
      })) void event;
    })(),
    error => error === abortError
  );
});
