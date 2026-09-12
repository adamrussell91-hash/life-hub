import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost, ApiClientError, parseApiResponse } from '@/api/client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('parseApiResponse', () => {
  it('parses the { ok, data } envelope', async () => {
    const result = await parseApiResponse(jsonResponse(200, { ok: true, data: { hello: 'world' } }));
    expect(result).toEqual({ ok: true, data: { hello: 'world' } });
  });

  it('throws invalid_response for an empty body', async () => {
    await expect(parseApiResponse(new Response('', { status: 200 }))).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('throws invalid_response for non-JSON', async () => {
    await expect(parseApiResponse(new Response('not json', { status: 200 }))).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('throws invalid_response for a body missing the ok field', async () => {
    await expect(parseApiResponse(jsonResponse(200, { hello: 'world' }))).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('recognises a platform-suspended host response instead of treating it as malformed', async () => {
    await expect(parseApiResponse(jsonResponse(503, { error: 'usage_exceeded', message: 'over limit' })))
      .rejects.toMatchObject({ code: 'usage_exceeded' });
  });
});

describe('apiGet/apiPost request encoding', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends credentials: include, cache: no-store, and the path as-is on GET', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: { value: 1 } }));
    await apiGet('/api/entities/search?q=abc&kinds=person');
    expect(fetch).toHaveBeenCalledWith(
      '/api/entities/search?q=abc&kinds=person',
      expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store' })
    );
  });

  it('encodes a POST body as JSON with a matching content-type header', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, data: { authenticated: true } }));
    await apiPost('/api/auth', { passphrase: 'x y' });
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ passphrase: 'x y' }) });
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('throws ApiClientError with the server error code on a non-ok envelope', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(401, { ok: false, error: { code: 'unauthenticated', message: 'nope' } })
    );
    await expect(apiGet('/api/session')).rejects.toBeInstanceOf(ApiClientError);
    await expect(apiGet('/api/session')).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
  });
});
