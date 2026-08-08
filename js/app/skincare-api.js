function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function createSkincareApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  async function request(options) {
    const response = await fetchImpl('/api/skincare/catalog', options);
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw httpError('Skincare catalog request failed', response.status, payload?.error?.code ?? 'request_failed');
    }
    return payload.data?.catalog ?? null;
  }

  return {
    getCatalog() {
      return request();
    },

    appendProduct({ routine, name }) {
      return request({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'append', routine, name })
      });
    },

    retireProduct({ routine, name }) {
      return request({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'retire', routine, name })
      });
    }
  };
}
