import { apiGet, apiPost } from '@/api/client';
import type { PsAction, PsModelId, PsSession, PsSummary } from '../../../../../packages/problem-solver/types';

/** A session linked to a task or project: by its links, a confirmed task, or its review task. */
export type PsLinkedSession = { id: string; title: string; phase: string; model: PsModelId | null; role: 'link' | 'task' | 'review' };

export const problemSolverApi = {
  list: () => apiGet<{ sessions: PsSummary[] }>('/api/problem-solver?list=1').then((r) => r.sessions),
  get: (id: string) => apiGet<{ session: PsSession }>(`/api/problem-solver?id=${encodeURIComponent(id)}`).then((r) => r.session),
  create: (body: { text: string; title?: string; links?: PsSession['links']; kind?: 'full' | 'lightning' }) =>
    apiPost<{ session: PsSession }>('/api/problem-solver', { create: { ...body, requestId: crypto.randomUUID() } }).then((r) => r.session),
  act: (session: PsSession, action: PsAction, text?: string) =>
    apiPost<{ session: PsSession }>('/api/problem-solver', { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, ...(text ? { text } : {}) }).then((r) => r.session),
  /** An action with a JSON payload (task confirmations, review). */
  actWith: (session: PsSession, action: PsAction, payload: Record<string, unknown>) =>
    apiPost<{ session: PsSession }>('/api/problem-solver', { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, payload }).then((r) => r.session),
  /** Sessions linked to a task or project, for the chip on its page. */
  linked: (ref: string) =>
    apiGet<{ sessions: PsLinkedSession[] }>(`/api/problem-solver?linked=${encodeURIComponent(ref)}`).then((r) => r.sessions),
  /** Score a run (radar now; force field, decision matrix and Pareto later). */
  score: (session: PsSession, payload: Record<string, unknown> & { runId?: string }) =>
    apiPost<{ session: PsSession }>('/api/problem-solver', { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action: 'score', payload }).then((r) => r.session),
  /** Score the topics of the Gap analysis (advanced) radar; one 1 to 10 score per topic for each overlay. */
  rescore: (session: PsSession, payload: { current: number[]; objective: number[]; runId?: string }): Promise<PsSession> => problemSolverApi.score(session, payload)
};

export function isBusy(session: PsSession): boolean {
  return session.runner.status === 'queued' || session.runner.status === 'running';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll a session while the coach is thinking. Calls onUpdate with every snapshot, including the settled one. */
export async function pollUntilSettled(
  id: string,
  onUpdate: (session: PsSession) => void,
  { get = problemSolverApi.get, intervalMs = 400, signal }: { get?: (id: string) => Promise<PsSession>; intervalMs?: number; signal?: AbortSignal } = {}
): Promise<PsSession> {
  let delay = intervalMs;
  for (;;) {
    let session: PsSession;
    try {
      session = await get(id);
      delay = intervalMs;
    } catch (err) {
      if (signal?.aborted) throw new Error('aborted');
      delay = Math.min(delay * 2, 5000);
      await sleep(delay);
      continue;
    }
    if (signal?.aborted) throw new Error('aborted');
    onUpdate(session);
    if (!isBusy(session)) return session;
    await sleep(delay);
  }
}
