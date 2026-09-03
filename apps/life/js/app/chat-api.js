function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export const CHAT_EVENTS_POLL_MS = 400;

export function createChatApi(fetchImpl = fetch, { pollMs = CHAT_EVENTS_POLL_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async *send(message, { signal, history, priorAgentSlug, auditSession, protocolId } = {}) {
      const response = await fetchImpl('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          ...(history?.length ? { history } : {}),
          ...(priorAgentSlug ? { priorAgentSlug } : {}),
          ...(protocolId ? { protocolId } : {}),
          ...(auditSession ? { auditSession } : {})
        }),
        signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw httpError('Chat request failed', response.status, payload?.error?.code ?? 'request_failed');
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => null);
        const jobId = payload?.data?.jobId ?? payload?.jobId;
        if (typeof jobId !== 'string' || !jobId) {
          throw httpError('Chat request failed', response.status, payload?.error?.code ?? 'request_failed');
        }
        yield* pollJobEvents(fetchImpl, jobId, signal, pollMs);
        return;
      }
      if (!response.body) throw httpError('Chat response has no body', response.status, 'no_body');
      yield* readSse(response.body);
    },

    async confirm({ candidate, slug, overwrite = false, kind, id } = {}) {
      const response = await fetchImpl('/api/chat/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(candidate ? { candidate } : {}),
          slug,
          overwrite,
          ...(kind ? { kind } : {}),
          ...(id ? { id } : {})
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Confirm request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data;
    }
  };
}

async function* pollJobEvents(fetchImpl, jobId, signal, pollMs) {
  let after = 0;
  while (true) {
    const response = await fetchImpl(`/api/chat/events?job=${encodeURIComponent(jobId)}&after=${after}`, {
      method: 'GET',
      signal
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw httpError('Chat request failed', response.status, payload?.error?.code ?? 'request_failed');
    }
    const payload = await response.json().catch(() => null);
    const events = Array.isArray(payload?.data?.events) ? payload.data.events : [];
    for (const event of events) yield event;
    after = Number.isFinite(payload?.data?.next) ? payload.data.next : after + events.length;
    const status = payload?.data?.status;
    if (status === 'done' || status === 'error') return;
    await sleep(pollMs, signal);
  }
}

async function* readSse(body) {
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
      const line = frame.split('\n').find(candidate => candidate.startsWith('data:'));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(5).trim());
      } catch {
        // A malformed frame is skipped rather than breaking the stream.
      }
    }
  }
}

function sleep(ms, signal) {
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
