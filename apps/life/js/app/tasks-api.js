function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function createTasksApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async listTasks() {
      const response = await fetchImpl('/api/tasks');
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Tasks request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data?.tasks ?? [];
    },
    async listProjects() {
      const response = await fetchImpl('/api/projects');
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Tasks request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data?.projects ?? [];
    },
    async dumpWithClare({ text, domain = 'teaching', protocol_id } = {}) {
      const response = await fetchImpl('/api/clare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'dump', text, domain, protocol_id })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Clare dump failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data;
    },
    async briefWithClare(protocol_id = 'morning-sweep') {
      const response = await fetchImpl('/api/clare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'brief', protocol_id })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Clare brief failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data;
    }
  };
}
