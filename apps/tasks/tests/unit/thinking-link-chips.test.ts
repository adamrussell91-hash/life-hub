import { describe, expect, it, vi } from 'vitest';
import { thinkingChips, threadChip } from '../../src/views/problem-solver/link-chips';

const none = { linked: vi.fn().mockResolvedValue([]) };

describe('thinkingChips', () => {
  it('shows a chip per tool session, each opening in its own tool, and one thread chip per listed thread', async () => {
    const listed = { title: 'Choosing between two garden plots', sessions: [{ role: 'home' }, { role: 'detour' }] };
    // The thread lookup is the module's own API call; stub the network it uses.
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { thread: listed } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const host = thinkingChips({ kind: 'task', id: 't1' }, {
      ps: none, gt: none, cb: none, cm: none, qb: none, ch: none,
      dm: { linked: vi.fn().mockResolvedValue([{ id: 'd1', title: 'Pick a plot', phase: 'explore', model: null, role: 'link', threadId: 'th1' }]) },
      rb: { linked: vi.fn().mockResolvedValue([{ id: 'r1', title: 'Evening habit', phase: 'apply', model: null, role: 'task', threadId: 'th1' }]) }
    });
    await vi.waitFor(() => expect(host.hidden).toBe(false));
    const hrefs = [...host.querySelectorAll<HTMLAnchorElement>('a.ps-linkchip')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#/decision-maker?id=d1', '#/rules-book?id=r1', '#/think/th1']);
    expect(host.querySelector('.ps-linkchip--rb')?.textContent).toContain('Wayfinder: Evening habit');
    expect(host.querySelector('.ps-linkchip--thread')?.textContent).toContain('Thread: Choosing between two garden plots');
    vi.unstubAllGlobals();
  });
  it('stays hidden when no tool has a link, and a tool that fails is skipped', async () => {
    const host = thinkingChips({ kind: 'project', id: 'p1' }, { ps: { linked: vi.fn().mockRejectedValue(new Error('offline')) }, dm: none, gt: none, rb: none, ch: none, cb: none, cm: none, qb: none });
    await new Promise((r) => setTimeout(r, 10));
    expect(host.hidden).toBe(true);
  });
});

describe('threadChip', () => {
  it('is absent for a thread of one session', async () => {
    expect(await threadChip('quiet', async () => ({ title: 'x', sessions: [{ role: 'home' }] }))).toBeNull();
    expect(await threadChip('gone', () => Promise.reject(new Error('404')))).toBeNull();
  });
});
