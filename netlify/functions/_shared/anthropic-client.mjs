const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 8192;
const MAX_TOOL_ROUNDS = 6;
const MAX_PAUSE_CONTINUATIONS = 3;

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
    async *streamMessage({ system, messages, tools, signal, executeTools }) {
      let roundMessages = messages;
      let pauseContinuations = 0;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const pendingResults = [];
        const roundState = { assistantBlocks: [], stopReason: null };
        let sawDone = false;

        for await (const event of streamOnce({
          apiKey,
          fetchImpl,
          system,
          messages: roundMessages,
          tools,
          signal,
          roundState
        })) {
          if (event.type === 'done') {
            sawDone = true;
            continue;
          }

          if (event.type === 'tool_call' && typeof executeTools === 'function') {
            const result = await executeTools(event);
            if (result != null) {
              pendingResults.push({ toolCall: event, result });
              continue;
            }
          }

          yield event;
        }

        if (pendingResults.length > 0) {
          const resultsById = new Map(
            pendingResults.map(({ toolCall, result }) => [toolCall.id, { toolCall, result }])
          );
          for (const block of roundState.assistantBlocks) {
            if (block?.type === 'tool_use' && typeof block.id === 'string' && !resultsById.has(block.id)) {
              // Tools not handled by executeTools still need a matching tool_result.
              // Prefer returning real results from executeTools (e.g. log_entry validation).
              resultsById.set(block.id, {
                toolCall: { id: block.id, name: block.name, input: block.input },
                result: JSON.stringify({ ok: true, status: 'client_handled' })
              });
            }
          }
          const orderedResults = [];
          for (const block of roundState.assistantBlocks) {
            if (block?.type === 'tool_use' && resultsById.has(block.id)) {
              orderedResults.push(resultsById.get(block.id));
              resultsById.delete(block.id);
            }
          }
          for (const leftover of resultsById.values()) orderedResults.push(leftover);

          const assistantContent = roundState.assistantBlocks.length > 0
            ? sanitizeAssistantBlocks(roundState.assistantBlocks)
            : orderedResults.map(({ toolCall }) => ({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.input ?? {}
            }));
          roundMessages = [
            ...roundMessages,
            { role: 'assistant', content: assistantContent },
            {
              role: 'user',
              content: orderedResults.map(({ toolCall, result }) => ({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: typeof result === 'string' ? result : JSON.stringify(result)
              }))
            }
          ];
          continue;
        }

        if (
          roundState.stopReason === 'pause_turn'
          && pauseContinuations < MAX_PAUSE_CONTINUATIONS
          && roundState.assistantBlocks.length > 0
        ) {
          pauseContinuations += 1;
          roundMessages = [
            ...roundMessages,
            { role: 'assistant', content: sanitizeAssistantBlocks(roundState.assistantBlocks) }
          ];
          continue;
        }

        if (sawDone) yield { type: 'done' };
        return;
      }

      yield { type: 'done' };
    }
  };
}

async function* streamOnce({ apiKey, fetchImpl, system, messages, tools, signal, roundState }) {
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
        max_tokens: MAX_TOKENS,
        // Sonnet 5 thinks by default; thinking tokens count toward max_tokens and
        // routinely burn 40s+ before the first visible token on CN audits — past
        // Netlify's function budget, which surfaces as a stalled/empty chat turn.
        thinking: { type: 'disabled' },
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
        if (event) yield* interpretEvent(event, toolBuffers, roundState);
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AnthropicClientError('anthropic_unavailable', true);
  }
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

function sanitizeAssistantBlocks(blocks) {
  return blocks.flatMap(block => {
    if (block?.type !== 'thinking') return [block];
    // Adaptive/extended thinking streams thinking + signature across deltas.
    // Replaying a start-only clone (missing `thinking`) 400s the next round.
    if (typeof block.thinking !== 'string') return [];
    if (block.thinking.length === 0 && typeof block.signature !== 'string') return [];
    return [block];
  });
}

function* interpretEvent(event, toolBuffers, roundState) {
  if (event.name === 'content_block_start') {
    const block = event.payload.content_block;
    const blockType = block?.type;
    if (blockType === 'tool_use' || blockType === 'server_tool_use') {
      toolBuffers.set(event.payload.index, {
        blockType,
        name: block.name,
        id: block.id,
        json: ''
      });
    } else if (blockType === 'text') {
      toolBuffers.set(event.payload.index, { blockType: 'text', text: '' });
    } else if (blockType === 'thinking') {
      toolBuffers.set(event.payload.index, {
        blockType: 'thinking',
        thinking: typeof block.thinking === 'string' ? block.thinking : '',
        signature: typeof block.signature === 'string' ? block.signature : undefined
      });
    } else if (block && typeof blockType === 'string') {
      // Complete blocks (web_search_tool_result, redacted_thinking, etc.).
      roundState?.assistantBlocks.push(structuredClone(block));
    }
    return;
  }
  if (event.name === 'content_block_delta') {
    const delta = event.payload.delta;
    const buffered = toolBuffers.get(event.payload.index);
    if (delta?.type === 'text_delta') {
      yield { type: 'text', delta: delta.text };
      if (buffered?.blockType === 'text') buffered.text += delta.text ?? '';
    } else if (delta?.type === 'input_json_delta') {
      if (buffered) buffered.json += delta.partial_json;
    } else if (delta?.type === 'thinking_delta') {
      if (buffered?.blockType === 'thinking') buffered.thinking += delta.thinking ?? '';
    } else if (delta?.type === 'signature_delta') {
      if (buffered?.blockType === 'thinking') {
        buffered.signature = `${buffered.signature ?? ''}${delta.signature ?? ''}`;
      }
    }
    return;
  }
  if (event.name === 'content_block_stop') {
    const buffered = toolBuffers.get(event.payload.index);
    if (buffered) {
      toolBuffers.delete(event.payload.index);
      if (buffered.blockType === 'text') {
        roundState?.assistantBlocks.push({ type: 'text', text: buffered.text });
        return;
      }
      if (buffered.blockType === 'thinking') {
        const thinkingBlock = { type: 'thinking', thinking: buffered.thinking };
        if (typeof buffered.signature === 'string' && buffered.signature.length > 0) {
          thinkingBlock.signature = buffered.signature;
        }
        roundState?.assistantBlocks.push(thinkingBlock);
        return;
      }
      let input;
      try {
        input = JSON.parse(buffered.json || '{}');
      } catch {
        input = null;
      }
      if (buffered.blockType === 'server_tool_use') {
        roundState?.assistantBlocks.push({
          type: 'server_tool_use',
          id: buffered.id,
          name: buffered.name,
          input: input ?? {}
        });
        if (buffered.name === 'web_search') yield { type: 'search', query: input?.query ?? null };
      } else {
        roundState?.assistantBlocks.push({
          type: 'tool_use',
          id: buffered.id,
          name: buffered.name,
          input: input ?? {}
        });
        yield { type: 'tool_call', id: buffered.id, name: buffered.name, input };
      }
    }
    return;
  }
  if (event.name === 'message_delta') {
    const reason = event.payload.delta?.stop_reason;
    if (reason != null && roundState) roundState.stopReason = reason;
    return;
  }
  if (event.name === 'message_stop') yield { type: 'done' };
}
