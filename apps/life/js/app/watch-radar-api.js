function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

/** Client for /api/watch-radar: weekly shop readings and Adam's buy prices. */
export function createWatchRadarApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  async function request(path, options) {
    const response = await fetchImpl(path, options);
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw httpError('Watch radar request failed', response.status, payload?.error?.code ?? 'request_failed');
    }
    return payload.data ?? null;
  }

  return {
    /** → { readings: { [watchId]: reading }, targets: { [modelKey]: aud }, lastRun } */
    load() {
      return request('/api/watch-radar');
    },
    /** A null target clears it back to the default. */
    setTarget(key, target) {
      return request('/api/watch-radar', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, target })
      });
    }
  };
}
