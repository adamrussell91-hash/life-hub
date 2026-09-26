import { apiGet, apiPatch, apiPost } from '@/api/client';
import type { ThreadGoal, ThreadRecord } from '@/domain/types';

export function listThreads(options: { signal?: AbortSignal } = {}): Promise<{ threads: ThreadRecord[] }> {
  return apiGet('/api/threads', { signal: options.signal });
}

export function getThread(id: string, options: { signal?: AbortSignal } = {}): Promise<{ thread: ThreadRecord }> {
  return apiGet(`/api/threads?${new URLSearchParams({ id }).toString()}`, { signal: options.signal });
}

export function createThread(
  body: { kind: 'general' | 'case'; title: string; purpose_tag?: string | null },
  options: { signal?: AbortSignal } = {}
): Promise<{ thread: ThreadRecord }> {
  return apiPost('/api/threads', body, { signal: options.signal });
}

export function patchThread(
  id: string,
  patch: {
    kind?: 'general' | 'case';
    title?: string;
    purpose_tag?: string | null;
    goals?: ThreadGoal[];
    status?: 'open' | 'closed';
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ thread: ThreadRecord }> {
  return apiPatch(`/api/threads?${new URLSearchParams({ id }).toString()}`, patch, {
    signal: options.signal
  });
}
