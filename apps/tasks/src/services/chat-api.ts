/**
 * Thin Tasks client for Life Hub /api/chat — same job/SSE contract as apps/life/js/app/chat-api.js.
 */
import { getApiBaseUrl } from '@/api/config';
import { ApiClientError } from '@/api/client';

export const CHAT_EVENTS_POLL_MS = 400;

function httpError(message: string, status: number, code: string): ApiClientError {
  return new ApiClientError({ code, message }, status);
}

export type ChatHistoryEntry = { role: 'user' | 'assistant'; content: string };

export type StreamChatOptions = {
  signal?: AbortSignal;
  history?: ChatHistoryEntry[];
  priorAgentSlug?: string;
  protocolId?: string;
};

export type ConfirmChatOptions = {
  kind?: string;
  id?: string;
  slug?: string;
  accept?: string[] | null;
  candidate?: unknown;
  overwrite?: boolean;
  reason?: string;
  revisit?: string;
};

async function* pollJobEvents(
  fetchImpl: typeof fetch,
  base: string,
  jobId: string,
  signal: AbortSignal | undefined,
  pollMs: number
): AsyncGenerator<Record<string, unknown>> {
  let after = 0;
  while (true) {
    const response = await fetchImpl(
      `${base}/api/chat/events?job=${encodeURIComponent(jobId)}&after=${after}`,
      { method: 'GET', credentials: 'include', signal }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw httpError(
        'Chat request failed',
        response.status,
        payload?.error?.code ?? 'request_failed'
      );
    }
    const payload = await response.json().catch(() => null);
    const events = Array.isArray(payload?.data?.events) ? payload.data.events : [];
    for (const event of events) yield event as Record<string, unknown>;
    after = Number.isFinite(payload?.data?.next) ? payload.data.next : after + events.length;
    const status = payload?.data?.status;
    if (status === 'done' || status === 'error') return;
    await sleep(pollMs, signal);
  }
}

async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const line = frame.split('\n').find((candidate) => candidate.startsWith('data:'));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(5).trim());
      } catch {
        // Skip malformed frames.
      }
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function createChatApi(
  fetchImpl: typeof fetch = fetch,
  { pollMs = CHAT_EVENTS_POLL_MS, baseUrl }: { pollMs?: number; baseUrl?: string } = {}
) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async *send(
      message: string,
      { signal, history, priorAgentSlug, protocolId }: StreamChatOptions = {}
    ): AsyncGenerator<Record<string, unknown>> {
      const base = baseUrl ?? getApiBaseUrl();
      const response = await fetchImpl(`${base}/api/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          ...(history?.length ? { history } : {}),
          ...(priorAgentSlug ? { priorAgentSlug } : {}),
          ...(protocolId ? { protocolId } : {})
        }),
        signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw httpError(
          'Chat request failed',
          response.status,
          payload?.error?.code ?? 'request_failed'
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => null);
        const jobId = payload?.data?.jobId ?? payload?.jobId;
        if (typeof jobId !== 'string' || !jobId) {
          throw httpError(
            'Chat request failed',
            response.status,
            payload?.error?.code ?? 'request_failed'
          );
        }
        yield* pollJobEvents(fetchImpl, base, jobId, signal, pollMs);
        return;
      }
      if (!response.body) {
        throw httpError('Chat response has no body', response.status, 'no_body');
      }
      yield* readSse(response.body);
    },

    async confirm({
      candidate,
      slug,
      overwrite = false,
      kind,
      id,
      accept,
      reason,
      revisit
    }: ConfirmChatOptions = {}) {
      const base = baseUrl ?? getApiBaseUrl();
      const response = await fetchImpl(`${base}/api/chat/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(candidate ? { candidate } : {}),
          slug,
          overwrite,
          ...(kind ? { kind } : {}),
          ...(id ? { id } : {}),
          ...(Array.isArray(accept) ? { accept } : {}),
          ...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
          ...(typeof revisit === 'string' && revisit.trim() ? { revisit: revisit.trim() } : {})
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError(
          'Confirm request failed',
          response.status,
          payload?.error?.code ?? 'request_failed'
        );
      }
      return payload.data;
    }
  };
}

const defaultApi = createChatApi();

/** POST /api/chat (+ events poll) — async iterable of stream events. */
export async function* streamChat(
  opts: { message: string } & StreamChatOptions
): AsyncGenerator<Record<string, unknown>> {
  yield* defaultApi.send(opts.message, opts);
}

/** POST /api/chat/confirm bound to a pending action id. */
export function confirmChat(opts: ConfirmChatOptions) {
  return defaultApi.confirm(opts);
}
