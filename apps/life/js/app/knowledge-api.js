function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function createKnowledgeApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async listPages() {
      const response = await fetchImpl('/api/knowledge/pages');
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Knowledge request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data ?? [];
    }
  };
}
