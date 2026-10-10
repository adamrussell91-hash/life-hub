import { afterEach, describe, expect, it } from 'vitest';
import { mountJournalOfflineStatus } from '@/journal/offline-status';
import {
  __setJournalOpsStoreForTests,
  enqueueJournalOp,
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

afterEach(() => {
  __setJournalOpsStoreForTests(null);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('mountJournalOfflineStatus', () => {
  it('stays hidden when online with no pending ops', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    const host = document.createElement('div');
    const cleanup = mountJournalOfflineStatus(host);
    await new Promise((r) => setTimeout(r, 0));
    expect((host.querySelector('.journal-offline-status') as HTMLElement | null)?.hidden).toBe(true);
    cleanup();
  });

  it('shows offline copy with pending count', async () => {
    __setJournalOpsStoreForTests(memoryStore());
    await enqueueJournalOp({
      id: 'jop_1',
      target_id: 'mom_a',
      base_revision: 1,
      action: 'patch',
      payload: {},
    });

    const host = document.createElement('div');
    const cleanup = mountJournalOfflineStatus(host);
    await new Promise((r) => setTimeout(r, 0));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));

    const row = host.querySelector<HTMLElement>('.journal-offline-status');
    expect(row?.hidden).toBe(false);
    expect(row?.textContent).toContain('Offline');
    expect(row?.textContent).toContain('1 edit waiting to sync');
    cleanup();
  });
});
