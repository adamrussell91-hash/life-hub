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
    async createTask({ title, domain = 'life' } = {}) {
      const response = await fetchImpl('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, domain })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Create task failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data;
    },
    async setTaskStatus(id, status) {
      const response = await fetchImpl(`/api/tasks?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Update task failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data;
    }
  };
}
