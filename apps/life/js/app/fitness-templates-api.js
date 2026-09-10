export function createFitnessTemplatesApi(fetchImpl = fetch) {
  return {
    async list() {
      const response = await fetchImpl('/api/fitness/templates', {
        method: 'GET',
        headers: { accept: 'application/json' }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        const error = new Error(payload?.error?.message ?? 'Templates request failed');
        error.code = payload?.error?.code ?? 'request_failed';
        error.status = response.status;
        throw error;
      }
      return {
        templates: Array.isArray(payload.data?.templates) ? payload.data.templates : [],
        libraryIndex: payload.data?.libraryIndex && typeof payload.data.libraryIndex === 'object'
          ? payload.data.libraryIndex
          : {}
      };
    }
  };
}
