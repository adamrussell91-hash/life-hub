function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function createChatApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async *send(message, { signal, history, priorAgentSlug, auditSession } = {}) {
      const response = await fetchImpl('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          ...(history?.length ? { history } : {}),
          ...(priorAgentSlug ? { priorAgentSlug } : {}),
          ...(auditSession ? { auditSession } : {})
        }),
        signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw httpError('Chat request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      if (!response.body) throw httpError('Chat response has no body', response.status, 'no_body');

      const reader = response.body.getReader();
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
    },

    async confirm({ candidate, slug, overwrite = false, kind } = {}) {
      const response = await fetchImpl('/api/chat/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          candidate,
          slug,
          overwrite,
          ...(kind ? { kind } : {})
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
