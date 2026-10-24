// apps/teaching/tests/unit/sprint-api.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sprintClient, sprintTeacherApi } from '@/sprint/api';

afterEach(() => vi.unstubAllGlobals());
const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('sprint api', () => {
  it('posts student actions with the class fields', async () => {
    const fetch = vi.fn(async () => ok({ identity: { need: null, initials: 'AB' }, group: null }));
    vi.stubGlobal('fetch', fetch);
    await sprintClient('sp1', 'class1').save('sketch', { cards: [], strongest: '', strongest_why: '' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/published\/sprint\/sp1$/);
    expect(JSON.parse(String(init.body))).toMatchObject({ action: 'save', phase: 'sketch', class_id: 'class1' });
  });

  it('uploads as multipart and reads files as blobs, with no token in the URL', async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) =>
      init.body instanceof FormData ? ok({ id: 'aaaaaaaaaaaaaaaa', name: 'a.pdf', mime: 'application/pdf', size: 1, at: 'x', phase: 'prototype' }) : new Response(new Blob(['%PDF']), { status: 200, headers: { 'content-type': 'application/pdf' } })
    );
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x' }));
    const c = sprintClient('sp1', 'class1');
    const up = await c.upload('prototype', new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(up.id).toBe('aaaaaaaaaaaaaaaa');
    expect(await c.fileUrl(up.id)).toBe('blob:x');
    for (const [url] of fetch.mock.calls as unknown as [string][]) expect(url).not.toMatch(/token/);
  });

  it('posts teacher actions to the lesson', async () => {
    const fetch = vi.fn(async () => ok({ groups: [] }));
    vi.stubGlobal('fetch', fetch);
    await sprintTeacherApi('sp1').endClass('decide');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/lessons\/sp1\/sprint$/);
    expect(JSON.parse(String(init.body))).toEqual({ action: 'end_class', phase: 'decide' });
  });
});
