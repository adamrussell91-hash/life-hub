function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

async function unwrap(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw httpError('Hub map request failed', response.status, payload?.error?.code ?? 'request_failed');
  }
  return {
    map: payload.data.map,
    sha: payload.data.sha ?? null,
    seeded: payload.data.seeded === true
  };
}

export function createHubMapApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async load() {
      return unwrap(await fetchImpl('/api/hub-map'));
    },
    async save(map, baseSha) {
      return unwrap(await fetchImpl('/api/hub-map', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ map, baseSha: baseSha ?? null })
      }));
    }
  };
}
