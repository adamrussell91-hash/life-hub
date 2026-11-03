import { afterEach, describe, expect, it, vi } from 'vitest';
import { clareBrief, clareHandwriting, clareMinutes } from '@/api/clare-comms';

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

  const context = { title: 't', kind: 'meeting' as const, when: 'w', people: [], previous: [], open_promises: [], notes: '', agenda_headings: [] };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(status < 400 ? { ok: true, data } : { ok: false, error: data }), { status, headers: { 'content-type': 'application/json' } });
  const review = { sections: [{ heading: 'A', text: 'B' }], mine: [], others: [], unmatched: [], decisions: [], differences: [] };

  it('starts a minutes read, then asks until it is done, past a dropped check', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply({ job_id: 'job-1' }))
      .mockResolvedValueOnce(reply({ status: 'reading' }))
      .mockResolvedValueOnce(reply({ code: 'clare_failed', message: 'Blip' }, 502))
      .mockResolvedValueOnce(reply({ status: 'done', review }));
    vi.stubGlobal('fetch', fetch);
    await expect(clareMinutes(context, { text: 'Minutes' }, { pollMs: 1, waitMs: 1000 })).resolves.toEqual(review);
    const bodies = fetch.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies[0]).toMatchObject({ action: 'minutes_start', minutes: { text: 'Minutes' } });
    expect(bodies[3]).toEqual({ action: 'minutes_status', job_id: 'job-1' });
  });

  it('shows why a read failed', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply({ job_id: 'job-1' }))
      .mockResolvedValueOnce(reply({ status: 'failed', message: 'Clare could not finish: HTTP 529' }));
    vi.stubGlobal('fetch', fetch);
    await expect(clareMinutes(context, { text: 'Minutes' }, { pollMs: 1, waitMs: 1000 })).rejects.toThrow('HTTP 529');
  });

  it('stops asking once signed out', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply({ job_id: 'job-1' }))
      .mockResolvedValue(reply({ code: 'unauthenticated', message: 'Please sign in to continue.' }, 401));
    vi.stubGlobal('fetch', fetch);
    await expect(clareMinutes(context, { text: 'Minutes' }, { pollMs: 1, waitMs: 1000 })).rejects.toThrow('sign in');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up with a plain message when the read never finishes', async () => {
    const fetch = vi.fn().mockImplementation(async () => reply({ job_id: 'job-1', status: 'reading' }));
    vi.stubGlobal('fetch', fetch);
    await expect(clareMinutes(context, { text: 'Minutes' }, { pollMs: 1, waitMs: 20 })).rejects.toThrow('taking too long');
  });
});
