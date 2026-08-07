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

test('sends the system prompt as a cacheable block so repeat calls in one conversation stay cheap', async () => {
  let requestBody;
  const client = createAnthropicClient({
    apiKey: 'k',
    fetchImpl: async (url, init) => {
      requestBody = JSON.parse(init.body);
      return sseResponse([frame('message_stop', {})]);
    }
  });

  for await (const event of client.streamMessage({ system: 'You are Brisket Lasso.', messages: [], tools: [] })) void event;

  assert.deepEqual(requestBody.system, [
    { type: 'text', text: 'You are Brisket Lasso.', cache_control: { type: 'ephemeral', ttl: '1h' } }
  ]);
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

test('continues the stream after executeTools returns a search result', async () => {
  const first = [
    frame('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'call_1', name: 'search_exercise_library' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"bar press"}' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_stop', {})
  ];
  const second = [
    frame('content_block_start', { index: 0, content_block: { type: 'text' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Found Bar Press' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_stop', {})
  ];

  let calls = 0;
  const bodies = [];
  const client = createAnthropicClient({
    apiKey: 'k',
    fetchImpl: async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(init.body));
      return sseResponse(calls === 1 ? first : second);
    }
  });

  const executeCalls = [];
  const events = [];
  for await (const event of client.streamMessage({
    system: 's',
    messages: [{ role: 'user', content: 'find bar press' }],
    tools: [],
    executeTools: async event => {
      executeCalls.push(event);
      return [{ name: 'Bar Press', target_area: 'Chest' }];
    }
  })) events.push(event);

  assert.equal(calls, 2);
  assert.equal(executeCalls.length, 1);
  assert.equal(executeCalls[0].name, 'search_exercise_library');
  assert.equal(bodies[1].messages.at(-1).role, 'user');
  assert.equal(bodies[1].messages.at(-1).content[0].type, 'tool_result');
  assert.deepEqual(events, [
    { type: 'text', delta: 'Found Bar Press' },
    { type: 'done' }
  ]);
});

test('yields fire-and-forget tool_calls when executeTools returns null', async () => {
  const frames = [
    frame('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'call_1', name: 'log_entry' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{"type":"meal"}' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_stop', {})
  ];
  let calls = 0;
  const client = createAnthropicClient({
    apiKey: 'k',
    fetchImpl: async () => {
      calls += 1;
      return sseResponse(frames);
    }
  });

  const events = [];
  for await (const event of client.streamMessage({
    system: '',
    messages: [],
    tools: [],
    executeTools: async () => null
  })) events.push(event);

  assert.equal(calls, 1);
  assert.deepEqual(events, [
    { type: 'tool_call', id: 'call_1', name: 'log_entry', input: { type: 'meal' } },
    { type: 'done' }
  ]);
});

test('continues when stop_reason is pause_turn by re-sending assistant content as-is', async () => {
  const first = [
    frame('content_block_start', {
      index: 0,
      content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search' }
    }),
    frame('content_block_delta', {
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"query":"bacon egg roll sodium AU"}' }
    }),
    frame('content_block_stop', { index: 0 }),
    frame('message_delta', { delta: { stop_reason: 'pause_turn' } }),
    frame('message_stop', {})
  ];
  const second = [
    frame('content_block_start', { index: 0, content_block: { type: 'text' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'About 850 mg sodium.' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_delta', { delta: { stop_reason: 'end_turn' } }),
    frame('message_stop', {})
  ];

  let calls = 0;
  const bodies = [];
  const client = createAnthropicClient({
    apiKey: 'k',
    fetchImpl: async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(init.body));
      return sseResponse(calls === 1 ? first : second);
    }
  });

  const events = [];
  for await (const event of client.streamMessage({
    system: 's',
    messages: [{ role: 'user', content: 'bacon and egg roll' }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }]
  })) events.push(event);

  assert.equal(calls, 2);
  const continued = bodies[1].messages.at(-1);
  assert.equal(continued.role, 'assistant');
  assert.ok(continued.content.some(block => block.type === 'server_tool_use' && block.id === 'srvtoolu_1'));
  assert.deepEqual(
    events.filter(e => e.type === 'search' || e.type === 'text' || e.type === 'done'),
    [
      { type: 'search', query: 'bacon egg roll sodium AU' },
      { type: 'text', delta: 'About 850 mg sodium.' },
      { type: 'done' }
    ]
  );
});

test('client tool continuation preserves prior server_tool_use blocks in the assistant message', async () => {
  const first = [
    frame('content_block_start', {
      index: 0,
      content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search' }
    }),
    frame('content_block_delta', {
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"query":"quest bar"}' }
    }),
    frame('content_block_stop', { index: 0 }),
    frame('content_block_start', {
      index: 1,
      content_block: { type: 'tool_use', id: 'call_1', name: 'save_food_library_entry' }
    }),
    frame('content_block_delta', {
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"name":"Quest Bar"}' }
    }),
    frame('content_block_stop', { index: 1 }),
    frame('message_delta', { delta: { stop_reason: 'tool_use' } }),
    frame('message_stop', {})
  ];
  const second = [
    frame('content_block_start', { index: 0, content_block: { type: 'text' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Logged.' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_stop', {})
  ];

  let calls = 0;
  const bodies = [];
  const client = createAnthropicClient({
    apiKey: 'k',
    fetchImpl: async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(init.body));
      return sseResponse(calls === 1 ? first : second);
    }
  });

  const events = [];
  for await (const event of client.streamMessage({
    system: 's',
    messages: [{ role: 'user', content: 'quest bar' }],
    tools: [],
    executeTools: async () => JSON.stringify({ ok: true })
  })) events.push(event);

  assert.equal(calls, 2);
  const assistant = bodies[1].messages.at(-2);
  assert.equal(assistant.role, 'assistant');
  assert.ok(assistant.content.some(b => b.type === 'server_tool_use'));
  assert.ok(assistant.content.some(b => b.type === 'tool_use' && b.id === 'call_1'));
  assert.ok(events.some(e => e.type === 'text' && e.delta === 'Logged.'));
});

test('replays completed thinking blocks on tool continuation and drops incomplete ones', async () => {
  const first = [
    frame('content_block_start', { index: 0, content_block: { type: 'thinking' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'Need sodium for the wrap.' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'sig_abc' } }),
    frame('content_block_stop', { index: 0 }),
    frame('content_block_start', {
      index: 1,
      content_block: { type: 'tool_use', id: 'call_1', name: 'save_food_library_entry' }
    }),
    frame('content_block_delta', {
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"name":"Chicken Caesar Wrap"}' }
    }),
    frame('content_block_stop', { index: 1 }),
    frame('message_delta', { delta: { stop_reason: 'tool_use' } }),
    frame('message_stop', {})
  ];
  const second = [
    frame('content_block_start', { index: 0, content_block: { type: 'text' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Logged the wrap.' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_stop', {})
  ];

  let calls = 0;
  const bodies = [];
  const client = createAnthropicClient({
    apiKey: 'k',
    fetchImpl: async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(init.body));
      return sseResponse(calls === 1 ? first : second);
    }
  });

  for await (const event of client.streamMessage({
    system: 's',
    messages: [{ role: 'user', content: 'log wrap' }],
    tools: [],
    executeTools: async () => JSON.stringify({ ok: true })
  })) void event;

  assert.equal(calls, 2);
  const assistant = bodies[1].messages.at(-2);
  assert.deepEqual(assistant.content[0], {
    type: 'thinking',
    thinking: 'Need sodium for the wrap.',
    signature: 'sig_abc'
  });
  assert.equal(assistant.content[1].type, 'tool_use');
});

test('stub tool_results cover fire-and-forget tool_use when another tool continues the round', async () => {
  const first = [
    frame('content_block_start', {
      index: 0,
      content_block: { type: 'tool_use', id: 'call_log', name: 'log_entry' }
    }),
    frame('content_block_delta', {
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"type":"meal"}' }
    }),
    frame('content_block_stop', { index: 0 }),
    frame('content_block_start', {
      index: 1,
      content_block: { type: 'tool_use', id: 'call_save', name: 'save_food_library_entry' }
    }),
    frame('content_block_delta', {
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"name":"Wrap"}' }
    }),
    frame('content_block_stop', { index: 1 }),
    frame('message_stop', {})
  ];
  const second = [
    frame('content_block_start', { index: 0, content_block: { type: 'text' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Done.' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_stop', {})
  ];

  let calls = 0;
  const bodies = [];
  const client = createAnthropicClient({
    apiKey: 'k',
    fetchImpl: async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(init.body));
      return sseResponse(calls === 1 ? first : second);
    }
  });

  const events = [];
  for await (const event of client.streamMessage({
    system: 's',
    messages: [{ role: 'user', content: 'log wrap' }],
    tools: [],
    executeTools: async event => (event.name === 'save_food_library_entry'
      ? JSON.stringify({ ok: true })
      : null)
  })) events.push(event);

  assert.equal(calls, 2);
  const toolResults = bodies[1].messages.at(-1).content;
  assert.equal(toolResults.length, 2);
  assert.deepEqual(
    toolResults.map(block => block.tool_use_id).sort(),
    ['call_log', 'call_save']
  );
  assert.ok(events.some(e => e.type === 'tool_call' && e.id === 'call_log'));
  assert.ok(events.some(e => e.type === 'text' && e.delta === 'Done.'));
});
