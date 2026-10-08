function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function createPropertyApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  async function request(options) {
    const response = await fetchImpl('/api/property', options);
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw httpError(payload?.error?.message ?? 'Property request failed', response.status, payload?.error?.code ?? 'request_failed');
    }
    return payload.data ?? null;
  }

  const post = body => request({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  return {
    async getRecord() {
      return (await request())?.record ?? null;
    },
    async addEntry(entry) {
      return post({ action: 'add', entry });
    },
    async removeEntry(id) {
      return (await post({ action: 'remove', id }))?.record ?? null;
    },
    async saveSettings(patch) {
      return (await post({ action: 'settings', patch }))?.record ?? null;
    },
    async markLodged(fy) {
      return (await post({ action: 'lodged', fy }))?.record ?? null;
    }
  };
}
