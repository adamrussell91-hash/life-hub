import { apiGet, apiPost } from '@/api/client';
import type { LedgerItem } from '@/domain/types';

export function listLedgerForSources(
  refs: string[],
  options: { signal?: AbortSignal } = {}
): Promise<{ items: LedgerItem[] }> {
  const params = new URLSearchParams({ source_refs: refs.join(',') });
  return apiGet(`/api/people/ledger?${params.toString()}`, { signal: options.signal });
}

export function createLedgerItem(
  body: {
    person_ref: string;
    direction: 'you_owe' | 'they_owe';
    text: string;
    comm_ref: string;
    due?: string | null;
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ item: LedgerItem; created: boolean }> {
  return apiPost('/api/people/ledger', { action: 'create', author: 'adam', ...body }, {
    signal: options.signal
  });
}

export function patchLedger(
  id: string,
  patch: {
    status?: LedgerItem['status'];
    due?: string | null;
    checked_in_ref?: string | null;
    task_ref?: string | null;
    text?: string;
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ item: LedgerItem }> {
  return apiPost('/api/people/ledger', { action: 'patch', id, ...patch }, { signal: options.signal });
}
