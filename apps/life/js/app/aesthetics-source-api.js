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

/** Client for /api/aesthetics/notes: your own note on each fragrance record. */
export function createAestheticsNotesApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');
  async function call(init) {
    const response = await fetchImpl('/api/aesthetics/notes', init);
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw Object.assign(new Error(payload?.error?.message ?? 'Notes request failed'), {
        status: response.status,
        code: payload?.error?.code ?? 'request_failed'
      });
    }
    return payload.data ?? {};
  }
  return {
    /** → { [recordId]: { text, updatedAt } } */
    async load() { return (await call()).notes ?? {}; },
    /** Empty text clears the note. → the saved note, or null. */
    async save(id, text) {
      return (await call({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, text }) })).note ?? null;
    }
  };
}
