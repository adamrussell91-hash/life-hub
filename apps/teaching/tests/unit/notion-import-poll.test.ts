import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForJob } from '@/teacher/notion-import/api';

// Real apiGet here: only fetch is stubbed, so the error codes are the ones apiRequest really produces.
const json = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });
const t = { now: 0 };
const opts = (extra = {}) => ({ intervalMs: 10, now: () => t.now, sleep: async (ms: number) => { t.now += ms; }, ...extra });

describe('waitForJob over a flaky network', () => {
  afterEach(() => { vi.unstubAllGlobals(); t.now = 0; });

  it('keeps polling through a failed fetch and an HTML 502', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(json({ id: 'nij_x', kind: 'plan', status: 'planned', page_id: 'p', updated_at: 'a' }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await waitForJob('nij_x', () => {}, opts())).status).toBe('planned');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('still treats a real 401 as fatal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: { code: 'unauthenticated', message: 'Please sign in to continue.', retryable: false } }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    ));
    vi.stubGlobal('fetch', fetchMock);
    await expect(waitForJob('nij_x', () => {}, opts())).rejects.toThrow('Please sign in to continue.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops polling when aborted', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => json({ id: 'nij_x', kind: 'plan', status: 'running', page_id: 'p', updated_at: String(t.now) }));
    vi.stubGlobal('fetch', fetchMock);
    const sleep = async () => { controller.abort(); };
    await expect(waitForJob('nij_x', () => {}, opts({ sleep, signal: controller.signal }))).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects at once on an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(waitForJob('nij_x', () => {}, opts({ signal: controller.signal }))).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
