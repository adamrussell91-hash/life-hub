import { apiGet, apiPost } from '@/api/client';
import type { PsAction, PsModelId, PsSession, PsSummary } from '../../../../../packages/problem-solver/types';

/** A session linked to a task or project: by its links, a confirmed task, or its review task. */
export type PsLinkedSession = { id: string; title: string; phase: string; model: PsModelId | null; role: 'link' | 'task' | 'review' };

export type SessionApi = ReturnType<typeof createSessionApi>;

/**
 * The session API at `base` (`/api/problem-solver`, `/api/decision-book` for Decision Maker, or
 * `/api/get-things-done` for Gear Shifter): the tools share one handler, so every call is the
 * same apart from the path.
 */
export function createSessionApi(base: string) {
  const api = {
    list: () => apiGet<{ sessions: PsSummary[] }>(`${base}?list=1`).then((r) => r.sessions),
    get: (id: string) => apiGet<{ session: PsSession }>(`${base}?id=${encodeURIComponent(id)}`).then((r) => r.session),
    create: (body: { text: string; title?: string; links?: PsSession['links']; kind?: 'full' | 'lightning' | 'decision' | 'quick' | 'shift' | 'rules' | 'change' | 'collab' | 'talk' | 'start'; startModel?: string }) =>
      apiPost<{ session: PsSession }>(base, { create: { ...body, requestId: crypto.randomUUID() } }).then((r) => r.session),
    act: (session: PsSession, action: PsAction, text?: string) =>
      apiPost<{ session: PsSession }>(base, { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, ...(text ? { text } : {}) }).then((r) => r.session),
    /** An action with a JSON payload (task confirmations, review). */
    actWith: (session: PsSession, action: PsAction, payload: Record<string, unknown>) =>
      apiPost<{ session: PsSession }>(base, { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, payload }).then((r) => r.session),
    /** Sessions linked to a task or project, for the chip on its page. */
    linked: (ref: string) =>
      apiGet<{ sessions: PsLinkedSession[] }>(`${base}?linked=${encodeURIComponent(ref)}`).then((r) => r.sessions),
    /** Score a run (radar now; force field, decision matrix and Pareto later). */
    score: (session: PsSession, payload: Record<string, unknown> & { runId?: string }) =>
      apiPost<{ session: PsSession }>(base, { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action: 'score', payload }).then((r) => r.session),
    /** Score the topics of the Gap analysis (advanced) radar; one 1 to 10 score per topic for each overlay. */
    rescore: (session: PsSession, payload: { current: number[]; objective: number[]; runId?: string }): Promise<PsSession> => api.score(session, payload)
  };
  return api;
}

export const problemSolverApi = createSessionApi('/api/problem-solver');
/** Decision Maker's sessions: the same handler over its own store. */
export const decisionBookApi = createSessionApi('/api/decision-book');
/** Gear Shifter's sessions: the same handler over its own store. */
export const gearShifterApi = createSessionApi('/api/get-things-done');
/** The Rules Book's sessions: the same handler over its own store. */
export const rulesBookApi = createSessionApi('/api/rules-book');
/** The Change Book's sessions: the same handler over its own store. */
export const changeBookApi = createSessionApi('/api/change-book');
/** The Collaboration Book's sessions: the same handler over its own store. */
export const collaborationBookApi = createSessionApi('/api/collaboration-book');
/** The Communication Book's sessions: the same handler over its own store. */
export const communicationBookApi = createSessionApi('/api/communication-book');

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
