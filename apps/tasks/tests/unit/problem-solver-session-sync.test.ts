// apps/tasks/tests/unit/problem-solver-session-sync.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSessionSync } from '../../src/views/problem-solver/session-sync';
import type { PsSession } from '../../../../packages/problem-solver/types';

const at = (revision: number, status: PsSession['runner']['status'] = 'idle') =>
  ({ id: 's1', revision, runner: { status, mode: 'turn', error: null } }) as unknown as PsSession;
const conflict = () => Object.assign(new Error('changed'), { code: 'conflict', status: 409 });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

function setup(initial: PsSession, over: Partial<Parameters<typeof createSessionSync>[0]> = {}) {
  const render = vi.fn();
  const deps = {
    initial,
    render,
    actWith: vi.fn(async (s: PsSession) => at(s.revision + 1)),
    get: vi.fn(async () => at(initial.revision + 1)),
    poll: vi.fn(async (_id: string, onUpdate: (s: PsSession) => void) => {
      const settled = at(initial.revision + 1);
      onUpdate(settled);
      return settled;
    }),
    alive: () => true,
    ...over
  };
  return { sync: createSessionSync(deps), deps, render };
}

describe('session sync', () => {
  it('paint ignores an older snapshot of the same session', () => {
    const { sync, render } = setup(at(5));
    sync.paint(at(6));
    sync.paint(at(4));
    expect(sync.session().revision).toBe(6);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('confirmed waits while the coach is busy, then posts', async () => {
    const { sync, deps } = setup(at(3, 'running'));
    await sync.confirmed('confirm_task', { proposalId: 'p', taskId: 't' });
    expect(deps.poll).toHaveBeenCalledTimes(1);
    expect(deps.actWith).toHaveBeenCalledTimes(1);
    expect((deps.actWith.mock.calls[0] as unknown[])[0]).toMatchObject({ revision: 4 });
    expect(sync.session().revision).toBe(5);
  });

  it('a conflict refetches and retries exactly once', async () => {
    const actWith = vi.fn().mockRejectedValueOnce(conflict()).mockRejectedValueOnce(conflict()).mockResolvedValue(at(9));
    const { sync, deps } = setup(at(3), { actWith });
    await expect(sync.confirmed('dismiss_review', {})).rejects.toMatchObject({ code: 'conflict' });
    expect(actWith).toHaveBeenCalledTimes(2);
    expect(deps.get).toHaveBeenCalledTimes(1);
    expect((actWith.mock.calls[1] as unknown[])[0]).toMatchObject({ revision: 4 });
  });

  it('other errors pass straight on', async () => {
    const actWith = vi.fn().mockRejectedValue(Object.assign(new Error('That proposal was set aside.'), { code: 'action_not_allowed', status: 409 }));
    const { sync, deps } = setup(at(3), { actWith });
    await expect(sync.confirmed('confirm_task', {})).rejects.toThrow('set aside');
    expect(actWith).toHaveBeenCalledTimes(1);
    expect(deps.get).not.toHaveBeenCalled();
  });

  it('concurrent calls go one at a time, each with the revision the last one left', async () => {
    const first = deferred<PsSession>();
    const actWith = vi.fn().mockImplementationOnce(() => first.promise).mockImplementation(async (s: PsSession) => at(s.revision + 1));
    const { sync } = setup(at(3), { actWith });
    const a = sync.confirmed('confirm_task', { proposalId: 'a', taskId: 't1' });
    const b = sync.confirmed('confirm_task', { proposalId: 'b', taskId: 't2' });
    await Promise.resolve();
    await Promise.resolve();
    expect(actWith).toHaveBeenCalledTimes(1);
    first.resolve(at(4));
    await Promise.all([a, b]);
    expect(actWith).toHaveBeenCalledTimes(2);
    expect((actWith.mock.calls[1] as unknown[])[0]).toMatchObject({ revision: 4 });
  });

  it('a failed call does not block the queue', async () => {
    const actWith = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(at(4));
    const { sync } = setup(at(3), { actWith });
    await expect(sync.confirmed('confirm_task', {})).rejects.toThrow('offline');
    await sync.confirmed('confirm_task', {});
    expect(sync.session().revision).toBe(4);
  });

  it('stops waiting when the page has gone', async () => {
    const { sync } = setup(at(3, 'running'), { alive: () => false });
    await expect(sync.confirmed('confirm_task', {})).rejects.toThrow('closed');
  });
});
