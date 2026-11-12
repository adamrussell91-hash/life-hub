import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { API_BASE_URL, getApiBaseUrl } from '@/api/config';
import { apiGet, apiPost, apiPut, apiPatch, ApiClientError, setCodePrompt } from '@/api/client';

function mockFetchJson(body: unknown, status = 200): Response {
  return {
    status,
    json: async () => body
  } as Response;
}

describe('api config', () => {
  it('defaults to empty base URL under Vitest', () => {
    expect(API_BASE_URL).toBe('');
  });

  it('allows injecting a base URL override', () => {
    expect(getApiBaseUrl('https://example.test')).toBe('https://example.test');
    expect(getApiBaseUrl()).toBe(API_BASE_URL);
  });
});

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('apiGet sends credentials and returns typed data on success', async () => {
    fetchMock.mockResolvedValue(
      mockFetchJson({ ok: true, data: { authenticated: false } })
    );

    const data = await apiGet<{ authenticated: boolean }>('/api/session');

    expect(data).toEqual({ authenticated: false });
    expect(fetchMock).toHaveBeenCalledWith('/api/session', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      body: undefined,
      signal: undefined
    });
  });

  it('apiPost sends JSON body and parses success envelope', async () => {
    fetchMock.mockResolvedValue(
      mockFetchJson({ ok: true, data: { authenticated: true, expiresAt: 123 } })
    );

    const data = await apiPost<{ authenticated: boolean; expiresAt: number }>(
      '/api/auth',
      { passphrase: 'teaching-hub-local' }
    );

    expect(data.authenticated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth', {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ passphrase: 'teaching-hub-local' }),
      signal: undefined
    });
  });

  it('apiPut sends JSON body', async () => {
    fetchMock.mockResolvedValue(
      mockFetchJson({ ok: true, data: { id: 'lesson_lkeep_008', title: 'Updated' } })
    );

    const data = await apiPut<{ id: string; title: string }>(
      '/api/lessons/lesson_lkeep_008',
      { id: 'lesson_lkeep_008', title: 'Updated' }
    );

    expect(data.title).toBe('Updated');
    expect(fetchMock).toHaveBeenCalledWith('/api/lessons/lesson_lkeep_008', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: 'lesson_lkeep_008', title: 'Updated' }),
      signal: undefined
    });
  });

  it('apiPatch sends JSON body', async () => {
    fetchMock.mockResolvedValue(
      mockFetchJson({ ok: true, data: { id: 'lesson_lkeep_008', title: 'Patched' } })
    );

    const data = await apiPatch<{ id: string; title: string }>(
      '/api/lessons/lesson_lkeep_008',
      { title: 'Patched' }
    );

    expect(data.title).toBe('Patched');
    expect(fetchMock).toHaveBeenCalledWith('/api/lessons/lesson_lkeep_008', {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Patched' }),
      signal: undefined
    });
  });

  it('throws ApiClientError for API error envelopes', async () => {
    fetchMock.mockResolvedValue(
      mockFetchJson({
        ok: false,
        error: { code: 'unauthorized', message: 'Authentication required' }
      }, 401)
    );

    await expect(apiGet('/api/curriculum')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'unauthorized',
      message: 'Authentication required'
    });
  });

  it('throws ApiClientError when response JSON is invalid', async () => {
    fetchMock.mockResolvedValue({
      status: 500,
      json: async () => {
        throw new Error('not json');
      }
    } as unknown as Response);

    await expect(apiGet('/api/session')).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'Response is not valid JSON'
    });
  });

  it('throws ApiClientError on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));

    await expect(apiGet('/api/session')).rejects.toMatchObject({
      code: 'network_error',
      message: 'Failed to fetch'
    });
  });

  it('prefixes requests with a custom base URL', async () => {
    fetchMock.mockResolvedValue(mockFetchJson({ ok: true, data: {} }));

    await apiGet('/api/session', { baseUrl: 'https://api.example.test' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/session',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('preserves error details from the API envelope', async () => {
    fetchMock.mockResolvedValue(
      mockFetchJson({
        ok: false,
        error: {
          code: 'validation_error',
          message: 'Draft failed validation',
          details: [{ path: ['title'], message: 'Required' }]
        }
      }, 400)
    );

    try {
      await apiPut('/api/lessons/lesson_lkeep_008', {});
      expect.fail('expected ApiClientError');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).details).toEqual([
        { path: ['title'], message: 'Required' }
      ]);
    }
  });
});

describe('claiming initials on another computer', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const needCode = { ok: false, error: { code: 'need_code', message: 'BB is already in on another computer. Type your code to use this one too.' } };
  const wrongCode = { ok: false, error: { code: 'wrong_code', message: 'That code doesn’t match.' } };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sent = (n: number) => JSON.parse(String(fetchMock.mock.calls[n]![1]!.body));

  it('asks for the code and sends the same claim again with it, until it matches', async () => {
    fetchMock
      .mockResolvedValueOnce(mockFetchJson(needCode, 409))
      .mockResolvedValueOnce(mockFetchJson(wrongCode, 403))
      .mockResolvedValueOnce(mockFetchJson({ ok: true, data: { initials: 'BB' } }));
    const asked: Array<[string, boolean]> = [];
    const answers = ['nope-00', 'apple-42'];
    setCodePrompt(async (message, wrong) => {
      asked.push([message, wrong]);
      return answers.shift() ?? null;
    });
    const data = await apiPost<{ initials: string }>('/api/published/quiz/l1', { action: 'claim', initials: 'BB', class_id: 'c1' });
    expect(data.initials).toBe('BB');
    expect(asked).toEqual([[needCode.error.message, false], [wrongCode.error.message, true]]);
    expect(sent(2)).toEqual({ action: 'claim', initials: 'BB', class_id: 'c1', code: 'apple-42' });
  });

  it('closing the box leaves the original error for the page to show', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchJson(needCode, 409));
    setCodePrompt(async () => null);
    await expect(apiPost('/api/x', { action: 'claim', initials: 'BB' })).rejects.toMatchObject({ code: 'need_code' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('two claims at once share one box', async () => {
    fetchMock
      .mockResolvedValueOnce(mockFetchJson(needCode, 409))
      .mockResolvedValueOnce(mockFetchJson(needCode, 409))
      .mockResolvedValue(mockFetchJson({ ok: true, data: {} }));
    let opened = 0;
    setCodePrompt(async () => {
      opened += 1;
      await new Promise((r) => setTimeout(r, 5));
      return 'apple-42';
    });
    await Promise.all([apiPost('/api/a', { action: 'claim' }), apiPost('/api/b', { action: 'claim' })]);
    expect(opened).toBe(1);
  });
});
