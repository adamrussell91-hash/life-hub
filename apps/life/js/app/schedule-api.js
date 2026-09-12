function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

/** Optional authenticated fetch of Professional schedule projections. */
export function createScheduleApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async listScheduleProjections() {
      const response = await fetchImpl('/api/schedule-projections');
      const payload = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        return { projections: [], status: 'unauthenticated' };
      }
      if (!response.ok || payload?.ok !== true) {
        throw httpError(
          'Schedule projections request failed',
          response.status,
          payload?.error?.code ?? 'request_failed'
        );
      }
      return {
        projections: Array.isArray(payload.data?.projections) ? payload.data.projections : [],
        status: 'ok'
      };
    }
  };
}
