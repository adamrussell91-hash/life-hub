// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mts';

const { default: handler, config } = await import('../../netlify/functions/alchemy-lab.mts');

const FUNCTION_ORIGIN = 'https://api.example.netlify.app';
const SESSION_SECRET = 's'.repeat(32);
const SITE_ORIGIN = 'https://teaching-hub.example';

function sessionCookie(): string {
  const { token } = createSessionToken({ now: Date.now() }, SESSION_SECRET);
  return `teaching_hub_session=${token}`;
}

function setEnv(overrides: Record<string, string | undefined>): void {
  const keys = [
    'TEACHING_HUB_PASSPHRASE_HASH',
    'SESSION_SECRET',
    'SITE_ORIGIN',
    'KNOWLEDGE_ALCHEMIST_URL',
    'ALCHEMIST_SHARED_SECRET'
  ];
  for (const key of keys) {
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
}

function configured(): void {
  setEnv({
    TEACHING_HUB_PASSPHRASE_HASH: 'hash',
    SESSION_SECRET,
    SITE_ORIGIN,
    KNOWLEDGE_ALCHEMIST_URL: 'https://knowledge-api.example/api/lesson-alchemist',
    ALCHEMIST_SHARED_SECRET: 'alchem-secret'
  });
}

function post(init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Request(`${FUNCTION_ORIGIN}/api/alchemy-lab`, { method: 'POST', ...init, headers });
}

afterEach(() => {
  setEnv({});
  vi.unstubAllGlobals();
});

describe('POST /api/alchemy-lab', () => {
  it('uses a 60s function timeout', () => {
    expect(config).toEqual({ path: '/api/alchemy-lab', timeout: 60 });
  });

  it('requires a teacher session', async () => {
    configured();
    const response = await handler(post({ body: JSON.stringify({ lessonText: 'duty' }) }));
    expect(response.status).toBe(401);
  });

  it('returns 503 when the archive hop is not configured', async () => {
    setEnv({
      TEACHING_HUB_PASSPHRASE_HASH: 'hash',
      SESSION_SECRET,
      SITE_ORIGIN
    });
    const response = await handler(
      post({
        headers: { cookie: sessionCookie() },
        body: JSON.stringify({ lessonText: 'duty' })
      })
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { message: 'Alchemy Lab is not configured.' }
    });
  });

  it('rejects empty lesson text', async () => {
    configured();
    const response = await handler(
      post({
        headers: { cookie: sessionCookie() },
        body: JSON.stringify({ lessonText: '  ' })
      })
    );
    expect(response.status).toBe(400);
  });

  it('forwards the shared secret and maps Knowledge Hub 401 to 502', async () => {
    configured();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await handler(
      post({
        headers: { cookie: sessionCookie() },
        body: JSON.stringify({ lessonText: 'inherited duty' })
      })
    );
    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://knowledge-api.example/api/lesson-alchemist',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-alchemist-secret': 'alchem-secret' })
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { message: "Alchemy Lab couldn't reach the archive." }
    });
  });

  it('returns parsed connections from Knowledge Hub', async () => {
    configured();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            mode: 'synthesis',
            connections: [{ sourcePageId: 'p1', summary: 'Duty', icon: 'Irony', extra: true }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
    const response = await handler(
      post({
        headers: { cookie: sessionCookie() },
        body: JSON.stringify({ lessonText: 'inherited duty' })
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        mode: 'synthesis',
        connections: [
          {
            icon: 'Irony',
            summary: 'Duty',
            sourcePageId: 'p1',
            sourcePageTitle: '',
            sourceExcerpt: '',
            whyNonObvious: ''
          }
        ]
      }
    });
  });
});
