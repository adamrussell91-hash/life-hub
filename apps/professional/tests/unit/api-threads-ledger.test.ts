import { afterEach, describe, expect, it, vi } from 'vitest';
import { listThreads, patchThread } from '@/api/threads';
import { createLedgerItem, listLedgerForSources } from '@/api/ledger';

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

describe('threads and ledger clients', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists threads', async () => {
    const fetch = mockFetch({ threads: [] });
    await listThreads();
    expect(String(fetch.mock.calls[0]![0])).toContain('/api/threads');
  });

  it('patches a thread by id', async () => {
    const fetch = mockFetch({ thread: {} });
    await patchThread('thread_00000000-0000-4000-8000-000000000001', { status: 'closed' });
    expect(String(fetch.mock.calls[0]![0])).toContain(
      '/api/threads?id=thread_00000000-0000-4000-8000-000000000001'
    );
    expect(fetch.mock.calls[0]![1].method).toBe('PATCH');
  });

  it('reads ledger items by source and creates with action create', async () => {
    const fetch = mockFetch({ items: [] });
    await listLedgerForSources(['professional:communication:communication_1']);
    expect(String(fetch.mock.calls[0]![0])).toContain(
      'source_refs=professional%3Acommunication%3Acommunication_1'
    );
    mockFetch({ item: {}, created: true });
    await createLedgerItem({
      person_ref: 'shared:person:p1',
      direction: 'you_owe',
      text: 'Quote bank',
      comm_ref: 'professional:communication:communication_1'
    });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body);
    expect(body.action).toBe('create');
  });
});
