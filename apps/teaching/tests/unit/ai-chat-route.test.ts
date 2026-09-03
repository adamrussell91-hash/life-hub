// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fakeStore } = vi.hoisted(() => {
  class FakeStore {
    private readonly data = new Map<string, unknown>();

    reset(): void {
      this.data.clear();
    }

    seed(key: string, value: unknown): void {
      this.data.set(key, value);
    }

    async get(key: string, opts?: { type?: string }): Promise<unknown> {
      if (!this.data.has(key)) return null;
      const value = this.data.get(key);
      return opts?.type === 'json' ? value : JSON.stringify(value);
    }

    async setJSON(key: string, value: unknown): Promise<void> {
      this.data.set(key, value);
    }

    async list({ prefix = '' }: { prefix?: string } = {}): Promise<{
      blobs: { key: string; etag: string }[];
      directories: string[];
    }> {
      return {
        blobs: [...this.data.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key, etag: 'fake-etag' })),
        directories: []
      };
    }
  }

  return { fakeStore: new FakeStore() };
});

vi.mock('../../netlify/functions/_shared/blobs.mts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../netlify/functions/_shared/blobs.mts')>();
  return { ...actual, getContentStore: () => fakeStore };
});

const { draftLessonKey } = await import('../../netlify/functions/_shared/blobs.mts');
const { createSessionToken } = await import('../../netlify/functions/_shared/auth-security.mts');
const { BRAVE_SEARCH_MESSAGE_MAX_CHARS } = await import(
  '../../netlify/functions/_shared/brave-search.mts'
);
const { default: handler, config: chatRouteConfig, AI_STREAM_HEARTBEAT_MS } = await import(
  '../../netlify/functions/ai-chat.mts'
);
const { AI_STREAM_STALL_MS } = await import('../../src/ai/client.ts');

const FUNCTION_ORIGIN = 'https://api.example.netlify.app';
const SESSION_SECRET = 's'.repeat(32);
const NOW = '2026-08-16T10:00:00.000Z';
const LESSON_ID = 'lesson_cheese';
const MESSAGE = 'build a 10 point mind map on cheese types';
const BRAVE_PATHS = [
  '/res/v1/web/search',
  '/res/v1/images/search',
  '/res/v1/videos/search'
] as const;

const WEB_FIXTURE = {
  web: {
    results: [
      {
        title: 'Cheese',
        url: 'https://www.britannica.com/topic/cheese',
        description: 'Cheese varieties differ by milk, production, texture, and ageing.'
      }
    ]
  }
};
const IMAGE_FIXTURE = {
  results: [
    {
      title: 'Cheese wheel',
      url: 'https://www.britannica.com/topic/cheese',
      properties: { url: 'https://images.example/cheese.jpg', width: 1200, height: 800 }
    }
  ]
};
const VIDEO_FIXTURE = {
  results: [
    {
      title: 'How cheese is made',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    }
  ]
};

function baseBlock(overrides: Record<string, unknown>) {
  return {
    id: 'block_heading',
    type: 'block',
    block_type: 'heading',
    variant: 'page',
    visibility: 'student_teacher',
    content: { text: 'Cheese' },
    layout: {},
    print: {},
    settings: {},
    created_at: NOW,
    updated_at: NOW,
    schema_version: 1,
    ...overrides
  };
}

function lesson() {
  return {
    id: LESSON_ID,
    type: 'lesson',
    title: 'Food science',
    slug: 'food-science',
    unit_id: 'unit_food',
    sequence: 1,
    blocks: [baseBlock({})],
    status: 'active',
    created_at: NOW,
    updated_at: NOW,
    schema_version: 1
  };
}

function mindMapBlock() {
  const nodes = [
    { id: 'cheese-types', label: 'Cheese types', parent_id: null },
    ...['Fresh', 'Soft', 'Semi-soft', 'Hard', 'Blue', 'Washed-rind', 'Goat', 'Sheep', 'Processed'].map(
      (label, index) => ({ id: `type-${index + 1}`, label, parent_id: 'cheese-types' })
    )
  ];
  return baseBlock({
    id: 'mind-map-cheese',
    block_type: 'mind_map',
    variant: 'medium',
    content: {
      title: 'Cheese types',
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        id: `edge-${index + 1}`,
        from: 'cheese-types',
        to: node.id
      }))
    }
  });
}

function imageBlock(url: string) {
  return baseBlock({
    id: 'image-cheese',
    block_type: 'image',
    variant: 'large',
    content: { url, alt_text: 'Cheese' }
  });
}

function anthropicToolReply(name: string, input: unknown): Response {
  const partialJson = JSON.stringify(input);
  const lines = [
    {
      type: 'message_start',
      message: { usage: { input_tokens: 10 } }
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool_1', name }
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: partialJson }
    },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_stop' }
  ];
  return new Response(`${lines.map((event) => `data: ${JSON.stringify(event)}`).join('\n')}\n`);
}

function anthropicDoneReply(): Response {
  return new Response('data: {"type":"message_stop"}\n');
}

function sessionCookie(): string {
  const { token } = createSessionToken({ now: Date.now() }, SESSION_SECRET);
  return `teaching_hub_session=${token}`;
}

function chatRequest(message = MESSAGE): Request {
  return new Request(`${FUNCTION_ORIGIN}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: sessionCookie()
    },
    body: JSON.stringify({
      lesson_id: LESSON_ID,
      agent: 'ann',
      scope: 'lesson',
      message
    })
  });
}

function braveQueryParams(fetchMock: ReturnType<typeof destinationFetch>): string[] {
  return fetchMock.mock.calls
    .map(([input]) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : (input as Request).url
      );
      return url.origin === 'https://api.search.brave.com' ? url.searchParams.get('q') : null;
    })
    .filter((q): q is string => typeof q === 'string');
}

function destinationFetch(
  toolInput: unknown,
  options: { braveFails?: boolean; toolName?: string } = {}
) {
  let anthropicCalls = 0;
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin === 'https://api.search.brave.com') {
      if (options.braveFails) return new Response('unavailable', { status: 503 });
      if (url.pathname === BRAVE_PATHS[0]) return Response.json(WEB_FIXTURE);
      if (url.pathname === BRAVE_PATHS[1]) return Response.json(IMAGE_FIXTURE);
      if (url.pathname === BRAVE_PATHS[2]) return Response.json(VIDEO_FIXTURE);
    }
    if (url.origin === 'https://api.anthropic.com') {
      anthropicCalls += 1;
      return anthropicCalls === 1
        ? anthropicToolReply(options.toolName ?? 'propose_insert_blocks', toolInput)
        : anthropicDoneReply();
    }
    throw new Error(`Unexpected fetch destination: ${url}`);
  });
}

function anthropicBodies(fetchMock: ReturnType<typeof destinationFetch>): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([input]) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : (input as Request).url
      );
      return url.origin === 'https://api.anthropic.com';
    })
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

beforeEach(() => {
  fakeStore.reset();
  fakeStore.seed(draftLessonKey(LESSON_ID), lesson());
  process.env.TEACHING_HUB_PASSPHRASE_HASH =
    'scrypt$v1$16384$8$1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
  process.env.BRAVE_SEARCH_API_KEY = 'brave-test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.TEACHING_HUB_PASSPHRASE_HASH;
  delete process.env.SESSION_SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
});

describe('POST /api/ai/chat mandatory web search', () => {
  it('grounds a mind-map proposal in all three Brave search lanes', async () => {
    const toolInput = { position: 'below', blocks: [mindMapBlock()] };
    const fetchMock = destinationFetch(toolInput);
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(chatRequest());
    const text = await response.text();
    const braveCalls = fetchMock.mock.calls.filter(([input]) =>
      String(typeof input === 'string' || input instanceof URL ? input : (input as Request).url).startsWith(
        'https://api.search.brave.com'
      )
    );

    expect(response.status).toBe(200);
    expect(braveCalls).toHaveLength(3);
    for (const [input] of braveCalls) {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : (input as Request).url
      );
      expect(url.searchParams.get('q')).toBe(`${MESSAGE}\nLesson: Food science`);
    }
    expect(anthropicBodies(fetchMock)[0]?.system).toContain('## Search pack');
    expect(anthropicBodies(fetchMock)[0]?.system).toContain('britannica.com');
    expect(text).toContain('"block_type":"mind_map"');
  });

  it('emits tool_error and suppresses an invented image proposal', async () => {
    const inventedUrl = 'https://invented.example/cheese.jpg';
    const fetchMock = destinationFetch({
      position: 'below',
      blocks: [imageBlock(inventedUrl)]
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(chatRequest());
    const text = await response.text();

    expect(text).toContain('"type":"tool_error"');
    expect(text).toContain(`blocks[0].content.url=${inventedUrl}`);
    expect(text).not.toContain('"type":"proposal"');
    expect(anthropicBodies(fetchMock)).toHaveLength(2);
  });

  it('still sends an unavailable pack to Anthropic and accepts text-only structure', async () => {
    const fetchMock = destinationFetch(
      { position: 'below', blocks: [mindMapBlock()] },
      { braveFails: true }
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(chatRequest());
    const text = await response.text();
    const firstAnthropicBody = anthropicBodies(fetchMock)[0];

    expect(response.status).toBe(200);
    expect(
      fetchMock.mock.calls.filter(([input]) => {
        const url = new URL(
          typeof input === 'string' || input instanceof URL ? input : (input as Request).url
        );
        return url.origin === 'https://api.search.brave.com';
      })
    ).toHaveLength(3);
    expect(firstAnthropicBody?.system).toContain('"available":false');
    expect(text).toContain('"type":"proposal"');
    expect(text).toContain('"block_type":"mind_map"');
  });

  it('rejects media when every Brave search lane is unavailable', async () => {
    const inventedUrl = 'https://invented.example/outage-cheese.jpg';
    const fetchMock = destinationFetch(
      { position: 'below', blocks: [imageBlock(inventedUrl)] },
      { braveFails: true }
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(chatRequest());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('"type":"tool_error"');
    expect(text).toContain(`blocks[0].content.url=${inventedUrl}`);
    expect(text).not.toContain('"type":"proposal"');
  });

  it('truncates over-length teacher messages so Brave search stays available', async () => {
    const longMessage = `${'x'.repeat(1200)} ${MESSAGE}`;
    expect(longMessage.length).toBeGreaterThan(BRAVE_SEARCH_MESSAGE_MAX_CHARS);
    expect(longMessage.length).toBeLessThanOrEqual(8000);

    const fetchMock = destinationFetch({ position: 'below', blocks: [mindMapBlock()] });
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(chatRequest(longMessage));
    const text = await response.text();
    const queries = braveQueryParams(fetchMock);

    expect(response.status).toBe(200);
    expect(queries).toHaveLength(3);
    for (const q of queries) {
      expect(q).toContain('\nLesson: Food science');
      expect(q.startsWith(longMessage.slice(0, BRAVE_SEARCH_MESSAGE_MAX_CHARS))).toBe(true);
      expect(q.includes(longMessage)).toBe(false);
      expect(q.length).toBeLessThan(longMessage.length);
    }
    expect(anthropicBodies(fetchMock)[0]?.system).toContain('"available":true');
    expect(anthropicBodies(fetchMock)[0]?.system).toContain('britannica.com');
    expect(text).toContain('"block_type":"mind_map"');
  });

  it('opens the SSE stream with Thinking before Brave search returns', async () => {
    let releaseBrave: () => void = () => undefined;
    const braveHeld = new Promise<void>((resolve) => {
      releaseBrave = resolve;
    });

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url
      );
      if (url.origin === 'https://api.search.brave.com') {
        await braveHeld;
        if (url.pathname === BRAVE_PATHS[0]) return Response.json(WEB_FIXTURE);
        if (url.pathname === BRAVE_PATHS[1]) return Response.json(IMAGE_FIXTURE);
        if (url.pathname === BRAVE_PATHS[2]) return Response.json(VIDEO_FIXTURE);
      }
      if (url.origin === 'https://api.anthropic.com') {
        return anthropicDoneReply();
      }
      throw new Error(`Unexpected fetch destination: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await Promise.race([
        handler(chatRequest()),
        new Promise<Response>((_, reject) => {
          setTimeout(
            () => reject(new Error('handler blocked on Brave search before opening the stream')),
            200
          );
        })
      ]);

      expect(response.status).toBe(200);
      expect(response.body).toBeTruthy();

      reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!buffer.includes('Thinking')) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }

      expect(buffer).toContain('Thinking');
    } finally {
      releaseBrave();
      await reader?.cancel().catch(() => undefined);
    }
  });

  it('keeps the SSE stream alive while generation has no browser-visible events', async () => {
    vi.useFakeTimers();
    let releaseBrave: () => void = () => undefined;
    const braveHeld = new Promise<void>((resolve) => {
      releaseBrave = resolve;
    });

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url
      );
      if (url.origin === 'https://api.search.brave.com') {
        await braveHeld;
        return Response.json(WEB_FIXTURE);
      }
      if (url.origin === 'https://api.anthropic.com') return anthropicDoneReply();
      throw new Error(`Unexpected fetch destination: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(chatRequest());
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    try {
      expect(decoder.decode((await reader.read()).value)).toContain('Thinking');
      expect(decoder.decode((await reader.read()).value)).toContain('Searching the web');

      let heartbeat: ReadableStreamReadResult<Uint8Array> | undefined;
      void reader.read().then((result) => {
        heartbeat = result;
      });
      await vi.advanceTimersByTimeAsync(10_000);

      expect(heartbeat?.done).toBe(false);
      expect(decoder.decode(heartbeat?.value)).toContain(': keep-alive');
    } finally {
      releaseBrave();
      await reader.cancel().catch(() => undefined);
    }
  });

  it('names the phase the teacher is waiting on', async () => {
    const fetchMock = destinationFetch({ position: 'below', blocks: [mindMapBlock()] });
    vi.stubGlobal('fetch', fetchMock);

    const text = await (await handler(chatRequest())).text();
    const statuses = text
      .split('\n\n')
      .flatMap((chunk) => (chunk.startsWith('data: ') ? [JSON.parse(chunk.slice(6))] : []))
      .flatMap((event) => (event.type === 'status' ? [event.text] : []));

    expect(statuses).toEqual(['Thinking…', 'Searching the web…', 'Writing the reply…']);
  });

  it('gives a lesson-sized generation the whole Netlify synchronous budget', () => {
    // Netlify caps synchronous functions at 60s and does not allow more. A full
    // nine-block proposal with media routinely outruns a shorter self-imposed cap.
    expect(chatRouteConfig.timeout).toBe(60);
    expect(AI_STREAM_HEARTBEAT_MS).toBeLessThan(AI_STREAM_STALL_MS);
  });
});
