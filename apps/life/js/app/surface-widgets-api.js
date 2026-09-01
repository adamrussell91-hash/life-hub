export function createSurfaceWidgetsApi(fetchImpl = fetch) {
  return {
    async list() {
      const response = await fetchImpl('/api/surface/widgets', {
        method: 'GET',
        headers: { accept: 'application/json' }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        const error = new Error(payload?.error?.message ?? 'Surface widgets request failed');
        error.code = payload?.error?.code ?? 'request_failed';
        error.status = response.status;
        throw error;
      }
      return {
        widgets: Array.isArray(payload.data?.widgets) ? payload.data.widgets : []
      };
    }
  };
}
