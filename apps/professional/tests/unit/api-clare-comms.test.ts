import { afterEach, describe, expect, it, vi } from 'vitest';
import { clareBrief, clareHandwriting } from '@/api/clare-comms';

describe('clare comms client', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('posts the action and context', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { points: [], owed_line: null } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await clareBrief({ title: 't', kind: 'comm', when: 'w', people: [], previous: [], open_promises: [], notes: '' });
    expect(String(fetch.mock.calls[0][0])).toContain('/api/clare/comms');
    expect(JSON.parse(fetch.mock.calls[0][1].body).action).toBe('brief');
  });
  it('sends handwriting as base64 without the data: prefix', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { text: 'hi' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await clareHandwriting(new File([new Uint8Array([1, 2, 3])], 'note.jpg', { type: 'image/jpeg' }));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.image).toEqual({ media_type: 'image/jpeg', data: 'AQID' });
  });
});
