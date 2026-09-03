// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '@netlify/blobs';
import type { AiJob, AiTranscriptTurn, KernelJobPayload } from '@/ai/jobs';
import { completeWorkingAiJob } from '../../netlify/functions/_shared/ai-job-complete.mts';
import {
  aiJobKey,
  aiTranscriptKey,
  draftLessonKey
} from '../../netlify/functions/_shared/blobs.mts';

const NOW = '2026-08-16T10:00:00.000Z';
const LESSON_ID = 'lesson_rome';
const JOB_ID = 'job_rome';
const MESSAGE = 'build a 10 point mind map on Roman roads';
const LESSON_TITLE = 'Ancient Rome';
const KERNEL_ORIGIN = 'https://kernel.example';
const BRAVE_ORIGIN = 'https://api.search.brave.com';
const PACK_IMAGE_URL = 'https://images.example/roman-road.jpg';
const INVENTED_IMAGE_URL = 'https://invented.example/roman-road.jpg';

const WEB_FIXTURE = {
  web: {
    results: [
      {
        title: 'Roman roads',
        url: 'https://www.britannica.com/technology/Roman-road-system',
        description: 'Roman roads linked the empire for armies, trade, and messages.'
      }
    ]
  }
};
const IMAGE_FIXTURE = {
  results: [
    {
      title: 'Via Appia',
      url: 'https://www.britannica.com/technology/Roman-road-system',
      properties: { url: PACK_IMAGE_URL, width: 1200, height: 800 }
    }
  ]
};
const VIDEO_FIXTURE = {
  results: [
    {
      title: 'How Roman roads were built',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    }
  ]
};
const ARCHIVE_FIXTURE = {
  findings: [
    {
      pageId: 'page_roads',
      title: 'Roman engineering notes',
      excerpt: 'Layered construction kept roads usable for centuries.',
      stance: 'related'
    }
  ],
  gaps: []
};

class FakeStore {
  private readonly data = new Map<string, unknown>();

  reset(): void {
    this.data.clear();
  }

  seed(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  read<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
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
    blobs: Array<{ key: string; etag: string }>;
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

const fakeStore = new FakeStore();
const store = fakeStore as unknown as Store;

function env(): NodeJS.ProcessEnv {
  return {
    RESEARCH_KERNEL_SHARED_SECRET: 'kernel-secret',
    RESEARCH_KERNEL_URL: KERNEL_ORIGIN,
    BRAVE_SEARCH_API_KEY: 'brave-test-key'
  } as NodeJS.ProcessEnv;
}

function baseBlock(overrides: Record<string, unknown>) {
  return {
    id: 'block_heading',
    type: 'block',
    block_type: 'heading',
    variant: 'page',
    visibility: 'student_teacher',
    content: { text: 'Roman roads' },
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
    title: LESSON_TITLE,
    slug: 'ancient-rome',
    unit_id: 'unit_rome',
    sequence: 1,
    blocks: [baseBlock({})],
    status: 'active',
    created_at: NOW,
    updated_at: NOW,
    schema_version: 1
  };
}

function workingJob(): AiJob {
  return {
    id: JOB_ID,
    lesson_id: LESSON_ID,
    agent: 'clementine',
    status: 'working',
    snapshot_at: NOW,
    message: MESSAGE,
    created_at: new Date().toISOString()
  };
}

function mindMapBlock() {
  const nodes = [
    { id: 'roman-roads', label: 'Roman roads', parent_id: null },
    ...[
      'Purpose',
      'Layers',
      'Milestones',
      'Via Appia',
      'Legions',
      'Trade',
      'Surveying',
      'Bridges',
      'Legacy'
    ].map((label, index) => ({
      id: `node-${index + 1}`,
      label,
      parent_id: 'roman-roads'
    }))
  ];
  return baseBlock({
    id: 'mind-map-roads',
    block_type: 'mind_map',
    variant: 'medium',
    content: {
      title: 'Roman roads',
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        id: `edge-${index + 1}`,
        from: 'roman-roads',
        to: node.id
      }))
    }
  });
}

function imageBlock(url: string) {
  return baseBlock({
    id: 'image-road',
    block_type: 'image',
    variant: 'large',
    content: { url, alt_text: 'Roman road' }
  });
}

function captionOnlyDiagramBlock() {
  return baseBlock({
    id: 'diagram-spacing',
    block_type: 'diagram',
    variant: 'medium',
    content: {
      source: 'image',
      image_url: '',
      image_alt: '',
      caption: 'Spacing vs massed practice'
    }
  });
}

function questionSetBlock(responseSpace: string) {
  return baseBlock({
    id: 'questions-dual-coding',
    block_type: 'question_set',
    variant: 'medium',
    content: {
      questions: [
        {
          id: 'questions-dual-coding_q1',
          prompt: 'Name one dual-coding move.',
          kind: 'short_answer',
          response_space: responseSpace
        }
      ]
    }
  });
}

function anthropicSse(events: unknown[]): Response {
  return new Response(`${events.map((event) => `data: ${JSON.stringify(event)}`).join('\n')}\n`);
}

function insertBlocksPayload(blocks: unknown[]) {
  return { proposal: { kind: 'insert_blocks', position: 'below', blocks } };
}

function anthropicToolReply(name: string, input: unknown, toolId = 'tool_1'): Response {
  return anthropicSse([
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: toolId, name }
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) }
    },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_stop' }
  ]);
}

function anthropicTextThenTool(text: string, name: string, input: unknown): Response {
  return anthropicSse([
    { type: 'message_start', message: { usage: { input_tokens: 10 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'tool_2', name }
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) }
    },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_stop' }
  ]);
}

function anthropicDoneReply(): Response {
  return new Response('data: {"type":"message_stop"}\n');
}

type FetchOptions = {
  kernelPayload: unknown;
  /** Resolves once a Brave request arrives; used to prove search runs beside the archive pull. */
  holdArchiveUntilBrave?: boolean;
};

function createFetchMock(options: FetchOptions) {
  let braveSeen = false;
  let braveSeenWhileArchivePending = false;

  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);

    if (url.origin === BRAVE_ORIGIN) {
      braveSeen = true;
      if (url.pathname === '/res/v1/web/search') return Response.json(WEB_FIXTURE);
      if (url.pathname === '/res/v1/images/search') return Response.json(IMAGE_FIXTURE);
      if (url.pathname === '/res/v1/videos/search') return Response.json(VIDEO_FIXTURE);
    }

    if (url.origin === KERNEL_ORIGIN && url.pathname === '/quick_research') {
      if (options.holdArchiveUntilBrave) {
        const deadline = Date.now() + 200;
        while (!braveSeen && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        braveSeenWhileArchivePending = braveSeen;
      }
      return Response.json(ARCHIVE_FIXTURE);
    }

    if (url.origin === KERNEL_ORIGIN && url.pathname === '/lesson_proposal') {
      return Response.json(options.kernelPayload);
    }

    throw new Error(`Unexpected fetch destination: ${url}`);
  });

  return {
    fetchMock,
    braveSeenWhileArchivePending: () => braveSeenWhileArchivePending
  };
}

type FetchMock = ReturnType<typeof createFetchMock>['fetchMock'];

function kernelJobBody(fetchMock: FetchMock): KernelJobPayload {
  const call = fetchMock.mock.calls.find(([input]) => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input : (input as Request).url
    );
    return url.origin === KERNEL_ORIGIN && url.pathname === '/lesson_proposal';
  });
  if (!call) throw new Error('expected a /lesson_proposal request');
  return JSON.parse(String(call[1]?.body)) as KernelJobPayload;
}

function braveQueries(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls
    .map(([input]) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : (input as Request).url
      );
      return url.origin === BRAVE_ORIGIN ? url.searchParams.get('q') : null;
    })
    .filter((query): query is string => typeof query === 'string');
}

beforeEach(() => {
  fakeStore.reset();
  fakeStore.seed(draftLessonKey(LESSON_ID), lesson());
  fakeStore.seed(aiJobKey(JOB_ID), workingJob());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('completeWorkingAiJob web search grounding', () => {
  it('sends an available search pack and block recipes to the kernel', async () => {
    const { fetchMock, braveSeenWhileArchivePending } = createFetchMock({
      kernelPayload: insertBlocksPayload([mindMapBlock()]),
      holdArchiveUntilBrave: true
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWorkingAiJob(store, workingJob(), env());
    const body = kernelJobBody(fetchMock);

    expect(braveQueries(fetchMock)).toEqual(
      Array(3).fill(`${MESSAGE}\nLesson: ${LESSON_TITLE}`)
    );
    expect(braveSeenWhileArchivePending()).toBe(true);
    expect(body.searchPack.available).toBe(true);
    expect(body.searchPack.query).toBe(`${MESSAGE}\nLesson: ${LESSON_TITLE}`);
    expect(body.searchPack.images.map((image) => image.image_url)).toContain(PACK_IMAGE_URL);
    expect(body.blockRecipes).toContain('mind_map');
    expect(body.findings).toEqual(ARCHIVE_FIXTURE.findings);
    expect(result.status).toBe('done');
  });

  it('steers Clementine through the kernel query without changing the web-search query', async () => {
    const { fetchMock } = createFetchMock({
      kernelPayload: insertBlocksPayload([mindMapBlock()])
    });
    vi.stubGlobal('fetch', fetchMock);

    await completeWorkingAiJob(
      store,
      { ...workingJob(), protocol_id: 'find-the-claim' },
      env()
    );
    const body = kernelJobBody(fetchMock);

    expect(body.query).toContain('Run the Find the claim protocol');
    expect(body.query).toContain(`Teacher request: ${MESSAGE}`);
    expect(braveQueries(fetchMock)).toEqual(Array(3).fill(`${MESSAGE}\nLesson: ${LESSON_TITLE}`));
  });

  it('persists a done job with the kernel insert_blocks proposal', async () => {
    const { fetchMock } = createFetchMock({
      kernelPayload: insertBlocksPayload([mindMapBlock()])
    });
    vi.stubGlobal('fetch', fetchMock);

    await completeWorkingAiJob(store, workingJob(), env());
    const persisted = fakeStore.read<AiJob>(aiJobKey(JOB_ID));
    const transcript = fakeStore.read<AiTranscriptTurn[]>(aiTranscriptKey(LESSON_ID, 'clementine'));

    expect(persisted?.status).toBe('done');
    expect(persisted?.proposal?.kind).toBe('insert_blocks');
    expect(transcript).toEqual([
      { role: 'user', content: MESSAGE },
      { role: 'assistant', content: 'Proposed a insert_blocks change.' }
    ]);
  });

  it('records an invalid proposal error when the kernel invents media', async () => {
    const { fetchMock } = createFetchMock({
      kernelPayload: insertBlocksPayload([imageBlock(INVENTED_IMAGE_URL)])
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWorkingAiJob(store, workingJob(), env());
    const persisted = fakeStore.read<AiJob>(aiJobKey(JOB_ID));

    expect(result.status).toBe('error');
    expect(result.error).toContain('invalid proposal');
    expect(result.proposal).toBeUndefined();
    expect(persisted?.status).toBe('error');
    expect(persisted?.proposal).toBeUndefined();
  });

  it('keeps media the search pack returned', async () => {
    const { fetchMock } = createFetchMock({
      kernelPayload: insertBlocksPayload([imageBlock(PACK_IMAGE_URL)])
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWorkingAiJob(store, workingJob(), env());

    expect(result.status).toBe('done');
    expect(result.proposal?.kind).toBe('insert_blocks');
  });
});

describe('completeWorkingAiJob fast agents', () => {
  it('runs Ann through Anthropic in the durable job and persists her proposal', async () => {
    let anthropicCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin === BRAVE_ORIGIN) {
        if (url.pathname === '/res/v1/web/search') return Response.json(WEB_FIXTURE);
        if (url.pathname === '/res/v1/images/search') return Response.json(IMAGE_FIXTURE);
        if (url.pathname === '/res/v1/videos/search') return Response.json(VIDEO_FIXTURE);
      }
      if (url.origin === 'https://api.anthropic.com') {
        anthropicCalls += 1;
        return anthropicCalls === 1
          ? anthropicToolReply('propose_insert_blocks', {
              position: 'below',
              blocks: [mindMapBlock()]
            })
          : anthropicDoneReply();
      }
      throw new Error(`Unexpected fetch destination: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const job: AiJob = {
      ...workingJob(),
      agent: 'ann',
      protocol_id: 'lesson-diagnosis',
      scope: 'lesson',
      history: [{ role: 'user', content: 'Keep the starter.' }]
    };

    const result = await completeWorkingAiJob(store, job, {
      ANTHROPIC_API_KEY: 'anthropic-test-key',
      BRAVE_SEARCH_API_KEY: 'brave-test-key'
    } as NodeJS.ProcessEnv);

    expect(anthropicCalls).toBeGreaterThan(0);
    const anthropicCall = fetchMock.mock.calls.find(([input]) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      return url.origin === 'https://api.anthropic.com';
    });
    const anthropicBody = JSON.parse(String(anthropicCall?.[1]?.body));
    expect(JSON.stringify(anthropicBody.system)).toContain('Run the Lesson diagnosis protocol');
    expect(result.status).toBe('done');
    expect(result.proposal?.kind).toBe('insert_blocks');
    expect(fakeStore.read<AiJob>(aiJobKey(JOB_ID))?.proposal?.kind).toBe('insert_blocks');
  });

  it('persists Hammond review-only output from the durable job', async () => {
    let anthropicCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin === BRAVE_ORIGIN) return Response.json({});
      if (url.origin === 'https://api.anthropic.com') {
        anthropicCalls += 1;
        return anthropicCalls === 1
          ? anthropicToolReply('review_only', { summary: 'Add a clearer retrieval checkpoint.' })
          : anthropicDoneReply();
      }
      throw new Error(`Unexpected fetch destination: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWorkingAiJob(
      store,
      { ...workingJob(), agent: 'hammond', scope: 'lesson' },
      {
        ANTHROPIC_API_KEY: 'anthropic-test-key',
        BRAVE_SEARCH_API_KEY: 'brave-test-key'
      } as NodeJS.ProcessEnv
    );

    expect(result).toMatchObject({
      status: 'done',
      proposal: {
        kind: 'review_only',
        summary: 'Add a clearer retrieval checkpoint.'
      }
    });
  });

  it('does not persist fast-agent media invented outside the search pack', async () => {
    let anthropicCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin === BRAVE_ORIGIN) {
        if (url.pathname === '/res/v1/web/search') return Response.json(WEB_FIXTURE);
        if (url.pathname === '/res/v1/images/search') return Response.json(IMAGE_FIXTURE);
        if (url.pathname === '/res/v1/videos/search') return Response.json(VIDEO_FIXTURE);
      }
      if (url.origin === 'https://api.anthropic.com') {
        anthropicCalls += 1;
        return anthropicCalls === 1
          ? anthropicToolReply('propose_insert_blocks', {
              position: 'below',
              blocks: [imageBlock(INVENTED_IMAGE_URL)]
            })
          : anthropicDoneReply();
      }
      throw new Error(`Unexpected fetch destination: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWorkingAiJob(
      store,
      { ...workingJob(), agent: 'ann', scope: 'lesson' },
      {
        ANTHROPIC_API_KEY: 'anthropic-test-key',
        BRAVE_SEARCH_API_KEY: 'brave-test-key'
      } as NodeJS.ProcessEnv
    );

    expect(result.status).toBe('error');
    expect(result.proposal).toBeUndefined();
    expect(fakeStore.read<AiJob>(aiJobKey(JOB_ID))?.proposal).toBeUndefined();
  });

  it('does not persist a caption-only diagram that cannot publish', async () => {
    let anthropicCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin === BRAVE_ORIGIN) {
        if (url.pathname === '/res/v1/web/search') return Response.json(WEB_FIXTURE);
        if (url.pathname === '/res/v1/images/search') return Response.json(IMAGE_FIXTURE);
        if (url.pathname === '/res/v1/videos/search') return Response.json(VIDEO_FIXTURE);
      }
      if (url.origin === 'https://api.anthropic.com') {
        anthropicCalls += 1;
        return anthropicCalls === 1
          ? anthropicToolReply('propose_insert_blocks', {
              position: 'below',
              blocks: [captionOnlyDiagramBlock()]
            })
          : anthropicDoneReply();
      }
      throw new Error(`Unexpected fetch destination: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWorkingAiJob(
      store,
      { ...workingJob(), agent: 'ann', scope: 'lesson' },
      {
        ANTHROPIC_API_KEY: 'anthropic-test-key',
        BRAVE_SEARCH_API_KEY: 'brave-test-key'
      } as NodeJS.ProcessEnv
    );

    expect(result.status).toBe('error');
    expect(result.proposal).toBeUndefined();
    expect(fakeStore.read<AiJob>(aiJobKey(JOB_ID))?.proposal).toBeUndefined();
  });

  it('does not persist Anthropic retry apologies after a valid proposal', async () => {
    const apology =
      'Oops — response_space only accepts none | short | medium | long | extended. Let me fix that and resubmit.';
    let anthropicCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin === BRAVE_ORIGIN) return Response.json({});
      if (url.origin === 'https://api.anthropic.com') {
        anthropicCalls += 1;
        if (anthropicCalls === 1) {
          return anthropicToolReply('propose_insert_blocks', {
            position: 'below',
            blocks: [questionSetBlock('paragraph')]
          });
        }
        return anthropicTextThenTool(apology, 'propose_insert_blocks', {
          position: 'below',
          blocks: [questionSetBlock('medium')]
        });
      }
      throw new Error(`Unexpected fetch destination: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await completeWorkingAiJob(
      store,
      { ...workingJob(), agent: 'ann', scope: 'lesson' },
      {
        ANTHROPIC_API_KEY: 'anthropic-test-key',
        BRAVE_SEARCH_API_KEY: 'brave-test-key'
      } as NodeJS.ProcessEnv
    );

    expect(result.status).toBe('done');
    expect(result.proposal?.kind).toBe('insert_blocks');
    expect(result.response ?? '').not.toMatch(/Oops|response_space only accepts/);
    expect(fakeStore.read<AiJob>(aiJobKey(JOB_ID))?.response ?? '').not.toMatch(
      /Oops|response_space only accepts/
    );
  });
});
