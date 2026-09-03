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
    }
  };
}
