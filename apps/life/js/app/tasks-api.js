function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

async function readJson(fetchImpl, path) {
  const response = await fetchImpl(path);
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw httpError('Tasks request failed', response.status, payload?.error?.code ?? 'request_failed');
  }
  return payload;
}

export function createTasksApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async listTasks() {
      const payload = await readJson(fetchImpl, '/api/tasks');
      return payload.data?.tasks ?? [];
    },
    async listProjects() {
      const payload = await readJson(fetchImpl, '/api/projects');
      return payload.data?.projects ?? [];
    },
    async listWorkBlocks() {
      const payload = await readJson(fetchImpl, '/api/work-blocks');
      return payload.data?.work_blocks ?? [];
    },
    async getPlanningProfile() {
      const payload = await readJson(fetchImpl, '/api/planning-profile');
      return payload.data ?? null;
    },
    async getWorkflowState(id) {
      try {
        const payload = await readJson(
          fetchImpl,
          `/api/workflow-state?id=${encodeURIComponent(id)}`
        );
        return payload.data ?? null;
      } catch {
        return null;
      }
    },
    async loadStressFlags() {
      const payload = await readJson(fetchImpl, '/api/stress-flags');
      return payload.data?.flags ?? [];
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
