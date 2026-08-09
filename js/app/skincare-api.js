function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function createSkincareApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  async function request(path, options) {
    const response = await fetchImpl(path, options);
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw httpError('Skincare request failed', response.status, payload?.error?.code ?? 'request_failed');
    }
    return payload.data ?? null;
  }

  return {
    async getLibrary() {
      const data = await request('/api/skincare/library');
      return data?.library ?? null;
    },

    async saveLibraryEntry({ name, id, notes }) {
      const data = await request('/api/skincare/library', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', name, id, notes })
      });
      return data?.library ?? null;
    },

    async getRoutines() {
      const data = await request('/api/skincare/routines');
      return data?.membership ?? null;
    },

    async addToRoutine({ routine, productId }) {
      const data = await request('/api/skincare/routines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'add', routine, product_id: productId })
      });
      return data?.membership ?? null;
    },

    async removeFromRoutine({ routine, productId }) {
      const data = await request('/api/skincare/routines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'remove', routine, product_id: productId })
      });
      return data?.membership ?? null;
    }
  };
}
