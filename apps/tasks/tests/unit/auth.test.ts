import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiPost, parseApiResponse, readPlatformError } from '../../src/api/client';
import { resolveApiBaseUrl } from '../../src/api/config';
import {
  attachPassphraseCapture,
  messageForSignInFailure,
  normalizePassphrase,
  renderSignIn
} from '../../src/auth/gate';
import {
  createPassphraseHash,
  createSha256PassphraseHash,
  normalizeStoredPassphraseHash,
  serializeSessionCookie,
  verifyPassphrase
} from '../../netlify/functions/_shared/auth-security.mts';
import {
  corsHeadersForOrigin,
  originIsAllowed,
  parseAllowedOrigins
} from '../../netlify/functions/_shared/http.mts';

describe('passphrase verify', () => {
  it('does not commit a literal SHA-256 passphrase hash in the test source', async () => {
    const source = await readFile(new URL(import.meta.url), 'utf8');
    expect(source).not.toMatch(/toBe\(['"][a-f0-9]{64}['"]\)/i);
  });

  it('accepts Knowledge-style SHA-256 hex (Netlify bootstrap)', async () => {
    const hash = createSha256PassphraseHash('tasks-hub-local');
    expect(hash).toMatch(/^[a-f0-9]{64}$/i);
    expect(await verifyPassphrase('tasks-hub-local', hash)).toBe(true);
    expect(await verifyPassphrase('wrong', hash)).toBe(false);
    expect(await verifyPassphrase('tasks-hub-local', `"${hash}"`)).toBe(true);
    expect(normalizeStoredPassphraseHash(` sha256:${hash} `)).toBe(hash);
  });

  it('accepts Teaching-style scrypt$v1 hashes', async () => {
    const hash = await createPassphraseHash('tasks-hub-local');
    expect(hash.startsWith('scrypt$v1$')).toBe(true);
    expect(await verifyPassphrase('tasks-hub-local', hash)).toBe(true);
    expect(await verifyPassphrase('wrong', hash)).toBe(false);
  });

  it('sets a same-site Lax session cookie', () => {
    expect(serializeSessionCookie('token')).toContain('SameSite=Lax');
    expect(serializeSessionCookie('token')).not.toContain('SameSite=None');
  });
});

describe('sign-in helpers', () => {
  it('trims pasted passphrase whitespace', () => {
    expect(normalizePassphrase('  tasks-hub-local  ')).toBe('tasks-hub-local');
  });

  it('keeps keystrokes when input.value is empty at submit', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'passphrase';
    form.append(input);
    const read = attachPassphraseCapture(input, form);
    input.value = 'tasks-hub-local';
    input.dispatchEvent(new Event('input'));
    input.value = '';
    expect(read()).toBe('tasks-hub-local');
  });

  it('keeps invalid_credentials as Invalid passphrase', () => {
    expect(
      messageForSignInFailure(
        new ApiClientError({ code: 'invalid_credentials', message: 'Invalid passphrase' })
      )
    ).toBe('Invalid passphrase');
  });

  it('does not treat a flaky API as “you cannot sign in from this tab”', () => {
    expect(
      messageForSignInFailure(
        new ApiClientError({ code: 'invalid_response', message: 'Response is not valid JSON' })
      )
    ).toBe('The sign-in service did not respond. Try again.');
    expect(
      messageForSignInFailure(new ApiClientError({ code: 'network_error', message: 'fail' }))
    ).toMatch(/artasks-hub/);
    expect(
      messageForSignInFailure(new ApiClientError({ code: 'usage_exceeded', message: 'Usage exceeded' }))
    ).toMatch(/usage limit/);
  });

  it('shows a boot-time API failure on the gate without submitting', () => {
    const host = document.createElement('div');
    renderSignIn(host, { initialError: 'Sign-in is paused: the Netlify API host is over its usage limit.' });
    const error = host.querySelector('.sign-in__error');
    expect(error).toBeInstanceOf(HTMLElement);
    expect((error as HTMLElement).hidden).toBe(false);
    expect(error?.textContent).toMatch(/usage limit/);
  });

  it('points a real origin block at the API host', () => {
    expect(
      messageForSignInFailure(new ApiClientError({ code: 'forbidden', message: 'nope' }))
    ).toContain('https://api.adam-russell.com');
  });
});

describe('API response parse', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads Netlify usage_exceeded instead of calling it an unexpected shape', async () => {
    expect(
      readPlatformError({
        error: 'usage_exceeded',
        message: 'Usage exceeded',
        request_id: '01TEST'
      })
    ).toEqual({ code: 'usage_exceeded', message: 'Usage exceeded' });

    const response = new Response(
      JSON.stringify({ error: 'usage_exceeded', message: 'Usage exceeded' }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    );
    await expect(parseApiResponse(response)).rejects.toMatchObject({
      code: 'usage_exceeded',
      status: 503
    });
  });

  it('rejects empty Netlify 502/503 bodies instead of throwing JSON parse noise', async () => {
    const response = new Response('', {
      status: 502,
      headers: { 'content-type': 'text/plain' }
    });
    await expect(parseApiResponse(response)).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'Empty response (HTTP 502)'
    });
  });

  it('retries empty 502s then succeeds', async () => {
    const ok = { ok: true, data: { authenticated: true } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(ok), { status: 200, headers: { 'content-type': 'application/json' } })
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiPost('/api/auth', { passphrase: 'tasks-hub-local' }, { baseUrl: '' })).resolves.toEqual({
      authenticated: true
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a Netlify usage_exceeded 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'usage_exceeded', message: 'Usage exceeded' }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiPost('/api/auth', { passphrase: 'tasks-hub-local' }, { baseUrl: '' })).rejects.toMatchObject({
      code: 'usage_exceeded'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('API base URL', () => {
  it('uses same-origin on the Functions host and localhost', () => {
    expect(resolveApiBaseUrl('tasks-api.adam-russell.com')).toBe('');
    expect(resolveApiBaseUrl('localhost')).toBe('');
  });

  it('uses the configured API origin on the Pages host', () => {
    expect(resolveApiBaseUrl('tasks-hub.adam-russell.com')).toBe(
      'https://api.adam-russell.com'
    );
  });
});

describe('allowed origins', () => {
  it('always allows Pages and the Functions host', () => {
    const allowed = parseAllowedOrigins({});
    expect(allowed).toContain('https://tasks-hub.adam-russell.com');
    expect(allowed).toContain('https://tasks-api.adam-russell.com');
  });

  it('accepts a Pages Origin and echoes it in CORS', () => {
    const origin = 'https://tasks-hub.adam-russell.com';
    expect(originIsAllowed(origin, {})).toBe(true);
    expect(corsHeadersForOrigin(origin, {})['access-control-allow-origin']).toBe(origin);
  });

  it('rejects an unknown Origin', () => {
    expect(originIsAllowed('https://evil.example', {})).toBe(false);
    expect(corsHeadersForOrigin('https://evil.example', {})).toEqual({});
  });
});
