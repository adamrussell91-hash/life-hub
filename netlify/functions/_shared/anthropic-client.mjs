const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';

export class AnthropicClientError extends Error {
  constructor(code, retryable) {
    super('Anthropic request failed.');
    this.name = 'AnthropicClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function createAnthropicClient({ apiKey, fetchImpl = fetch } = {}) {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new TypeError('An Anthropic API key is required.');
  }

  return {
    async *streamMessage({ system, messages, tools, signal }) {
      let response;
      try {
        response = await fetchImpl(`${ANTHROPIC_ORIGIN}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': API_VERSION
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 4096,
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
            messages,
            tools,
            stream: true
          }),
          signal
        });
      } catch {
        throw new AnthropicClientError('anthropic_unavailable', true);
      }
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new AnthropicClientError(retryable ? 'anthropic_unavailable' : 'anthropic_request_failed', retryable);
      }
      if (!response.body) throw new AnthropicClientError('anthropic_invalid_response', true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const toolBuffers = new Map();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = parseFrame(frame);
            if (event) yield* interpretEvent(event, toolBuffers);
          }
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new AnthropicClientError('anthropic_unavailable', true);
      }
    }
  };
}

function parseFrame(frame) {
  let eventName = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { name: eventName, payload: JSON.parse(data) };
  } catch {
    return null;
  }
}

function* interpretEvent(event, toolBuffers) {
  if (event.name === 'content_block_start') {
    const blockType = event.payload.content_block?.type;
    if (blockType === 'tool_use' || blockType === 'server_tool_use') {
      toolBuffers.set(event.payload.index, {
        blockType,
        name: event.payload.content_block.name,
        id: event.payload.content_block.id,
        json: ''
      });
    }
    return;
  }
  if (event.name === 'content_block_delta') {
    const delta = event.payload.delta;
    if (delta?.type === 'text_delta') {
      yield { type: 'text', delta: delta.text };
    } else if (delta?.type === 'input_json_delta') {
      const buffered = toolBuffers.get(event.payload.index);
      if (buffered) buffered.json += delta.partial_json;
    }
    return;
  }
  if (event.name === 'content_block_stop') {
    const buffered = toolBuffers.get(event.payload.index);
    if (buffered) {
      toolBuffers.delete(event.payload.index);
      let input;
      try {
        input = JSON.parse(buffered.json || '{}');
      } catch {
        input = null;
      }
      if (buffered.blockType === 'server_tool_use') {
        if (buffered.name === 'web_search') yield { type: 'search', query: input?.query ?? null };
      } else {
        yield { type: 'tool_call', id: buffered.id, name: buffered.name, input };
      }
    }
    return;
  }
  if (event.name === 'message_stop') yield { type: 'done' };
}
