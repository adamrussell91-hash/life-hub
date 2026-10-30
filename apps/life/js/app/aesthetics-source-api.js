/** Client for /api/aesthetics/source: the private fragrance library, style note and watch tracker. */
export function createAestheticsSourceApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');
  /** → { map, fragrances, styleNote, watches, watchSourceUrl, status }. Throws when the library can't be read. */
  return async function loadAestheticsSource() {
    const response = await fetchImpl('/api/aesthetics/source');
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw Object.assign(new Error('Aesthetics source request failed'), {
        status: response.status,
        code: payload?.error?.code ?? 'request_failed'
      });
    }
    const data = payload.data ?? {};
    if (data.status === 'unavailable') {
      throw Object.assign(new Error('Aesthetics source unavailable'), { status: 503, code: 'unavailable' });
    }
    return data;
  };
}
