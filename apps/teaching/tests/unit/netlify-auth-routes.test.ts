// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPassphraseHash, createSessionToken } from '../../netlify/functions/_shared/auth-security.mts';
import authHandler from '../../netlify/functions/auth.mts';
import sessionHandler from '../../netlify/functions/session.mts';
import logoutHandler from '../../netlify/functions/logout.mts';

const PASSPHRASE = 'correct horse battery staple';
const SESSION_SECRET = 's'.repeat(32);
const SITE_ORIGIN = 'https://teacher.example.test';
const FUNCTION_ORIGIN = 'https://api.example.netlify.app';

let passphraseHash: string;

beforeAll(async () => {
  passphraseHash = await createPassphraseHash(PASSPHRASE, { salt: Buffer.alloc(16, 5) });
});

const ENV_KEYS = ['TEACHING_HUB_PASSPHRASE_HASH', 'SESSION_SECRET', 'SITE_ORIGIN'] as const;

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const key of ENV_KEYS) {
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
}

afterEach(() => {
  setEnv({});
});

function configuredEnv(): void {
  setEnv({
    TEACHING_HUB_PASSPHRASE_HASH: passphraseHash,
    SESSION_SECRET,
    SITE_ORIGIN
  });
}

function request(
  path: string,
  init: RequestInit & { origin?: string | null; cookie?: string | null } = {}
): Request {
  const headers = new Headers(init.headers);
  if (init.origin !== undefined && init.origin !== null) headers.set('origin', init.origin);
  if (init.cookie) headers.set('cookie', init.cookie);
  return new Request(`${FUNCTION_ORIGIN}${path}`, { ...init, headers });
}

describe('POST /api/auth', () => {
  it('rejects non-POST methods', async () => {
    configuredEnv();
    const response = await authHandler(request('/api/auth', { method: 'GET' }));
    expect(response.status).toBe(405);
  });

  it('answers CORS preflight without requiring configuration', async () => {
    const response = await authHandler(
      request('/api/auth', { method: 'OPTIONS', origin: SITE_ORIGIN })
    );
    expect(response.status).toBe(204);
  });

  it('returns 503 when the service is not configured', async () => {
    setEnv({});
    const response = await authHandler(
      request('/api/auth', { method: 'POST', body: JSON.stringify({ passphrase: PASSPHRASE }) })
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: 'misconfigured' } });
  });

  it('rejects requests from a disallowed origin', async () => {
    configuredEnv();
    const response = await authHandler(
      request('/api/auth', {
        method: 'POST',
        origin: 'https://not-allowed.test',
        body: JSON.stringify({ passphrase: PASSPHRASE })
      })
    );
    expect(response.status).toBe(403);
  });

  it('rejects an invalid passphrase', async () => {
    configuredEnv();
    const response = await authHandler(
      request('/api/auth', { method: 'POST', body: JSON.stringify({ passphrase: 'wrong' }) })
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: 'invalid_credentials' } });
  });

  it('rejects a malformed JSON body', async () => {
    configuredEnv();
    const response = await authHandler(request('/api/auth', { method: 'POST', body: '{not json' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('invalid_json');
  });

  it('issues a session cookie for the correct passphrase, with CORS headers for the allowed origin', async () => {
    configuredEnv();
    const response = await authHandler(
      request('/api/auth', {
        method: 'POST',
        origin: SITE_ORIGIN,
        body: JSON.stringify({ passphrase: PASSPHRASE })
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.authenticated).toBe(true);
    expect(typeof body.data.expiresAt).toBe('number');
    expect(body.data.expiresAt).toBeGreaterThan(Date.now());

    const cookie = response.headers.get('set-cookie');
    expect(cookie).toContain('teaching_hub_session=');
    expect(cookie).toContain('HttpOnly');

    expect(response.headers.get('access-control-allow-origin')).toBe(SITE_ORIGIN);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });
});

describe('GET /api/session', () => {
  it('reports unauthenticated when no cookie is present', async () => {
    configuredEnv();
    const response = await sessionHandler(request('/api/session'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, data: { authenticated: false } });
  });

  it('reports authenticated for a valid session cookie', async () => {
    configuredEnv();
    const issued = createSessionToken({ now: Date.now() }, SESSION_SECRET);
    const response = await sessionHandler(
      request('/api/session', { cookie: `teaching_hub_session=${issued.token}` })
    );
    const body = await response.json();
    expect(body.data.authenticated).toBe(true);
    expect(body.data.expiresAt).toBe(Date.parse(issued.expiresAt));
  });

  it('reports unauthenticated for an expired session cookie', async () => {
    configuredEnv();
    const issued = createSessionToken({ now: Date.parse('2020-01-01T00:00:00Z') }, SESSION_SECRET);
    const response = await sessionHandler(
      request('/api/session', { cookie: `teaching_hub_session=${issued.token}` })
    );
    const body = await response.json();
    expect(body.data).toEqual({ authenticated: false });
  });
});

describe('POST /api/logout', () => {
  it('clears the session cookie', async () => {
    configuredEnv();
    const response = await logoutHandler(request('/api/logout', { method: 'POST' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, data: { loggedOut: true } });

    const cookie = response.headers.get('set-cookie');
    expect(cookie).toContain('teaching_hub_session=;');
    expect(cookie).toContain('Max-Age=0');
  });

  it('rejects non-POST methods', async () => {
    const response = await logoutHandler(request('/api/logout', { method: 'GET' }));
    expect(response.status).toBe(405);
  });
});
