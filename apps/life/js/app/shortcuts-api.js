function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function createShortcutsApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async list() {
      const response = await fetchImpl('/api/shortcuts');
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Shortcuts request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return {
        catalog: payload.data?.catalog ?? [],
        promoted: payload.data?.promoted ?? []
      };
    },
    async run(proposedId, agentSlug) {
      const response = await fetchImpl('/api/shortcuts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposed_id: proposedId,
          ...(agentSlug ? { agent_slug: agentSlug } : {})
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Shortcuts request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data;
    }
  };
}
