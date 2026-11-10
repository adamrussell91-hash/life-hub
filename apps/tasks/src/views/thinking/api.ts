// apps/tasks/src/views/thinking/api.ts
// Typed calls to /api/thinking-threads and its guide. A write sends the thread's revision; a
// 409 carries the current thread, and the call is reapplied once on it (spec section 6).
import { apiGet, apiPost } from '@/api/client';
import type { CheckInRequest, DetourOpen, Joint, Landing, ProtocolDraft, SessionState, Thread, ThreadRow, ThreadStatus, Triage, Verdict } from './types';

const BASE = '/api/thinking-threads';
const GUIDE = '/api/thinking-threads/guide';

export const STALE_MESSAGE = 'This thread was updated elsewhere. Refresh to see the latest.';

/** True for a stale-revision refusal (the API's 409 `conflict`). */
export function isConflict(err: unknown): boolean {
  return (err as { code?: string })?.code === 'conflict';
}

type Post<T> = (body: Record<string, unknown>) => Promise<T>;

/**
 * Run a revision-checked write. `build(thread)` makes the body from the thread to write to. On
 * a conflict the current thread is fetched (the client does not keep a 409's body), the body is
 * rebuilt on it and sent once more. A second conflict is passed on as "updated elsewhere".
 */
export async function withRevision<T>(
  thread: Thread,
  build: (t: Thread) => Record<string, unknown>,
  post: Post<T> = (body) => apiPost<T>(BASE, body),
  load: (id: string) => Promise<Thread> = (id) => threadsApi.get(id)
): Promise<T> {
  try {
    return await post({ id: thread.id, revision: thread.revision, ...build(thread) });
  } catch (err) {
    if (!isConflict(err)) throw err;
    const current = await load(thread.id);
    try {
      return await post({ id: current.id, revision: current.revision, ...build(current) });
    } catch (again) {
      if (isConflict(again)) throw new Error(STALE_MESSAGE);
      throw again;
    }
  }
}

const write = (thread: Thread, body: Record<string, unknown>) => withRevision(thread, () => body).then((r) => (r as { thread: Thread }).thread);

export const threadsApi = {
  list: () => apiGet<{ threads: ThreadRow[] }>(`${BASE}?list=1`).then((r) => r.threads),
  get: (id: string) => apiGet<{ thread: Thread }>(`${BASE}?id=${encodeURIComponent(id)}`).then((r) => r.thread),
  create: (create: { situation: string; title?: string; home?: { kind: 'tool'; tool: string; sessionId: string } }) =>
    apiPost<{ thread: Thread }>(BASE, { create }).then((r) => r.thread),
  addSession: (thread: Thread, body: { kind: 'tool' | 'protocol'; tool: string; sessionId: string; role: 'home' | 'detour'; from?: { sessionId: string; stepId: string | null }; question?: string; questions?: unknown }) =>
    write(thread, { action: 'add_session', ...body }),
  patch: (thread: Thread, patch: { title?: string; status?: ThreadStatus; restUntil?: string | null }) => write(thread, { action: 'patch', ...patch }),
  setLanding: (thread: Thread, sessionId: string, landing: Landing) => write(thread, { action: 'set_landing', sessionId, landing }),
  setState: (thread: Thread, sessionId: string, state: SessionState) => write(thread, { action: 'set_state', sessionId, state }),
  handOver: (thread: Thread, sessionId: string) => write(thread, { action: 'hand_over', sessionId }),
  /** Land a Thought Starter detour: the ticked lines go back as its packet. */
  land: (thread: Thread, sessionId: string, record?: { lines: string[] }) => write(thread, { action: 'land', sessionId, ...(record ? { record } : {}) }),
  route: (thread: Thread, entry: { joint: Joint; optionId: string; reason?: string | null; outcome: 'taken' | 'not_now' | 'shown'; stepId?: string | null; sessionId?: string | null }) =>
    write(thread, { action: 'route', ...entry }),
  /** Start a detour in its tool (or a protocol run). The reply says where to open it. */
  detour: (thread: Thread, body: { fromSessionId: string; fromStepId: string | null; optionId: string; question: string; joint?: Joint; stepTitle?: string }) =>
    withRevision(thread, () => ({ action: 'detour', ...body })).then((r) => r as unknown as { thread: Thread; open: DetourOpen }),
  /** A protocol option: the draft intake only; nothing starts. */
  protocolDraft: (thread: Thread, body: { fromSessionId: string; fromStepId: string | null; optionId: string; question: string }) =>
    withRevision(thread, () => ({ action: 'detour', draftOnly: true, ...body })).then((r) => r as unknown as { thread: Thread; draft: ProtocolDraft })
};

export const guideApi = {
  triage: (situation: string, answer?: string) => apiPost<Triage>(GUIDE, { triage: { situation, ...(answer ? { answer } : {}) } }),
  checkIn: (request: CheckInRequest) => apiPost<Verdict>(GUIDE, { checkIn: request }),
  spend: () => apiGet<{ month: string; aud: number; calls: number }>(`${GUIDE}?spend=1`)
};
