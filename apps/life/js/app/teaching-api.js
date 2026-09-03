function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function createTeachingApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async getCurriculum() {
      const response = await fetchImpl('/api/curriculum');
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw httpError('Teaching request failed', response.status, payload?.error?.code ?? 'request_failed');
      }
      return payload.data ?? null;
    }
  };
}
