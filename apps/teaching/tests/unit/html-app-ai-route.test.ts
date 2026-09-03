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
      if (opts?.type === 'json') return value;
      return typeof value === 'string' ? value : JSON.stringify(value);
    }

    async setJSON(key: string, value: unknown): Promise<void> {
      this.data.set(key, value);
    }
  }

  return { fakeStore: new FakeStore() };
});

vi.mock('../../netlify/functions/_shared/blobs.mts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../netlify/functions/_shared/blobs.mts')>();
  return { ...actual, getContentStore: () => fakeStore };
});

const { publishedLessonKey } = await import('../../netlify/functions/_shared/blobs.mts');
const handler = (await import('../../netlify/functions/html-app-ai.mts')).default;
const { CURRENT_SONNET_MODEL } = await import('../../src/ai/models.ts');

const FUNCTION_ORIGIN = 'https://api.example.netlify.app';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

function htmlAppLesson(ai: boolean, lane?: { provider: 'openai' | 'anthropic'; model: string }) {
  return {
    lesson_id: 'lesson_1',
    title: 'L',
    unit_id: 'unit_1',
    published_at: timestamps.created_at,
    schema_version: 1,
    blocks: [
      {
        id: 'app_1',
        type: 'block',
        block_type: 'html_app',
        variant: 'large',
        visibility: 'student_teacher',
        layout: {},
        print: {},
        settings: {},
        ...timestamps,
        schema_version: 1,
        content: {
          html: '<p>Hi</p>',
          ...(ai
            ? {
                ai: {
                  enabled: true,
                  provider: lane?.provider ?? 'openai',
                  model: lane?.model ?? 'gpt-4o-mini',
                  system: 'Stay focused.',
                  max_tokens: 256
                }
              }
            : {})
        }
      }
    ]
  };
}

describe('POST /api/html-app-ai', () => {
  beforeEach(() => {
    fakeStore.reset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns 400 on bad body', async () => {
    const res = await handler(
      new Request(`${FUNCTION_ORIGIN}/api/html-app-ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when ai lane missing', async () => {
    fakeStore.seed(publishedLessonKey('lesson_1'), htmlAppLesson(false));
    const res = await handler(
      new Request(`${FUNCTION_ORIGIN}/api/html-app-ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lesson_id: 'lesson_1',
          block_id: 'app_1',
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })
    );
    expect(res.status).toBe(403);
  });

  it('forwards to openai and returns text', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    fakeStore.seed(publishedLessonKey('lesson_1'), htmlAppLesson(true));
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'hello from model' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const res = await handler(
      new Request(`${FUNCTION_ORIGIN}/api/html-app-ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lesson_id: 'lesson_1',
          block_id: 'app_1',
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { text: string } };
    expect(json.data.text).toBe('hello from model');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(String(call?.[0])).toContain('api.openai.com');
    const init = call?.[1] as RequestInit;
    const sent = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(sent.messages[0]).toEqual({ role: 'system', content: 'Stay focused.' });
  });

  it('rewrites a retired anthropic model saved in the block', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    fakeStore.seed(
      publishedLessonKey('lesson_1'),
      htmlAppLesson(true, { provider: 'anthropic', model: 'claude-sonnet-4-20250514' })
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'still working' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const res = await handler(
      new Request(`${FUNCTION_ORIGIN}/api/html-app-ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lesson_id: 'lesson_1',
          block_id: 'app_1',
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })
    );
    expect(res.status).toBe(200);

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    const sent = JSON.parse(String(init.body)) as { model: string };
    expect(sent.model).toBe(CURRENT_SONNET_MODEL);
  });

  it.each([
    {
      provider: 'anthropic' as const,
      key: 'ANTHROPIC_API_KEY',
      status: 401,
      body: { error: { type: 'authentication_error', message: 'invalid x-api-key' } },
      expected: 'Anthropic rejected the API key'
    },
    {
      provider: 'anthropic' as const,
      key: 'ANTHROPIC_API_KEY',
      status: 404,
      body: { error: { type: 'not_found_error', message: 'model: claude-retired' } },
      expected: 'Anthropic rejected the model request: model: claude-retired'
    },
    {
      provider: 'openai' as const,
      key: 'OPENAI_API_KEY',
      status: 429,
      body: { error: { type: 'rate_limit_error', message: 'Too many requests' } },
      expected: 'OpenAI rate limit hit'
    }
  ])(
    'returns the useful $provider failure reason instead of flattening HTTP $status',
    async ({ provider, key, status, body, expected }) => {
      process.env[key] = 'test-key';
      fakeStore.seed(
        publishedLessonKey('lesson_1'),
        htmlAppLesson(true, {
          provider,
          model: provider === 'anthropic' ? CURRENT_SONNET_MODEL : 'gpt-4o-mini'
        })
      );
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' }
        })
      );

      const res = await handler(
        new Request(`${FUNCTION_ORIGIN}/api/html-app-ai`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            lesson_id: 'lesson_1',
            block_id: 'app_1',
            messages: [{ role: 'user', content: 'Hi' }]
          })
        })
      );

      expect(res.status).toBe(502);
      const json = (await res.json()) as {
        ok: false;
        error: { code: string; message: string };
      };
      expect(json.error.code).toBe('upstream_error');
      expect(json.error.message).toContain(expected);
      expect(json.error.message).not.toContain('test-key');
    }
  );
});
