import { describe, expect, it, vi } from 'vitest';
import { STALE_MESSAGE, withRevision } from '../../src/views/thinking/api';
import type { Thread } from '../../src/views/thinking/types';

const thread = (revision: number): Thread => ({
  id: 't1', revision, createdAt: '', updatedAt: '', title: 'x', situation: 'y', status: 'open', restUntil: null,
  digest: { facts: [], choices: [], restsOn: [], openQuestions: [] }, sessions: [], route: [], links: [], lastCheckAt: null
});
const conflict = () => Object.assign(new Error('changed elsewhere'), { code: 'conflict', status: 409 });

describe('withRevision', () => {
  it('sends the thread’s revision', async () => {
    const post = vi.fn().mockResolvedValue({ thread: thread(2) });
    await withRevision(thread(1), () => ({ action: 'patch' }), post, vi.fn());
    expect(post).toHaveBeenCalledWith({ id: 't1', revision: 1, action: 'patch' });
  });
  it('on a conflict reloads the thread and reapplies once', async () => {
    const post = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ thread: thread(5) });
    const load = vi.fn().mockResolvedValue(thread(4));
    const build = vi.fn((t: Thread) => ({ action: 'patch', title: `rev ${t.revision}` }));
    await withRevision(thread(1), build, post, load);
    expect(load).toHaveBeenCalledWith('t1');
    expect(post).toHaveBeenLastCalledWith({ id: 't1', revision: 4, action: 'patch', title: 'rev 4' });
    expect(post).toHaveBeenCalledTimes(2);
  });
  it('a second conflict becomes "updated elsewhere"; other errors pass straight through', async () => {
    const post = vi.fn().mockRejectedValue(conflict());
    await expect(withRevision(thread(1), () => ({}), post, vi.fn().mockResolvedValue(thread(2)))).rejects.toThrow(STALE_MESSAGE);
    expect(post).toHaveBeenCalledTimes(2);
    const other = vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { code: 'action_not_allowed', status: 409 }));
    await expect(withRevision(thread(1), () => ({}), other, vi.fn())).rejects.toThrow('nope');
    expect(other).toHaveBeenCalledTimes(1);
  });
});
