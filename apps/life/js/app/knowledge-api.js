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
    },
    async searchPages(query) {
      const response = await fetchImpl(`/api/knowledge/search?q=${encodeURIComponent(query)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Knowledge request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data?.hits ?? [];
    },
    async listBacklinks() {
      const response = await fetchImpl('/api/knowledge/backlinks');
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Knowledge request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      const data = payload.data ?? {};
      return {
        groups: Array.isArray(data.groups) ? data.groups : [],
        status: data.status === 'unavailable' ? 'unavailable' : 'ready'
      };
    },
    async listUrlWatches() {
      const response = await fetchImpl('/api/knowledge/url-watches');
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Knowledge request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      const data = payload.data ?? {};
      return {
        watches: Array.isArray(data.watches) ? data.watches : [],
        status: data.status === 'unavailable' ? 'unavailable' : 'ready'
      };
    }
  };
}
