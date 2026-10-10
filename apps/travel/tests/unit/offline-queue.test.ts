import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __setJournalOpsStoreForTests,
  ackJournalOp,
  countPendingJournalOps,
  enqueueJournalOp,
  flushJournalOps,
  type JournalQueuedOp,
} from '@/journal/offline-queue';

interface JournalOpsStore {
  put(op: JournalQueuedOp): Promise<void>;
  get(id: string): Promise<JournalQueuedOp | undefined>;
  getAll(): Promise<JournalQueuedOp[]>;
  delete(id: string): Promise<void>;
}

function memoryStore(): JournalOpsStore {
  const map = new Map<string, JournalQueuedOp>();
  return {
    put: async (op) => {
      map.set(op.id, op);
    },
    get: async (id) => map.get(id),
    getAll: async () => [...map.values()],
    delete: async (id) => {
      map.delete(id);
    },
  };
}

const baseInput = {
  target_id: 'mom_test',
  base_revision: 3,
  action: 'patch_moment',
  payload: { title: 'Offline note' },
};

afterEach(() => {
  __setJournalOpsStoreForTests(null);
});

describe('journal offline queue', () => {
  it('enqueues ops with pending ack', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    const result = await enqueueJournalOp({ ...baseInput, id: 'jop_1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.op).toMatchObject({
      id: 'jop_1',
      target_id: 'mom_test',
      base_revision: 3,
      action: 'patch_moment',
      ack: { state: 'pending' },
    });
    expect(await countPendingJournalOps()).toBe(1);
  });

  it('flushes pending ops through sender and marks acked', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    await enqueueJournalOp({ ...baseInput, id: 'jop_a' });
    await enqueueJournalOp({ ...baseInput, id: 'jop_b', target_id: 'mom_two' });

    const sender = vi.fn(async (op: JournalQueuedOp) => ({
      state: 'acked' as const,
      server_version: `ver_${op.id}`,
    }));

    const outcome = await flushJournalOps(sender);
    expect(sender).toHaveBeenCalledTimes(2);
    expect(outcome.sent).toEqual(['jop_a', 'jop_b']);
    expect(await countPendingJournalOps()).toBe(0);
  });

  it('ack is idempotent for already-acked ops', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    await enqueueJournalOp({ ...baseInput, id: 'jop_ack' });
    const first = await ackJournalOp('jop_ack', { state: 'acked', server_version: 'v1' });
    const second = await ackJournalOp('jop_ack', { state: 'acked', server_version: 'v2' });
    expect(first?.ack.state).toBe('acked');
    expect(second?.ack.server_version).toBe('v1');

    const sender = vi.fn();
    const outcome = await flushJournalOps(sender);
    expect(sender).not.toHaveBeenCalled();
    expect(outcome.skipped).toEqual(['jop_ack']);
  });

  it('surfaces quota failure without implying backup succeeded', async () => {
    __setJournalOpsStoreForTests({
      put: async () => {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      },
      get: async () => undefined,
      getAll: async () => [],
      delete: async () => undefined,
    });

    const result = await enqueueJournalOp({ ...baseInput, id: 'jop_q' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.quota.kind).toBe('quota');
    expect(result.quota.message).toMatch(/not a server backup/i);
    const retry = await result.quota.retry();
    expect(retry.ok).toBe(false);
  });
});
