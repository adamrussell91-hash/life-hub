import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask } from '@/api/universal-links';

function mockFetch(data: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('createTask', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('files under the teaching domain so /api/tasks accepts it', async () => {
    const fetch = mockFetch({ id: 'task_1', title: 'Send the agenda' });
    await createTask({ title: 'Send the agenda' });
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ domain: 'teaching', title: 'Send the agenda' });
  });

  it('keeps a domain the caller chose', async () => {
    const fetch = mockFetch({ id: 'task_1', title: 'x' });
    await createTask({ title: 'x', domain: 'life' });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).domain).toBe('life');
  });
});
