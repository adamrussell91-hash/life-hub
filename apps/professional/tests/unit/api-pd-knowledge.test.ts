import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPdGroup, listPdGroups } from '@/api/pd-groups';
import { createKnowledgeNote } from '@/api/knowledge-notes';

function mockFetch(data: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('pd groups and knowledge notes clients', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists and creates PD groups', async () => {
    let fetch = mockFetch({ groups: [] });
    await listPdGroups();
    expect(String(fetch.mock.calls[0][0])).toContain('/api/pd-groups');
    fetch = mockFetch({ group: {} });
    await createPdGroup({ shape: 'series', title: 'Warlight', provider: 'Warlight' });
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('creates a Knowledge note in Notes with the talk tags', async () => {
    const fetch = mockFetch({ id: 'page_1', title: 'Keynote' });
    const page = await createKnowledgeNote({ title: 'Keynote · Reading against the grain', body: 'Dr Mia L. · Warlight 18/09/26', tags: ['pd', 'warlight'] });
    expect(String(fetch.mock.calls[0][0])).toContain('/api/knowledge/pages');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ title: 'Keynote · Reading against the grain', body: 'Dr Mia L. · Warlight 18/09/26', area: 'notes', tags: ['pd', 'warlight'] });
    expect(page.id).toBe('page_1');
  });
});
