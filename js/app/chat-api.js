export function createChatApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async *send(message, { signal } = {}) {
      const response = await fetchImpl('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
        signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw Object.assign(new Error('Chat request failed'), {
          status: response.status,
          code: payload?.error?.code ?? 'request_failed'
        });
      }
      if (!response.body) throw new Error('Chat response has no body');

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

    async confirm({ candidate, slug, overwrite = false }) {
      const response = await fetchImpl('/api/chat/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ candidate, slug, overwrite })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw Object.assign(new Error('Confirm request failed'), {
          status: response.status,
          code: payload?.error?.code ?? 'request_failed'
        });
      }
      return payload.data;
    }
  };
}
