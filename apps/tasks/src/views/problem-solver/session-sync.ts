// apps/tasks/src/views/problem-solver/session-sync.ts
// The open session's one source of truth on the page: which snapshot is current, the
// coach poll, and the queue that task writes go through one at a time.
import type { PsAction, PsSession } from '../../../../../packages/problem-solver/types';
import { isBusy } from './api';

export type SessionSyncDeps = {
  initial: PsSession;
  /** Draw a snapshot; only called for snapshots at least as new as the current one. */
  render(session: PsSession): void;
  actWith(session: PsSession, action: PsAction, payload: Record<string, unknown>): Promise<PsSession>;
  get(id: string): Promise<PsSession>;
  /** Poll until the coach settles, calling onUpdate with every snapshot; rejects when aborted. */
  poll(id: string, onUpdate: (session: PsSession) => void): Promise<PsSession>;
  /** False once the page has gone, so a wait stops. */
  alive(): boolean;
};

export function createSessionSync(deps: SessionSyncDeps) {
  let current = deps.initial;
  let settling: Promise<void> | null = null;
  /** Task writes run one after another, so each posts the revision the last one left. */
  let queue: Promise<unknown> = Promise.resolve();

  /** Draw a snapshot unless it is older than the one on screen (a slow response landing late). */
  function paint(next: PsSession): boolean {
    if (next.id === current.id && next.revision < current.revision) return false;
    current = next;
    deps.render(next);
    return true;
  }

  /** One poll at a time: a second caller waits on the poll already running. */
  function settle(): Promise<void> {
    settling ??= (async () => {
      try {
        paint(await deps.poll(current.id, paint));
      } catch {
        /* aborted on navigation */
      } finally {
        settling = null;
      }
    })();
    return settling;
  }

  /** Run work after every earlier queued write has finished, whether it worked or not. */
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Post a task action once the coach has settled (Decision 10: a save during a coach turn
   * would lose that turn). A stale revision refetches and posts once more; any other error
   * is passed on so the card shows it.
   */
  function confirmed(action: PsAction, payload: Record<string, unknown>): Promise<void> {
    return enqueue(async () => {
      while (isBusy(current)) {
        if (!deps.alive()) throw new Error('Problem Solver was closed.');
        await settle();
      }
      let next: PsSession;
      try {
        next = await deps.actWith(current, action, payload);
      } catch (err) {
        if ((err as { code?: string }).code !== 'conflict') throw err;
        paint(await deps.get(current.id));
        next = await deps.actWith(current, action, payload);
      }
      paint(next);
    });
  }

  return { session: () => current, paint, settle, confirmed, enqueue };
}
